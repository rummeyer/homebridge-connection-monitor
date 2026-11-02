import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { DEFAULTS, guessIcon, parseConfig } from '../src/config.ts';
import { parsePing, parseReply, pingArgs, pingPeriodMs } from '../src/probe.ts';
import type { Sample } from '../src/probe.ts';
import { points, quantile, summarize, thin } from '../src/series.ts';
import { parseTargets, rowsToSamples } from '../src/smokeping.ts';
import { Store } from '../src/store.ts';

test('ping\'s output: times sorted, a ping without a line lost, a duplicate counted once', () => {
  const out = [
    'PING 10.0.1.1 (10.0.1.1) 56(84) bytes of data.',
    '64 bytes from 10.0.1.1: icmp_seq=1 ttl=64 time=1.33 ms',
    '64 bytes from 10.0.1.1: icmp_seq=2 ttl=64 time=0.771 ms',
    '64 bytes from 10.0.1.1: icmp_seq=2 ttl=64 time=0.9 ms (DUP!)',
    '64 bytes from 10.0.1.1: icmp_seq=4 ttl=64 time=0.599 ms',
    '',
    '--- 10.0.1.1 ping statistics ---',
    '4 packets transmitted, 3 received, 25% packet loss, time 8102ms',
  ].join('\n');
  const router = parsePing(out, 'Router', 600, 60, 4);
  assert.deepEqual(router.rtts, [0.599, 0.771, 1.33]);
  assert.equal(router.loss, 0.25);
  assert.equal(router.median, 0.771);
  assert.deepEqual([router.target, router.t, router.step, router.sent], ['Router', 600, 60, 4]);
  const nothing = parsePing('PING 10.0.1.201 (10.0.1.201) 56(84) bytes of data.\n', 'NAS', 600, 60, 4);
  assert.deepEqual([nothing.loss, nothing.median, nothing.rtts], [1, null, []]);
});

test('an answer from macOS\'s and BusyBox\'s ping too, and one under a millisecond said as time<1', () => {
  assert.deepEqual(parseReply('64 bytes from 10.0.1.1: icmp_seq=0 ttl=64 time=3.017 ms'), { seq: 0, ms: 3.017 });
  assert.deepEqual(parseReply('64 bytes from 8.8.4.4: seq=3 ttl=117 time=12.4 ms'), { seq: 3, ms: 12.4 });
  assert.deepEqual(parseReply('64 bytes from 10.0.1.1: icmp_seq=7 ttl=64 time<1 ms'), { seq: 7, ms: 1 });
  assert.equal(parseReply('Request timeout for icmp_seq 5'), undefined);
});

test('pings spread over nine tenths of the step, each waited for as long as the period at most', () => {
  assert.equal(pingPeriodMs(60, 20), 2700);
  assert.equal(pingPeriodMs(300, 10), 27000);
  assert.equal(pingPeriodMs(10, 100), 200, 'no faster than ping allows without root');
  assert.deepEqual(pingArgs('10.0.1.1', 20, 2700, 'linux'), ['-n', '-c', '20', '-i', '2.7', '-W', '2', '10.0.1.1']);
  assert.deepEqual(pingArgs('10.0.1.1', 20, 2700, 'darwin'), ['-n', '-c', '20', '-i', '2.7', '-W', '2000', '10.0.1.1']);
});

test('quantiles between neighbours, and a summary thinned to its quantiles', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([], 0.5), null);
  const many = Array.from({ length: 101 }, (_, i) => i);
  assert.deepEqual(thin(many, 5), [0, 25, 50, 75, 100]);
  const s = summarize('R', [
    { target: 'R', t: 0, step: 60, sent: 10, loss: 0.1, median: 1, rtts: [1, 1, 1] },
    { target: 'R', t: 60, step: 60, sent: 10, loss: 0.3, median: 3, rtts: [3, 3, 3] },
  ], 0, 3600);
  assert.equal(s.loss, 0.2);
  assert.equal(s.sent, 20);
  assert.equal(s.median, 2);
});

