/**
 * One round of pings to every target, as Smokeping's FPing probe sends them:
 * so many pings per target spread over most of the step, each answer's
 * round-trip time kept. Sent by the system's own `ping`, one per target, all
 * at once — Node cannot send ICMP itself, and `ping` is there on every
 * system Homebridge runs on, allowed to ping without root:
 *
 *   64 bytes from 10.0.1.1: icmp_seq=1 ttl=64 time=0.771 ms
 *
 * A ping without an answer leaves no line, so what is lost is what was sent
 * less what came back.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import type { Config, Target } from './config.ts';

/** One target's round: what was sent, and the times of what came back. */
export interface Sample {
  target: string;
  /** Unix seconds: the start of the round. */
  t: number;
  /** Seconds the sample stands for: the step, or longer for a summary. */
  step: number;
  sent: number;
  /** The share of pings without an answer, 0 to 1. */
  loss: number;
  /** The median round-trip time in ms; none when nothing came back. */
  median: number | null;
  /** The round-trip times in ms, fastest first. */
  rtts: number[];
}

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** An answer in `ping`'s output: its sequence number and time in ms, from Linux's, macOS's or BusyBox's ping. */
const REPLY = /\b(?:icmp_)?seq=(\d+).*?time[=<]\s*([\d.]+)\s*ms/;

/** The answer a line of `ping`'s output tells of, if it does; a duplicate tells of none. */
export function parseReply(line: string): { seq: number; ms: number } | undefined {
  const match = REPLY.exec(line);
  if (!match || /DUP!/.test(line)) {
    return undefined;
  }
  return { seq: Number(match[1]), ms: Number(match[2]) };
}

/** A round's sample from `ping`'s output: each sequence number's first answer, out of `pings` sent. */
export function parsePing(output: string, target: string, t: number, step: number, pings: number): Sample {
  const bySeq = new Map<number, number>();
  for (const line of output.split('\n')) {
    const reply = parseReply(line);
    if (reply && !bySeq.has(reply.seq)) {
      bySeq.set(reply.seq, reply.ms);
    }
  }
  const rtts = [...bySeq.values()].slice(0, pings).sort((a, b) => a - b);
  return { target, t, step, sent: pings, loss: (pings - rtts.length) / pings, median: median(rtts), rtts };
}

/** The time between two pings to the same host, so that a round takes nine tenths of the step. */
export function pingPeriodMs(stepSeconds: number, pings: number): number {
  return Math.max(200, Math.floor((stepSeconds * 1000 * 0.9) / pings));
}

/**
 * `ping`'s arguments for a round: numeric, so many pings this far apart, each
 * waited for no longer than the period. macOS takes the wait in ms, Linux in
 * seconds, and only root may ping faster than every 0.2 s.
 */
export function pingArgs(host: string, pings: number, periodMs: number, platform = process.platform): string[] {
  const wait = Math.min(periodMs, 2000);
  const waitArg = platform === 'darwin' ? String(wait) : String(Math.max(1, Math.round(wait / 1000)));
  return ['-n', '-c', String(pings), '-i', String(periodMs / 1000), '-W', waitArg, host];
}

/**
 * The `ping` to use: the system's own, where every system Homebridge runs on
 * keeps it, so that a PATH without it, as under some service managers, does
 * not matter; `ping` from the PATH only if none of those is there.
 */
const PING_PATHS = ['/bin/ping', '/sbin/ping', '/usr/bin/ping', '/usr/sbin/ping'];
const PING = PING_PATHS.find((path) => existsSync(path)) ?? 'ping';

/**
 * One target's round. `onReply` hears of each answer as it comes, so that a
 * sensor can say a device is back without waiting for the round to end. A
 * host `ping` cannot resolve, or a `ping` that cannot run, comes back as all
 * lost, with why in `error`.
 */
export function pingTarget(
  target: Target,
  config: Pick<Config, 'stepSeconds' | 'pings'>,
  t: number,
  onReply?: (ms: number) => void,
): Promise<Sample & { error?: string }> {
  const period = pingPeriodMs(config.stepSeconds, config.pings);
  return new Promise((resolve) => {
    let output = '';
    let errors = '';
    let pending = '';
    const child = spawn(PING, pingArgs(target.host, config.pings, period), { stdio: ['ignore', 'pipe', 'pipe'] });
    // Longer than the step only if something is wrong: the next round must not wait for it.
    const timer = setTimeout(() => child.kill(), config.stepSeconds * 1000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop()!;
      for (const line of lines) {
        const reply = parseReply(line);
        if (reply) {
          onReply?.(reply.ms);
        }
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors += chunk;
    });
    let finished = false;
    // A ping that cannot run says so twice, as an error and as it closes: the first is the one.
    const done = (error?: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      const sample = parsePing(output, target.name, t, config.stepSeconds, config.pings);
      resolve(error && sample.rtts.length === 0 ? { ...sample, error } : sample);
    };
    child.on('error', (error) => done(`ping could not run: ${error.message}`));
    // ping exits with 1 when an answer was missing, 2 on an error such as an unknown host.
    child.on('close', (code) => done(code === 2 ? errors.trim().split('\n')[0] || 'ping failed' : undefined));
  });
}

/** Pings every target at once. */
export function probe(
  config: Config,
  t: number,
  onReply?: (target: Target, ms: number) => void,
): Promise<(Sample & { error?: string })[]> {
  return Promise.all(config.targets.map((target) => pingTarget(target, config, t, onReply && ((ms) => onReply(target, ms)))));
}
