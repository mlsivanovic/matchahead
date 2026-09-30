import { isFirebaseInstallationId } from './ids.ts';
import { nextRateBucket, type RateBucket } from './rate.ts';

export const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
export const DIRECTORY_NAME = 'matchahead-push-probe';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class DirectoryUnavailable extends Error {
  constructor() {
    super('directory_unavailable');
    this.name = 'DirectoryUnavailable';
  }
}

export interface StoredRegistration {
  registrationId: string;
  fid: string;
  followedTeamId: string | null;
  opponentLabel: string | null;
  selfSendKeyHashB64: string;
  createdAtMs: number;
}

export interface ProbeDirectory {
  health(): Promise<boolean>;
  save(registration: StoredRegistration): Promise<void>;
  read(id: string, nowMs: number): Promise<StoredRegistration | null>;
  remove(id: string): Promise<void>;
  take(key: string, nowMs: number, limit: number, windowMs: number): Promise<boolean>;
}

export interface ProbeDirectoryNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

type SqlValue = string | number | null | ArrayBuffer;

export interface SqlSession {
  exec(query: string, ...bindings: Array<string | number | null>): Array<Record<string, SqlValue>>;
}

interface DirectoryStub {
  fetch(request: Request): Promise<Response>;
}

function optionalLabel(value: string | null): boolean {
  if (value === null) return true;
  return value.length > 0 && value.length <= 80 && !/[\r\n\u0000]/.test(value);
}

export function registrationValid(value: StoredRegistration): boolean {
  if (typeof value.registrationId !== 'string' || !UUID_PATTERN.test(value.registrationId)) return false;
  if (!isFirebaseInstallationId(value.fid)) return false;
  if (typeof value.selfSendKeyHashB64 !== 'string' || !HASH_PATTERN.test(value.selfSendKeyHashB64)) return false;
  if (!Number.isFinite(value.createdAtMs) || value.createdAtMs < 0) return false;
  if (!optionalLabel(value.followedTeamId) || !optionalLabel(value.opponentLabel)) return false;
  return true;
}

export function ensureDirectorySchema(sql: SqlSession): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS registration (
    id TEXT PRIMARY KEY,
    fid TEXT NOT NULL,
    followed_team_id TEXT,
    opponent_label TEXT,
    key_hash TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS rate_bucket (
    bucket_key TEXT PRIMARY KEY,
    window_start_ms INTEGER NOT NULL,
    count INTEGER NOT NULL
  )`);
}

function rowToRegistration(row: Record<string, SqlValue>): StoredRegistration {
  return {
    registrationId: String(row.id),
    fid: String(row.fid),
    followedTeamId: row.followed_team_id === null ? null : String(row.followed_team_id),
    opponentLabel: row.opponent_label === null ? null : String(row.opponent_label),
    selfSendKeyHashB64: String(row.key_hash),
    createdAtMs: Number(row.created_at_ms),
  };
}

function saveRegistration(sql: SqlSession, registration: StoredRegistration): void {
  if (!registrationValid(registration)) throw new DirectoryUnavailable();
  sql.exec(
    `INSERT INTO registration (id, fid, followed_team_id, opponent_label, key_hash, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
    registration.registrationId,
    registration.fid,
    registration.followedTeamId,
    registration.opponentLabel,
    registration.selfSendKeyHashB64,
    registration.createdAtMs,
  );
}

function readRegistration(sql: SqlSession, id: string, nowMs: number): StoredRegistration | null {
  if (!UUID_PATTERN.test(id) || !Number.isFinite(nowMs)) return null;
  const rows = sql.exec(
    `SELECT id, fid, followed_team_id, opponent_label, key_hash, created_at_ms
     FROM registration WHERE id = ?`,
    id,
  );
  const row = rows[0];
  if (!row) return null;
  const registration = rowToRegistration(row);
  if (registration.createdAtMs + REGISTRATION_TTL_MS <= nowMs) {
    sql.exec('DELETE FROM registration WHERE id = ?', id);
    return null;
  }
  return registration;
}

function removeRegistration(sql: SqlSession, id: string): void {
  if (!UUID_PATTERN.test(id)) return;
  sql.exec('DELETE FROM registration WHERE id = ?', id);
}

function takeSqlLimit(sql: SqlSession, key: string, nowMs: number, limit: number, windowMs: number): boolean {
  if (key.length < 1 || key.length > 120 || !Number.isFinite(nowMs) || limit < 1 || windowMs < 1) return false;
  const rows = sql.exec('SELECT window_start_ms, count FROM rate_bucket WHERE bucket_key = ?', key);
  const row = rows[0];
  const existing: RateBucket | undefined = row
    ? { windowStartMs: Number(row.window_start_ms), count: Number(row.count) }
    : undefined;
  const decision = nextRateBucket(existing, nowMs, limit, windowMs);
  if (!decision.allow) return false;
  sql.exec(
    `INSERT INTO rate_bucket (bucket_key, window_start_ms, count) VALUES (?, ?, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       window_start_ms = excluded.window_start_ms,
       count = excluded.count`,
    key,
    decision.bucket.windowStartMs,
    decision.bucket.count,
  );
  return true;
}

