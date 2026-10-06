import { FIREBASE_CERT_URL } from './auth-claims.ts';
import { createWebFirebaseVerifier } from './auth-web.ts';
import type { Clock } from './clock.ts';
import { quotaLimitsFromJson } from './quota-logic.ts';
import { BodyTimeout, ioTimeoutMs, readBodyText } from './read-body.ts';
import { MAX_BODY_BYTES, assertScheduleMode, ScheduleService, type ScheduleDeps, type OutgoingResponse } from './service.ts';
import type { TokenVerifier } from './auth-claims.ts';
import { createGateSource } from './sources/gate.ts';
import { createDocumentLabSource } from './sources/html-lab.ts';
import { createLabSource } from './sources/lab.ts';
import type { FeedSource } from './sources/types.ts';
import { SourceFlight } from './source-share.ts';
import { ensureScheduleSchema, sessionFrom, SqliteQuotaBook, SqliteScheduleStore } from './sqlite-store.ts';

export const SCHEDULE_OBJECT_NAME = 'matchahead-schedule';

export interface ScheduleNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface ScheduleEnv {
  SCHEDULE: ScheduleNamespace;
  FIREBASE_PROJECT_ID: string;
  SCHEDULE_MODE?: string;
  SCHEDULE_ALLOWED_ORIGINS?: string;
  SCHEDULE_TRUST_PROXY?: string;
  SCHEDULE_ALLOW_TEST_CLOCK?: string;
  SCHEDULE_LAB_URL?: string;
  SCHEDULE_LAB_KIND?: string;
  SCHEDULE_LAB_PARSER?: string;
  SCHEDULE_IO_TIMEOUT_MS?: string;
  SCHEDULE_QUOTA_LIMITS?: string;
  NODE_ENV?: string;
}

interface SqlState {
  storage: {
    sql: {
      exec(query: string, ...bindings: Array<string | number | null>): Iterable<Record<string, string | number | null | ArrayBuffer>>;
    };
  };
}

/**
 * Jedan Durable Object drži snimke, manifeste, indeks promena i kvote.
 * Zahtevi se ređaju jer await inače prepliće brojače.
 * Zaglavlje x-matchahead-test-now važi samo u sintetičkom režimu uz SCHEDULE_ALLOW_TEST_CLOCK.
 * Produkcija ga ignoriše: klijentsko vreme se ne prihvata.
 */
export class ScheduleDirectoryObject {
  #env: ScheduleEnv;
  #store: SqliteScheduleStore;
  #quota: SqliteQuotaBook;
  #verifier: TokenVerifier;
  #tail: Promise<void> = Promise.resolve();
  #flight = new SourceFlight();
  #nowMs = Date.now();

  constructor(state: SqlState, env: ScheduleEnv) {
    this.#env = env;
    const sql = sessionFrom(state.storage.sql);
    ensureScheduleSchema(sql);
    this.#store = new SqliteScheduleStore(sql);
    this.#quota = new SqliteQuotaBook(sql, quotaLimitsFromJson(env.SCHEDULE_QUOTA_LIMITS));
    this.#verifier = createWebFirebaseVerifier({
      projectId: env.FIREBASE_PROJECT_ID ?? '',
      nowMs: () => this.#nowMs,
      fetchCerts: async () => {
        const timeoutMs = ioTimeoutMs(env.SCHEDULE_IO_TIMEOUT_MS);
        const response = await fetch(FIREBASE_CERT_URL, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) throw new Error('Sertifikati za prijavu nisu pročitani.');
        const body = (await response.json()) as Record<string, string> | null;
        if (!body || typeof body !== 'object') throw new Error('Sertifikati za prijavu nisu pročitani.');
        return body;
      },
    });
  }

  fetch(request: Request): Promise<Response> {
    const run = this.#tail.then(() => this.#handle(request));
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async #handle(request: Request): Promise<Response> {
    try {
      const mode = assertScheduleMode(this.#env.SCHEDULE_MODE ?? 'production', this.#env.NODE_ENV);
      const projectId = this.#env.FIREBASE_PROJECT_ID ?? '';
      if (!projectId) return jsonResponse(500, { error: { code: 'not_found', message: 'Prijava nije podešena.' } });
      const now = requestNow(request, mode, this.#env.SCHEDULE_ALLOW_TEST_CLOCK === '1');
      this.#nowMs = now.getTime();
      const clock: Clock = { now: () => new Date(this.#nowMs) };
      const origins = (this.#env.SCHEDULE_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const timeoutMs = ioTimeoutMs(this.#env.SCHEDULE_IO_TIMEOUT_MS);
      const source = mode === 'synthetic'
        ? labSource(this.#env, timeoutMs)
        : createGateSource();
      const deps: ScheduleDeps = {
        clock,
        verifier: this.#verifier,
        store: this.#store,
        quota: this.#quota,
        source,
        origins,
        mode,
        trustProxy: this.#env.SCHEDULE_TRUST_PROXY === '1',
        flight: this.#flight,
        logger: (event) => {
          console.log(JSON.stringify({ status: event.status, code: event.code, teamId: event.teamId }));
        },
      };
      const url = new URL(request.url);
      const output = await new ScheduleService(deps).handle({
        method: request.method,
        path: url.pathname,
        origin: request.headers.get('origin'),
        authorization: request.headers.get('authorization'),
        queryKeys: [...url.searchParams.keys()],
        bodyText: await readBodyText(request, ioTimeoutMs(this.#env.SCHEDULE_IO_TIMEOUT_MS), MAX_BODY_BYTES),
        remoteAddress: clientAddress(request, deps.trustProxy === true),
      });
      return toResponse(output);
    } catch (error) {
      if (error instanceof BodyTimeout) {
        return jsonResponse(400, { error: { code: 'payload_too_large', message: 'Telo nije stiglo u roku.' } });
      }
      return jsonResponse(500, { error: { code: 'not_found', message: 'Zahtev nije obrađen.' } });
    }
  }
}

function requestNow(request: Request, mode: 'production' | 'synthetic', allowTestClock: boolean): Date {
  if (mode === 'synthetic' && allowTestClock) {
    const raw = request.headers.get('x-matchahead-test-now');
    if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return new Date();
}

function clientAddress(request: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

function labSource(env: ScheduleEnv, timeoutMs: number): FeedSource {
  const url = env.SCHEDULE_LAB_URL ?? '';
  const kind = (env.SCHEDULE_LAB_KIND ?? '').trim();
  if (kind === 'html' || kind === 'pdf') return createDocumentLabSource(url, (env.SCHEDULE_LAB_PARSER ?? '').trim(), timeoutMs);
  return createLabSource(url, timeoutMs);
}

function toResponse(output: OutgoingResponse): Response {
  const payload = output.body === null ? '' : JSON.stringify(output.body);
  return new Response(payload, { status: output.status, headers: output.headers });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