test('a chart point is made of the finest samples there are, a gap where there are none', () => {
  const sample = (t: number, step: number, rtt: number): Sample => ({ target: 'R', t, step, sent: 2, loss: 0, median: rtt, rtts: [rtt, rtt] });
  // An hour from Smokeping over the whole stretch, and five minutes in its first half.
  const samples = [sample(0, 3600, 9), sample(0, 300, 1), sample(300, 300, 1), sample(600, 300, 1)];
  const chart = points(samples, 0, 3600 * 12, 24);
  assert.deepEqual(chart.slice(0, 4).map((p) => [p.median, p.step]), [[1, 300], [9, 3600], [null, null], [null, null]]);
  assert.equal(chart[0]!.smoke.length, 11);
  // Over two hours an hour is too long to say anything: a gap, not the hour.
  const short = points(samples, 0, 3600 * 2, 4);
  assert.deepEqual(short.map((p) => [p.median, p.step]), [[1, 300], [null, null], [null, null], [null, null]]);
});

test('Smokeping targets, with groups, and its archive rows as samples', () => {
  const targets = parseTargets(`*** Targets ***
probe = FPing
+ Router
menu = Router
title = My Router
host = 10.0.1.1
+ Remote
++ Google
host = 8.8.4.4 # the DNS
`);
  assert.deepEqual(targets, [
    { name: 'Router', host: '10.0.1.1', path: 'Router', title: 'My Router' },
    { name: 'Google', host: '8.8.4.4', path: 'Remote/Google' },
  ]);
  const csv = 'step,300\nt,uptime,loss,median,ping1,ping2,ping3,ping4\n600,1,1,0.002,0.001,0.002,0.003,\n900,,,,,,,\n1200,1,4,,,,,\n';
  const samples = rowsToSamples('Router', csv);
  assert.deepEqual(samples.map((s) => [s.t, s.step, s.loss, s.median, s.rtts]), [
    [300, 300, 0.25, 2, [1, 2, 3]],
    [900, 300, 1, null, []],
  ]);
});

test('rounds older than rawDays fold into their hour, replacing one from Smokeping', () => {
  const store = new Store(':memory:');
  const now = 100 * 86400;
  const old = 60 * 86400;
  store.add([
    { target: 'R', t: old, step: 3600, sent: 10, loss: 0, median: 50, rtts: [50] },
    { target: 'R', t: old, step: 60, sent: 10, loss: 0, median: 1, rtts: [1, 1] },
    { target: 'R', t: old + 60, step: 60, sent: 10, loss: 0.5, median: 3, rtts: [3] },
    { target: 'R', t: now - 60, step: 60, sent: 10, loss: 0, median: 2, rtts: [2] },
  ]);
  assert.equal(store.tidy(now, 30, 730), 2);
  const kept = store.range('R', 0, now);
  assert.deepEqual(kept.map((s) => [s.t, s.step, s.loss, s.median]), [[old, 3600, 0.25, 1], [now - 60, 60, 0, 2]]);
  store.close();
});

test('settings: defaults for what is missing, each target a name and an address, its icon guessed', () => {
  const { config, problems } = parseConfig({
    platform: 'ConnectionMonitor',
    targets: [{ name: 'NAS', host: '10.0.1.201' }, { name: 'Phone', host: '10.0.1.50', icon: 'router' }, { host: 'x' }],
    pings: 0,
  });
  assert.deepEqual(config.targets.map((t) => [t.name, t.host, t.icon]), [['NAS', '10.0.1.201', 'server'], ['Phone', '10.0.1.50', 'device']]);
  assert.deepEqual([config.pings, config.stepSeconds, config.port, config.dashboard], [20, 60, 8584, true]);
  assert.equal(problems.length, 1);
  assert.deepEqual(parseConfig({}).config.targets, [], 'no targets until some are set up');
  assert.equal(guessIcon('Internet', '8.8.4.4'), 'internet');
  assert.equal(guessIcon('Router', '10.0.1.1'), 'router');
});

test("the settings page's defaults are the plugin's", () => {
  const window: Record<string, any> = {};
  runInNewContext(readFileSync(new URL('../homebridge-ui/public/settings.js', import.meta.url), 'utf8'), { window });
  const { DEFAULTS: page } = window.ConnectionSettings;
  assert.deepEqual(
    [page.stepSeconds, page.pings, page.port, page.rawDays, page.keepDays],
    [DEFAULTS.stepSeconds, DEFAULTS.pings, DEFAULTS.port, DEFAULTS.rawDays, DEFAULTS.keepDays],
  );
});
