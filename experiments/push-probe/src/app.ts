import { probeClickUrl } from './click.ts';
import { timeFirestoreParse } from './firestore-measure.ts';
import {
  type CachedAccessToken,
  type TokenCacheKv,
  TOKEN_CACHE_KEY,
  readCachedToken,
  serializeCachedToken,
  signServiceAccountJwt,
} from './google-auth.ts';
import { FCM_SCOPE, FCM_SDK_VERSION, FCM_SEND_ORIGIN } from './ids.ts';
import {
  AUTH_FAILURES_PER_HOUR,
  REGISTRATIONS_PER_HOUR,
  SENDS_PER_REGISTRATION_PER_HOUR,
  SENDS_PER_WORKER_PER_UTC_DAY,
} from './limits.ts';
import { SYNTHETIC_TITLE, syntheticFcmMessage } from './message.ts';
import { createRateLimiter, type RateLimiter } from './rate.ts';
import { parseRegistrationBody } from './registration.ts';
import { encodeBase64Url, secretMatches, sha256, timingSafeEqualBytes } from './secret.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BODY_MAX = 8192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ProbeEnv {
  PROBE_SEND_ENABLED?: string;
  PROBE_ENROLL_SECRET?: string;
  FIREBASE_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
  PUBLIC_BASE_URL?: string;
  TOKEN_CACHE?: TokenCacheKv;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export interface ProbeDeps {
  fetch: typeof fetch;
  now: () => number;
  randomUUID: () => string;
  randomBytes: (size: number) => Uint8Array;
}

interface Registration {
  registrationId: string;
  fid: string;
  followedTeamId: string | null;
  opponentLabel: string | null;
  selfSendKeyHash: Uint8Array;
  createdAtMs: number;
}

export interface ScheduledResult {
  action: 'skipped' | 'warm-noop' | 'warm-kv' | 'refresh';
  signMs: number;
  exchangeMs: number;
  ok: boolean;
}

function problem(status: number, error: string, extra?: Record<string, string | number | boolean>): Response {
  return Response.json({ error, ...extra }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function probeEnabled(env: ProbeEnv): boolean {
  return env.PROBE_SEND_ENABLED === '1';
}

function fcmConfigured(env: ProbeEnv): boolean {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

function projectIdValid(projectId: string): boolean {
  return /^[a-z0-9-]{6,30}$/.test(projectId);
}

function clientEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email) && !email.includes('\\');
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > BODY_MAX) return { ok: false, response: problem(413, 'body_too_large') };
  const text = await request.text();
  if (text.length > BODY_MAX) return { ok: false, response: problem(413, 'body_too_large') };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: problem(400, 'invalid_json') };
  }
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function rejectsSecretInUrl(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    const name = key.toLowerCase();
    if (name.includes('secret') || name.includes('token') || name.includes('key') || name === 'authorization') {
      return true;
    }
  }
  return false;
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  return match ? match[1] : null;
}

function publicBaseFor(request: Request, env: ProbeEnv): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL;
  return new URL(request.url).origin;
}

function iconUrlFor(clickUrl: string): string {
  const click = new URL(clickUrl);
  const basePath = click.pathname.replace(/poruka\.html$/, '');
  return new URL(`${basePath}icons/icon-192.png`, click.origin).toString();
}

async function hashesEqual(candidate: string, expectedHash: Uint8Array): Promise<boolean> {
  const actual = await sha256(candidate);
  return timingSafeEqualBytes(actual, expectedHash);
}

