import type { FindCacheRecord, ScheduleChange, SourceManifest } from '../../../packages/domain/src/index.ts';
import type { SchedulePersistence } from './persistence.ts';
import {
  loadQuota,
  quotaAuthBlocked,
  quotaRecordAuthFailure,
  quotaTryConsume,
  type QuotaDeny,
  type QuotaFile,
  type QuotaGate,
  type QuotaLimits,
} from './quota-logic.ts';

type SqlValue = string | number | null | ArrayBuffer;

export interface SqlSession {
  exec(query: string, ...bindings: Array<string | number | null>): Array<Record<string, SqlValue>>;
}

export function sessionFrom(sql: {
  exec(query: string, ...bindings: Array<string | number | null>): Iterable<Record<string, SqlValue>>;
}): SqlSession {
  return {
    exec(query, ...bindings) {
      return [...sql.exec(query, ...bindings)];
    },
  };
}

export function ensureScheduleSchema(sql: SqlSession): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS snapshot (key TEXT PRIMARY KEY, body TEXT NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS document (name TEXT PRIMARY KEY, body TEXT NOT NULL)`);
}

export class SqliteScheduleStore implements SchedulePersistence {
  sql: SqlSession;

  constructor(sql: SqlSession) {
    this.sql = sql;
  }

  get(key: string): FindCacheRecord | null {
    const rows = this.sql.exec('SELECT body FROM snapshot WHERE key = ?', key);
    const body = rows[0]?.body;
    if (typeof body !== 'string') return null;
    return structuredClone(JSON.parse(body) as FindCacheRecord);
  }

  set(key: string, record: FindCacheRecord): void {
    this.sql.exec(
      'INSERT INTO snapshot (key, body) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body',
      key,
      JSON.stringify(record),
    );
  }

  readManifests(): SourceManifest[] {
    return this.readDocument<SourceManifest[]>('manifests', []);
  }

  writeManifests(manifests: readonly SourceManifest[]): void {
    this.writeDocument('manifests', manifests);
  }

  appendChanges(changes: readonly ScheduleChange[]): void {
    if (changes.length === 0) return;
    const prior = this.readDocument<ScheduleChange[]>('changes', []);
    this.writeDocument('changes', [...prior, ...changes]);
  }

  readChanges(): ScheduleChange[] {
    return this.readDocument<ScheduleChange[]>('changes', []);
  }

  readPolicy(key: string): string | null {
    const all = this.readDocument<Record<string, string>>('policy', {});
    return all[key] ?? null;
  }

  writePolicy(key: string, fingerprint: string): void {
    const all = this.readDocument<Record<string, string>>('policy', {});
    all[key] = fingerprint;
    this.writeDocument('policy', all);
  }

  readDocument<T>(name: string, fallback: T): T {
    const rows = this.sql.exec('SELECT body FROM document WHERE name = ?', name);
    const body = rows[0]?.body;
    if (typeof body !== 'string') return structuredClone(fallback);
    return JSON.parse(body) as T;
  }

  writeDocument(name: string, value: unknown): void {
    this.sql.exec(
      'INSERT INTO document (name, body) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET body = excluded.body',
      name,
      JSON.stringify(value),
    );
  }
}

export class SqliteQuotaBook implements QuotaGate {
  sql: SqlSession;
  limits: QuotaLimits;

  constructor(sql: SqlSession, limits: QuotaLimits) {
    this.sql = sql;
    this.limits = limits;
  }

  authBlocked(ip: string, now: Date): boolean {
    return quotaAuthBlocked(this.read(now), this.limits, ip);
  }

  recordAuthFailure(ip: string, now: Date): void {
    const file = this.read(now);
    quotaRecordAuthFailure(file, ip);
    this.write(file);
  }

  tryConsume(input: {
    uid: string;
    ip: string;
    now: Date;
    fresh: boolean;
    upstream: number;
  }): { ok: true } | { ok: false; code: QuotaDeny } {
    const file = this.read(input.now);
    const result = quotaTryConsume(file, this.limits, input);
    if (result.ok) this.write(file);
    return result;
  }

  snapshot(now: Date): QuotaFile {
    return structuredClone(this.read(now));
  }

  read(now: Date): QuotaFile {
    const store = new SqliteScheduleStore(this.sql);
    const existing = store.readDocument<QuotaFile | null>('quota', null);
    return loadQuota(existing, now);
  }

  write(file: QuotaFile): void {
    new SqliteScheduleStore(this.sql).writeDocument('quota', file);
  }
}
