#!/usr/bin/env node
/**
 * connection-monitor-import — Smokeping's history into the store, run on the
 * machine Smokeping runs on, as the user Homebridge runs as:
 *
 *   connection-monitor-import [--targets /etc/smokeping/config.d/Targets]
 *     [--data /var/lib/smokeping] [--storage /var/lib/homebridge]
 *
 * Each of its targets is taken over under the same name, to be added to the
 * plugin's settings with that name and host. Run again, it replaces what it
 * took before; what was measured since is left as it is.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { databaseFile } from './config.ts';
import { parseTargets, readRrd } from './smokeping.ts';
import { Store } from './store.ts';

const { values } = parseArgs({
  options: {
    targets: { type: 'string', default: '/etc/smokeping/config.d/Targets' },
    data: { type: 'string', default: '/var/lib/smokeping' },
    storage: { type: 'string', default: '/var/lib/homebridge' },
  },
});

const targets = parseTargets(readFileSync(values.targets!, 'utf8'));
if (targets.length === 0) {
  console.error(`No targets with a host in ${values.targets}.`);
  process.exit(1);
}

const file = databaseFile(values.storage!);
const store = new Store(file);
for (const target of targets) {
  const samples = readRrd(values.data!, target);
  store.add(samples);
  const steps = [...new Set(samples.map((sample) => sample.step))].map((step) => `${samples.filter((s) => s.step === step).length} × ${step / 60} min`);
  const from = samples.length ? new Date(Math.min(...samples.map((s) => s.t)) * 1000).toISOString().slice(0, 10) : '–';
  console.log(`${target.name} (${target.host}): ${steps.join(', ')}, since ${from}`);
}
store.close();
console.log(`\nInto ${file}. Add the targets in the plugin's settings by these names to measure and see them.`);
