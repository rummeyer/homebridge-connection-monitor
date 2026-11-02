/**
 * The platform: pings every target each step and keeps what came back,
 * tidies once an hour, serves the dashboard, and gives each target with a
 * sensor an accessory in HomeKit.
 */
import type { Server } from 'node:http';

import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';

import { TargetAccessory } from './accessory.ts';
import { databaseFile, parseConfig } from './config.ts';
import type { Config, Target } from './config.ts';
import { probe } from './probe.ts';
import { startServer } from './server.ts';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.ts';
import { Store } from './store.ts';

export class ConnectionMonitorPlatform implements DynamicPlatformPlugin {
  readonly #log: Logging;
  readonly #api: API;
  readonly #config: Config;
  readonly #problems: string[];
  readonly #cached = new Map<string, PlatformAccessory>();
  readonly #sensors = new Map<string, TargetAccessory>();
  /** Whether each target answered, as last logged. */
  readonly #answers = new Map<string, boolean>();
  /** Why each target's last round failed, so that each reason is logged once. */
  readonly #errors = new Map<string, string | undefined>();
  #store: Store | undefined;
  #server: Server | undefined;
  #timers: NodeJS.Timeout[] = [];
  #running = false;

  constructor(log: Logging, raw: PlatformConfig, api: API) {
    this.#log = log;
    this.#api = api;
    const { config, problems } = parseConfig(raw);
    this.#config = config;
    this.#problems = problems;
    for (const problem of problems) {
      log.warn(`Settings: ${problem}`);
    }
    api.on('didFinishLaunching', () => this.#launch());
    api.on('shutdown', () => this.#stop());
  }

  /** Homebridge replays cached accessories here before `didFinishLaunching`. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.#cached.set(accessory.UUID, accessory);
  }

  #launch(): void {
    const config = this.#config;
    this.#syncAccessories();
    if (!config.targets.length) {
      this.#log.warn('No targets set up yet: add one in the settings');
      return;
    }
    const file = databaseFile(this.#api.user.storagePath());
    try {
      this.#store = new Store(file);
    } catch (error) {
      this.#log.error(`Cannot open ${file}: ${(error as Error).message}`);
      return;
    }
    if (config.dashboard) {
      this.#server = startServer(config, this.#store, this.#problems, (error) => {
        this.#log.error(`Dashboard: port ${config.port} cannot be used (${error.message}); running on without it`);
      });
      this.#server.once('listening', () => this.#log.info(`Dashboard on port ${config.port}`));
    }
    this.#log.info(`${config.targets.map((t) => `${t.name} (${t.host})`).join(', ')}: ${config.pings} pings every ${config.stepSeconds} s`);

    // Rounds on the step's boundaries, as Smokeping's, so that they line up with its history.
    const step = config.stepSeconds * 1000;
    this.#timers.push(setTimeout(() => {
      void this.#round();
      this.#timers.push(setInterval(() => void this.#round(), step));
    }, step - (Date.now() % step)));
    // A first look straight away, so that the sensors need not wait for the first boundary.
    void this.#round(false);
    this.#tidy();
    this.#timers.push(setInterval(() => this.#tidy(), 3600_000));
  }

  /** An accessory per target with a sensor; the others' and those of targets gone are removed. */
  #syncAccessories(): void {
    const keep = new Set<string>();
    for (const target of this.#config.targets.filter((t) => t.sensor)) {
      const uuid = this.#api.hap.uuid.generate(`${PLUGIN_NAME}:${target.name}`);
      keep.add(uuid);
      let accessory = this.#cached.get(uuid);
      if (!accessory) {
        accessory = new this.#api.platformAccessory(target.name, uuid);
        this.#api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      this.#sensors.set(target.name, new TargetAccessory(this.#api, accessory, target));
    }
    const gone = [...this.#cached.values()].filter((accessory) => !keep.has(accessory.UUID));
    if (gone.length) {
      this.#api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, gone);
    }
  }

  /**
   * A round, unless the last one is still going. A target answering sets its
   * sensor at once; one that answered nothing all round clears it. Kept only
   * on the step's boundaries: the first look at launch is for the sensors.
   */
  async #round(keep = true): Promise<void> {
    if (this.#running) {
      return;
    }
    this.#running = true;
    try {
      const t = Math.floor(Date.now() / 1000 / this.#config.stepSeconds) * this.#config.stepSeconds;
      const samples = await probe(this.#config, t, (target) => this.#answered(target, true));
      for (const [index, sample] of samples.entries()) {
        const target = this.#config.targets[index]!;
        this.#answered(target, sample.rtts.length > 0);
        if (sample.error !== this.#errors.get(target.name)) {
          if (sample.error) {
            this.#log.warn(`${target.name} (${target.host}): ${sample.error}`);
          }
          this.#errors.set(target.name, sample.error);
        }
      }
      if (keep) {
        this.#store?.add(samples.map(({ error: _error, ...sample }) => sample));
      }
    } catch (error) {
      this.#log.error(`Round failed: ${(error as Error).message}`);
    } finally {
      this.#running = false;
    }
  }

  /** Whether a target answers, logged when it changes. */
  #answered(target: Target, answers: boolean): void {
    const before = this.#answers.get(target.name);
    if (before === answers) {
      return;
    }
    if (before !== undefined || !answers) {
      this.#log.info(`${target.name} ${answers ? 'answers again' : 'does not answer'}`);
    }
    this.#answers.set(target.name, answers);
    this.#sensors.get(target.name)?.set(answers);
  }

  #tidy(): void {
    try {
      const folded = this.#store?.tidy(Math.floor(Date.now() / 1000), this.#config.rawDays, this.#config.keepDays);
      if (folded) {
        this.#log.debug(`Folded ${folded} rounds older than ${this.#config.rawDays} days into hours`);
      }
    } catch (error) {
      this.#log.error(`Tidying failed: ${(error as Error).message}`);
    }
  }

  #stop(): void {
    for (const timer of this.#timers) {
      clearTimeout(timer);
    }
    this.#server?.close();
    // A round still going finds nothing to keep its samples in.
    const store = this.#store;
    this.#store = undefined;
    store?.close();
  }
}