export function createProbeApp(overrides: Partial<ProbeDeps> = {}) {
  const deps: ProbeDeps = {
    fetch: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    randomUUID: () => crypto.randomUUID(),
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    ...overrides,
  };
  const registrations = new Map<string, Registration>();
  const limiter: RateLimiter = createRateLimiter();
  let memoryToken: CachedAccessToken | null = null;

  async function loadToken(env: ProbeEnv, nowMs: number): Promise<{ token: CachedAccessToken | null; source: 'memory' | 'kv' | 'miss'; kvWaitMs: number; parseMs: number }> {
    if (memoryToken && memoryToken.expiresAtMs > nowMs + 60_000 && memoryToken.scope === FCM_SCOPE) {
      return { token: memoryToken, source: 'memory', kvWaitMs: 0, parseMs: 0 };
    }
    if (!env.TOKEN_CACHE) return { token: null, source: 'miss', kvWaitMs: 0, parseMs: 0 };
    const waitStarted = performance.now();
    const raw = await env.TOKEN_CACHE.get(TOKEN_CACHE_KEY);
    const kvWaitMs = performance.now() - waitStarted;
    const parseStarted = performance.now();
    const token = readCachedToken(raw, nowMs);
    const parseMs = performance.now() - parseStarted;
    if (token) memoryToken = token;
    return { token, source: token ? 'kv' : 'miss', kvWaitMs, parseMs };
  }

  async function storeToken(env: ProbeEnv, token: CachedAccessToken): Promise<void> {
    memoryToken = token;
    if (!env.TOKEN_CACHE) return;
    const ttlSeconds = Math.max(60, Math.floor((token.expiresAtMs - deps.now()) / 1000));
    await env.TOKEN_CACHE.put(TOKEN_CACHE_KEY, serializeCachedToken(token), { expirationTtl: ttlSeconds });
  }

  async function ensureAccessToken(env: ProbeEnv, fetchImpl: typeof fetch): Promise<ScheduledResult & { accessToken?: string; kvWaitMs: number; parseMs: number }> {
    if (!fcmConfigured(env) || !projectIdValid(env.FIREBASE_PROJECT_ID ?? '') || !clientEmailValid(env.FCM_CLIENT_EMAIL ?? '')) {
      return { action: 'skipped', signMs: 0, exchangeMs: 0, ok: false, kvWaitMs: 0, parseMs: 0 };
    }
    const nowMs = deps.now();
    const loaded = await loadToken(env, nowMs);
    if (loaded.token) {
      return {
        action: loaded.source === 'kv' ? 'warm-kv' : 'warm-noop',
        signMs: 0,
        exchangeMs: 0,
        ok: true,
        accessToken: loaded.token.accessToken,
        kvWaitMs: loaded.kvWaitMs,
        parseMs: loaded.parseMs,
      };
    }
    const signed = await signServiceAccountJwt({
      clientEmail: env.FCM_CLIENT_EMAIL ?? '',
      privateKeyPem: env.FCM_PRIVATE_KEY ?? '',
      nowSeconds: Math.floor(nowMs / 1000),
    });
    const exchangeStarted = performance.now();
    const response = await fetchImpl(TOKEN_AUDIENCE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signed.jwt,
      }),
    });
    const exchangeMs = performance.now() - exchangeStarted;
    if (!response.ok) {
      return { action: 'refresh', signMs: signed.signMs, exchangeMs, ok: false, kvWaitMs: 0, parseMs: 0 };
    }
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number') {
      return { action: 'refresh', signMs: signed.signMs, exchangeMs, ok: false, kvWaitMs: 0, parseMs: 0 };
    }
    const cached: CachedAccessToken = {
      accessToken: payload.access_token,
      expiresAtMs: nowMs + payload.expires_in * 1000,
      scope: FCM_SCOPE,
    };
    await storeToken(env, cached);
    return {
      action: 'refresh',
      signMs: signed.signMs,
      exchangeMs,
      ok: true,
      accessToken: cached.accessToken,
      kvWaitMs: 0,
      parseMs: 0,
    };
  }

  async function authorizedEnroll(request: Request, env: ProbeEnv): Promise<'missing' | 'rejected' | 'ok'> {
    if (!env.PROBE_ENROLL_SECRET) return 'missing';
    const supplied = request.headers.get('x-matchahead-enroll') ?? '';
    const matches = await secretMatches(supplied, env.PROBE_ENROLL_SECRET);
    return matches ? 'ok' : 'rejected';
  }

  async function runScheduled(env: ProbeEnv, fetchImpl: typeof fetch): Promise<ScheduledResult> {
    if (!probeEnabled(env)) return { action: 'skipped', signMs: 0, exchangeMs: 0, ok: false };
    const result = await ensureAccessToken(env, fetchImpl);
    return {
      action: result.action,
      signMs: result.signMs,
      exchangeMs: result.exchangeMs,
      ok: result.ok,
    };
  }

  async function handleApi(request: Request, env: ProbeEnv, url: URL): Promise<Response> {
    if (rejectsSecretInUrl(url)) return problem(400, 'secret_in_url');
    if (!originAllowed(request)) return problem(403, 'origin_rejected');

    if (url.pathname === '/api/probe/status' && request.method === 'GET') {
      return Response.json({
        enabled: probeEnabled(env),
        fcmConfigured: fcmConfigured(env),
        sdk: `firebase@${FCM_SDK_VERSION}`,
        identifier: 'fid',
        delivery: 'NOT_TESTED',
        synthetic: true,
      }, { headers: { 'cache-control': 'no-store' } });
    }

    if (!probeEnabled(env)) return problem(404, 'probe_disabled');

    if (url.pathname === '/api/registrations' && request.method === 'POST') {
      const enroll = await authorizedEnroll(request, env);
      if (enroll === 'missing') return problem(503, 'enroll_not_configured');
      if (enroll === 'rejected') return problem(401, 'enroll_rejected');
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const parsed = parseRegistrationBody(body.value);
      if (!parsed.ok) return problem(parsed.status, parsed.error);
      if (!limiter.take('register', deps.now(), REGISTRATIONS_PER_HOUR, HOUR_MS)) {
        return problem(429, 'rate_limited');
      }
      const registrationId = deps.randomUUID();
      const selfSendKey = encodeBase64Url(deps.randomBytes(32));
      registrations.set(registrationId, {
        registrationId,
        fid: parsed.value.fid,
        followedTeamId: parsed.value.followedTeamId,
        opponentLabel: parsed.value.opponentLabel,
        selfSendKeyHash: await sha256(selfSendKey),
        createdAtMs: deps.now(),
      });
      return Response.json({ registrationId, selfSendKey }, {
        status: 201,
        headers: { 'cache-control': 'no-store' },
      });
    }

    const deletion = /^\/api\/registrations\/([^/]+)$/.exec(url.pathname);
    if (deletion && request.method === 'DELETE') {
      const registrationId = deletion[1];
      const key = bearer(request);
      if (!key || !UUID_PATTERN.test(registrationId)) return problem(401, 'self_send_rejected');
      const registration = registrations.get(registrationId);
      if (!registration || !(await hashesEqual(key, registration.selfSendKeyHash))) {
        return problem(401, 'self_send_rejected');
      }
      registrations.delete(registrationId);
      return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/probe/send' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      if (body.value === null || typeof body.value !== 'object' || Array.isArray(body.value)) {
        return problem(400, 'invalid_body');
      }
      const record = body.value as Record<string, unknown>;
      const keys = Object.keys(record);
      if (keys.length !== 1 || keys[0] !== 'registrationId') return problem(400, 'payload_not_allowed');
      if (typeof record.registrationId !== 'string' || !UUID_PATTERN.test(record.registrationId)) {
        return problem(401, 'self_send_rejected');
      }
      const key = bearer(request);
      if (!key) return problem(401, 'self_send_required');
      const registration = registrations.get(record.registrationId);
      const authorized = await hashesEqual(key, registration?.selfSendKeyHash ?? await sha256('missing-registration'));
      if (!registration || !authorized) {
        if (!limiter.take(`auth-fail:${record.registrationId}`, deps.now(), AUTH_FAILURES_PER_HOUR, HOUR_MS)) {
          return problem(429, 'rate_limited');
        }
        return problem(401, 'self_send_rejected');
      }
      const dayKey = `send-global:${Math.floor(deps.now() / DAY_MS)}`;
      if (!limiter.take(`send:${registration.registrationId}`, deps.now(), SENDS_PER_REGISTRATION_PER_HOUR, HOUR_MS)) {
        return problem(429, 'rate_limited');
      }
      if (!limiter.take(dayKey, deps.now(), SENDS_PER_WORKER_PER_UTC_DAY, DAY_MS)) {
        return problem(429, 'rate_limited');
      }
      if (!fcmConfigured(env)) return problem(503, 'fcm_not_configured');
      let clickUrl: string;
      try {
        clickUrl = probeClickUrl(publicBaseFor(request, env), `synthetic-${deps.randomUUID()}`);
      } catch {
        return problem(500, 'invalid_public_base');
      }
      const probeMessageId = new URL(clickUrl).searchParams.get('id') ?? '';
      const message = syntheticFcmMessage({
        fid: registration.fid,
        probeMessageId,
        clickUrl,
        iconUrl: iconUrlFor(clickUrl),
      });
      const token = await ensureAccessToken(env, deps.fetch);
      if (!token.ok || !token.accessToken) return problem(502, 'google_auth_failed');
      const fcmResponse = await deps.fetch(`${FCM_SEND_ORIGIN}/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(message),
      });
      if (fcmResponse.status === 404) {
        registrations.delete(registration.registrationId);
        return problem(410, 'fid_not_registered');
      }
      if (!fcmResponse.ok) return problem(502, 'fcm_rejected', { upstreamStatus: fcmResponse.status });
      return Response.json({
        ok: true,
        probeMessageId,
        clickPath: message.message.data.clickPath,
        delivery: 'accepted_by_fcm',
        displayedOnDevice: false,
        synthetic: true,
        title: SYNTHETIC_TITLE,
      }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/probe/measure' && request.method === 'POST') {
      const enroll = await authorizedEnroll(request, env);
      if (enroll === 'missing') return problem(503, 'enroll_not_configured');
      if (enroll === 'rejected') return problem(401, 'enroll_rejected');
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const phase = body.value !== null && typeof body.value === 'object' && !Array.isArray(body.value)
        ? (body.value as { phase?: unknown }).phase
        : undefined;
      if (phase === 'timer') {
        const started = performance.now();
        let sink = 0;
        for (let index = 0; index < 200_000; index += 1) sink += index;
        const deltaMs = performance.now() - started;
        return Response.json({ phase, deltaMs, timerAdvancesDuringCpu: deltaMs > 0, sink });
      }
      if (phase === 'sign') {
        if (!fcmConfigured(env)) return problem(503, 'fcm_not_configured');
        const signed = await signServiceAccountJwt({
          clientEmail: env.FCM_CLIENT_EMAIL ?? '',
          privateKeyPem: env.FCM_PRIVATE_KEY ?? '',
          nowSeconds: Math.floor(deps.now() / 1000),
        });
        return Response.json({ phase, signMs: signed.signMs, jwtChars: signed.jwt.length });
      }
      if (phase === 'warm') {
        memoryToken = {
          accessToken: 'ya29.measure-warm',
          expiresAtMs: deps.now() + 30 * 60 * 1000,
          scope: FCM_SCOPE,
        };
        const result = await ensureAccessToken(env, deps.fetch);
        return Response.json({
          phase,
          action: result.action,
          signMs: result.signMs,
          exchangeMs: result.exchangeMs,
          leakedToken: false,
        });
      }
      if (phase === 'warm-kv') {
        memoryToken = null;
        if (!env.TOKEN_CACHE) return problem(404, 'kv_not_bound');
        const result = await ensureAccessToken(env, deps.fetch);
        return Response.json({
          phase,
          action: result.action,
          signMs: result.signMs,
          exchangeMs: result.exchangeMs,
          kvWaitMs: result.kvWaitMs,
          parseMs: result.parseMs,
          kvSimulated: true,
        });
      }
      if (phase === 'seed-kv') {
        if (!env.TOKEN_CACHE) return problem(404, 'kv_not_bound');
        const token: CachedAccessToken = {
          accessToken: 'ya29.measure-kv',
          expiresAtMs: deps.now() + 30 * 60 * 1000,
          scope: FCM_SCOPE,
        };
        await env.TOKEN_CACHE.put(TOKEN_CACHE_KEY, serializeCachedToken(token), { expirationTtl: 1800 });
        memoryToken = null;
        return Response.json({ phase, ok: true });
      }
      if (phase === 'refresh' || phase === 'scheduled') {
        memoryToken = null;
        const result = await runScheduled(env, mockGoogleFetch);
        return Response.json({
          phase,
          action: result.action,
          signMs: result.signMs,
          exchangeMs: result.exchangeMs,
          ok: result.ok,
          networkWaitIsNotCpu: true,
        });
      }
      if (phase === 'firestore-parse') {
        const parsed = timeFirestoreParse();
        return Response.json({
          phase,
          parseMs: parsed.parseMs,
          ok: parsed.ok,
          firestoreLive: 'NOT_TESTED',
        });
      }
      return problem(400, 'unknown_phase');
    }

    return problem(404, 'not_found');
  }

  return {
    async fetch(request: Request, env: ProbeEnv = {}): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return problem(404, 'not_found');
    },
    scheduled(env: ProbeEnv = {}): Promise<ScheduledResult> {
      return runScheduled(env, deps.fetch);
    },
  };
}

const TOKEN_AUDIENCE_URL = 'https://oauth2.googleapis.com/token';

async function mockGoogleFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (!url.startsWith(TOKEN_AUDIENCE_URL)) return new Response('not_mocked', { status: 500 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  return Response.json({ access_token: 'ya29.mock', expires_in: 3600 });
}
