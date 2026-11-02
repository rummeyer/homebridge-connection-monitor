/**
 * The settings, from the platform's entry in Homebridge's config.json, every
 * one with a default so that a missing key still runs: the targets to ping,
 * how often and how many pings, the dashboard and its port, and how long
 * what is kept.
 */
import { join } from 'node:path';

export type TargetIcon = 'router' | 'internet' | 'server' | 'device';

/** How a target is in HomeKit, as Appliance Monitor offers its Running: or not at all. */
export type Shown = 'occupancy' | 'switch' | 'outlet' | 'none';
export const SHOWN: readonly Shown[] = ['occupancy', 'switch', 'outlet', 'none'];

export interface Target {
  /** What the dashboard calls it, and what its data is kept by. */
  name: string;
  host: string;
  /** The dashboard's icon, guessed from the name and address. */
  icon: TargetIcon;
  /** How HomeKit has it: occupied or on while it answers, or not at all. */
  homekit: Shown;
}

export interface Config {
  targets: Target[];
  /** Seconds between two rounds of pings. */
  stepSeconds: number;
  /** Pings per target and round, spread over most of the step. */
  pings: number;
  /** Whether the dashboard is served. */
  dashboard: boolean;
  port: number;
  /** Days each round is kept as it was measured, before it is folded into its hour. */
  rawDays: number;
  /** Days an hour is kept. */
  keepDays: number;
}

/** The package's folder, from src/ or dist/ alike. */
export const ROOT = join(import.meta.dirname, '..');

/** The plugin's folder in Homebridge's storage folder, as Appliance Monitor keeps its own. */
export const DATA_DIR = 'connection-monitor';

/** The SQLite file, in Homebridge's storage folder `storagePath`. */
export const databaseFile = (storagePath: string): string => join(storagePath, DATA_DIR, 'connection-monitor.db');

export const DEFAULTS: Config = {
  targets: [],
  stepSeconds: 60,
  pings: 20,
  dashboard: true,
  port: 8584,
  rawDays: 30,
  keepDays: 730,
};

function whole(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** A guess for a target without an icon: the gateway a router, anything outside the internet. */
export function guessIcon(name: string, host: string): TargetIcon {
  const text = `${name} ${host}`.toLowerCase();
  if (/router|gateway|fritz|\.1$/.test(text)) {
    return 'router';
  }
  if (/nas|server|diskstation|synology/.test(text)) {
    return 'server';
  }
  if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/.test(host)) {
    return 'internet';
  }
  return 'device';
}

/** Settings from the platform's raw JSON; what is missing or wrong takes its default, and is said in `problems`. */
export function parseConfig(raw: unknown): { config: Config; problems: string[] } {
  const problems: string[] = [];
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let targets = DEFAULTS.targets;
  if (input.targets !== undefined) {
    if (!Array.isArray(input.targets)) {
      problems.push('"targets" is not a list; using the default targets');
    } else {
      const seen = new Set<string>();
      targets = [];
      for (const entry of input.targets as Record<string, unknown>[]) {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        const host = typeof entry?.host === 'string' ? entry.host.trim() : '';
        if (!name || !host) {
          problems.push(`a target needs a name and a host: ${JSON.stringify(entry)}`);
          continue;
        }
        if (seen.has(name)) {
          problems.push(`target "${name}" is there twice; the second is left out`);
          continue;
        }
        seen.add(name);
        // 2.0.0 before its release had a tick box, `sensor`; unticked is none.
        const homekit = SHOWN.includes(entry.homekit as Shown) ? (entry.homekit as Shown) : entry.sensor === false ? 'none' : 'occupancy';
        targets.push({ name, host, icon: guessIcon(name, host), homekit });
      }
    }
  }
  const config: Config = {
    targets,
    stepSeconds: whole(input.stepSeconds, 10, 3600, DEFAULTS.stepSeconds),
    pings: whole(input.pings, 1, 100, DEFAULTS.pings),
    dashboard: input.dashboard !== false,
    port: whole(input.port, 1, 65535, DEFAULTS.port),
    rawDays: whole(input.rawDays, 1, 3650, DEFAULTS.rawDays),
    keepDays: whole(input.keepDays, 1, 36500, DEFAULTS.keepDays),
  };
  return { config, problems };
}
