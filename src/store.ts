/**
 * The samples, in SQLite (built into Node): every round as measured for
 * `rawDays`, then folded into its hour, the hours kept for `keepDays`.
 * Smokeping's history goes in beside them with its own steps — five
 * minutes, an hour, twelve hours — and the chart takes the finest there is.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as Database } from 'node:sqlite';

import type { Sample } from './probe.ts';
import { summarize } from './series.ts';

// node:sqlite says once, as it loads, that it is experimental; in Homebridge's
// log that reads as a fault of the plugin. Everything else is still said.
const { DatabaseSync } = await (async () => {
  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (!/SQLite is an experimental feature/.test(String(warning))) {
      (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
    }
  }) as typeof process.emitWarning;
  try {
    return await import('node:sqlite');
  } finally {
    process.emitWarning = emitWarning;
  }
})();

const HOUR = 3600;

/** A sample as a row: its times as JSON. */
type Row = Omit<Sample, 'rtts'> & { rtts: string };

const COLUMNS = 'target, t, step, sent, loss, median, rtts';

const toSample = (row: Row): Sample => ({ ...row, rtts: JSON.parse(row.rtts) as number[] });

export class Store {
  readonly #db: Database;

  constructor(file: string) {
    if (file !== ':memory:') {
      mkdirSync(dirname(file), { recursive: true });
    }
    this.#db = new DatabaseSync(file);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS samples (
        target TEXT NOT NULL,
        t INTEGER NOT NULL,
        step INTEGER NOT NULL,
        sent INTEGER NOT NULL,
        loss REAL NOT NULL,
        median REAL,
        rtts TEXT NOT NULL,
        PRIMARY KEY (target, step, t)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS samples_by_time ON samples (target, t);
    `);
  }

  close(): void {
    this.#db.close();
  }

  /** Samples in, replacing one of the same target, step and start. */
  add(samples: Sample[]): void {
    const insert = this.#db.prepare(
      `INSERT OR REPLACE INTO samples (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.#db.exec('BEGIN');
    try {
      for (const s of samples) {
        insert.run(s.target, s.t, s.step, s.sent, s.loss, s.median, JSON.stringify(s.rtts.map((v) => Math.round(v * 1000) / 1000)));
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /** A target's samples that reach into `from` to `to` (unix seconds), oldest first. */
  range(target: string, from: number, to: number): Sample[] {
    const rows = this.#db
      .prepare(`SELECT ${COLUMNS} FROM samples WHERE target = ? AND t < ? AND t + step > ? ORDER BY t`)
      .all(target, to, from) as unknown as Row[];
    return rows.map(toSample);
  }

  /** The newest round of a target: measured here, or Smokeping's last before the first one here. */
  latest(target: string): Sample | undefined {
    const row = this.#db
      .prepare(`SELECT ${COLUMNS} FROM samples WHERE target = ? AND step < ? ORDER BY t DESC, step LIMIT 1`)
      .get(target, HOUR) as unknown as Row | undefined;
    return row && toSample(row);
  }

  /** The oldest time anything is kept for, per target. */
  oldest(): Map<string, number> {
    const rows = this.#db.prepare('SELECT target, MIN(t) AS t FROM samples GROUP BY target').all() as { target: string; t: number }[];
    return new Map(rows.map((row) => [row.target, row.t]));
  }

  /**
   * Rounds older than `rawDays` folded into their hours — replacing an hour
   * Smokeping had, which they say more about — and hours older than
   * `keepDays` gone. Returns how many rounds were folded.
   */
  tidy(now: number, rawDays: number, keepDays: number): number {
    const before = Math.floor((now - rawDays * 86400) / HOUR) * HOUR;
    const old = this.#db
      .prepare(`SELECT ${COLUMNS} FROM samples WHERE step < ? AND t < ? ORDER BY target, t`)
      .all(HOUR, before) as unknown as Row[];
    const hours = new Map<string, Sample[]>();
    for (const sample of old.map(toSample)) {
      const key = `${sample.target}\u0000${Math.floor(sample.t / HOUR) * HOUR}`;
      const list = hours.get(key) ?? [];
      list.push(sample);
      hours.set(key, list);
    }
    const folded = [...hours].map(([key, samples]) => {
      const [target, hour] = key.split('\u0000');
      return summarize(target!, samples, Number(hour), HOUR);
    });
    this.add(folded);
    this.#db.prepare('DELETE FROM samples WHERE step < ? AND t < ?').run(HOUR, before);
    this.#db.prepare('DELETE FROM samples WHERE t + step < ?').run(now - keepDays * 86400);
    return old.length;
  }
}