function asRegistration(value: unknown): StoredRegistration | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const followed = record.followedTeamId;
  const opponent = record.opponentLabel;
  const registration: StoredRegistration = {
    registrationId: typeof record.registrationId === 'string' ? record.registrationId : '',
    fid: typeof record.fid === 'string' ? record.fid : '',
    followedTeamId: followed === null ? null : typeof followed === 'string' ? followed : '',
    opponentLabel: opponent === null ? null : typeof opponent === 'string' ? opponent : '',
    selfSendKeyHashB64: typeof record.selfSendKeyHashB64 === 'string' ? record.selfSendKeyHashB64 : '',
    createdAtMs: typeof record.createdAtMs === 'number' ? record.createdAtMs : Number.NaN,
  };
  return registrationValid(registration) ? registration : null;
}

export async function handleDirectoryRequest(sql: SqlSession, request: Request): Promise<Response> {
  ensureDirectorySchema(sql);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  try {
    if (record.op === 'health') return Response.json({ ok: true });
    if (record.op === 'save') {
      const registration = asRegistration(record.registration);
      if (!registration) throw new DirectoryUnavailable();
      saveRegistration(sql, registration);
      return Response.json({ ok: true });
    }
    if (record.op === 'read' && typeof record.id === 'string' && typeof record.nowMs === 'number') {
      return Response.json({ ok: true, registration: readRegistration(sql, record.id, record.nowMs) });
    }
    if (record.op === 'remove' && typeof record.id === 'string') {
      removeRegistration(sql, record.id);
      return Response.json({ ok: true });
    }
    if (
      record.op === 'take'
      && typeof record.key === 'string'
      && typeof record.nowMs === 'number'
      && typeof record.limit === 'number'
      && typeof record.windowMs === 'number'
    ) {
      return Response.json({
        ok: true,
        allow: takeSqlLimit(sql, record.key, record.nowMs, record.limit, record.windowMs),
      });
    }
    return Response.json({ error: 'invalid_op' }, { status: 400 });
  } catch (error) {
    if (error instanceof DirectoryUnavailable) {
      return Response.json({ error: 'rejected' }, { status: 400 });
    }
    return Response.json({ error: 'directory_failed' }, { status: 500 });
  }
}

async function callDirectory(stub: DirectoryStub, payload: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await stub.fetch(new Request('https://probe-directory.internal/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
  } catch {
    throw new DirectoryUnavailable();
  }
  if (!response.ok) throw new DirectoryUnavailable();
  const parsed = await response.json() as Record<string, unknown>;
  if (parsed.ok !== true) throw new DirectoryUnavailable();
  return parsed;
}

export function remoteProbeDirectory(namespace: ProbeDirectoryNamespace): ProbeDirectory {
  const stub = namespace.get(namespace.idFromName(DIRECTORY_NAME));
  return {
    async health() {
      await callDirectory(stub, { op: 'health' });
      return true;
    },
    async save(registration) {
      await callDirectory(stub, { op: 'save', registration });
    },
    async read(id, nowMs) {
      const parsed = await callDirectory(stub, { op: 'read', id, nowMs });
      if (parsed.registration === null || parsed.registration === undefined) return null;
      return parsed.registration as StoredRegistration;
    },
    async remove(id) {
      await callDirectory(stub, { op: 'remove', id });
    },
    async take(key, nowMs, limit, windowMs) {
      const parsed = await callDirectory(stub, { op: 'take', key, nowMs, limit, windowMs });
      return parsed.allow === true;
    },
  };
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

/** Test dvostrukost. Produkcija ide kroz ProbeDirectoryObject, ne kroz ovu mapu. */
export function createMemoryDirectory(): ProbeDirectory {
  const registrations = new Map<string, StoredRegistration>();
  const buckets = new Map<string, RateBucket>();
  return {
    async health() {
      return true;
    },
    async save(registration) {
      if (!registrationValid(registration)) throw new DirectoryUnavailable();
      registrations.set(registration.registrationId, { ...registration });
    },
    async read(id, nowMs) {
      if (!UUID_PATTERN.test(id) || !Number.isFinite(nowMs)) return null;
      const registration = registrations.get(id);
      if (!registration) return null;
      if (registration.createdAtMs + REGISTRATION_TTL_MS <= nowMs) {
        registrations.delete(id);
        return null;
      }
      return { ...registration };
    },
    async remove(id) {
      if (!UUID_PATTERN.test(id)) return;
      registrations.delete(id);
    },
    async take(key, nowMs, limit, windowMs) {
      if (key.length < 1 || key.length > 120 || !Number.isFinite(nowMs) || limit < 1 || windowMs < 1) return false;
      const decision = nextRateBucket(buckets.get(key), nowMs, limit, windowMs);
      if (!decision.allow) return false;
      buckets.set(key, decision.bucket);
      return true;
    },
  };
}
