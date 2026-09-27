import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProbeApp, type ProbeEnv } from '../src/app.ts';
import { TOKEN_CACHE_KEY } from '../src/google-auth.ts';
import { selectableTeams } from '../../../packages/domain/src/selectable-teams.ts';
import { ENROLL, VALID_FID, generatePrivateKeyPem, probeEnv } from './helpers.ts';

const material = await generatePrivateKeyPem();

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4173', ...headers },
    body: JSON.stringify(body),
  });
}

async function registerDevice(app: ReturnType<typeof createProbeApp>, env: ProbeEnv, extra: Record<string, unknown> = {}) {
  const response = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/registrations', {
    fid: VALID_FID,
    ...extra,
  }, { 'x-matchahead-enroll': ENROLL }), env);
  assert.equal(response.status, 201);
  return await response.json() as { registrationId: string; selfSendKey: string };
}

test('isključen probe ne otvara slanje, a status ostaje vidljiv', async () => {
  const app = createProbeApp();
  const status = await app.fetch(new Request('http://127.0.0.1:4173/api/probe/status'));
  const body = await status.json() as { enabled: boolean; delivery: string; identifier: string };
  assert.equal(body.enabled, false);
  assert.equal(body.delivery, 'NOT_TESTED');
  assert.equal(body.identifier, 'fid');
  const send = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', { registrationId: 'x' }));
  assert.equal(send.status, 404);
});

test('slanje ide samo vlasniku registracije i FCM telo nema tuđi sadržaj', async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const app = createProbeApp({
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'ya29.test-token', expires_in: 3600 });
      if (url.includes('fcm.googleapis.com')) return Response.json({ name: 'projects/matchahead-probe/messages/1' });
      return new Response('unexpected', { status: 500 });
    },
  });
  const env = probeEnv(material.pem);
  const created = await registerDevice(app, env, {
    followedTeamId: selectableTeams()[1].id,
    opponentLabel: 'Barselona',
  });
  const denied = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
    title: 'tuđa poruka',
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  assert.equal(denied.status, 400);

  const sent = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  const payload = await sent.json() as { delivery: string; displayedOnDevice: boolean; clickPath: string };
  assert.equal(sent.status, 200);
  assert.equal(payload.delivery, 'accepted_by_fcm');
  assert.equal(payload.displayedOnDevice, false);
  assert.match(payload.clickPath, /^\/poruka\.html\?probe=synthetic&id=synthetic-/);
  const fcmCall = calls.find((call) => call.url.includes('fcm.googleapis.com'));
  assert.ok(fcmCall);
  const fcmBody = JSON.parse(fcmCall.body) as { message: { fid?: string; token?: string; data: { kind: string } } };
  assert.equal(fcmBody.message.fid, VALID_FID);
  assert.equal(fcmBody.message.token, undefined);
  assert.equal(fcmBody.message.data.kind, 'synthetic-probe');
  assert.equal(fcmCall.body.includes('Barselona'), false);
  assert.equal(fcmCall.body.includes(selectableTeams()[1].id), false);
  assert.equal(JSON.stringify(payload).includes(VALID_FID), false);
  assert.equal(JSON.stringify(payload).includes('ya29'), false);
  assert.equal(JSON.stringify(payload).includes('BEGIN PRIVATE KEY'), false);

  const other = await registerDevice(app, env);
  const crossed = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: other.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  assert.equal(crossed.status, 401);
});

test('četvrto slanje u istom satu je odbijeno', async () => {
  const app = createProbeApp({
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'ya29.test-token', expires_in: 3600 });
      return Response.json({ name: 'projects/matchahead-probe/messages/1' });
    },
  });
  const env = probeEnv(material.pem);
  const created = await registerDevice(app, env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
      registrationId: created.registrationId,
    }, { authorization: `Bearer ${created.selfSendKey}` }), env);
    assert.equal(response.status, 200);
  }
  const limited = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  assert.equal(limited.status, 429);
});

test('bez serverskog ključa slanje nije označeno kao uspelo', async () => {
  const app = createProbeApp({ fetch: async () => { throw new Error('ne sme se zvati'); } });
  const created = await registerDevice(app, { PROBE_SEND_ENABLED: '1', PROBE_ENROLL_SECRET: ENROLL });
  const response = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), { PROBE_SEND_ENABLED: '1', PROBE_ENROLL_SECRET: ENROLL });
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.equal(body.error, 'fcm_not_configured');
});

test('nevažeći FID na FCM-u gasi registraciju', async () => {
  const app = createProbeApp({
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'ya29.test-token', expires_in: 3600 });
      return new Response('missing', { status: 404 });
    },
  });
  const env = probeEnv(material.pem);
  const created = await registerDevice(app, env);
  const response = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  assert.equal(response.status, 410);
  const again = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/send', {
    registrationId: created.registrationId,
  }, { authorization: `Bearer ${created.selfSendKey}` }), env);
  assert.equal(again.status, 401);
});

test('toplo zakazivanje ne potpisuje ponovo, a osvežavanje odvaja mrežu od potpisa', async () => {
  let oauthCalls = 0;
  const app = createProbeApp({
    fetch: async (input) => {
      oauthCalls += 1;
      assert.equal(String(input).includes('oauth2.googleapis.com'), true);
      return Response.json({ access_token: 'ya29.test-token', expires_in: 3600 });
    },
  });
  const env = probeEnv(material.pem);
  const cold = await app.scheduled(env);
  const warm = await app.scheduled(env);
  assert.equal(cold.action, 'refresh');
  assert.equal(cold.signMs > 0, true);
  assert.equal(warm.action, 'warm-noop');
  assert.equal(warm.signMs, 0);
  assert.equal(oauthCalls, 1);

  const measured = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/measure', { phase: 'refresh' }, {
    'x-matchahead-enroll': ENROLL,
  }), env);
  const refresh = await measured.json() as { action: string; signMs: number; exchangeMs: number; networkWaitIsNotCpu: boolean };
  assert.equal(refresh.action, 'refresh');
  assert.equal(refresh.networkWaitIsNotCpu, true);
  assert.equal(refresh.exchangeMs >= 30, true);
  assert.equal(JSON.stringify(refresh).includes('ya29'), false);
  assert.equal(JSON.stringify(refresh).includes('BEGIN PRIVATE KEY'), false);
});

test('KV keš preskače potpis, a živi Firestore ostaje neproveren', async () => {
  const store = new Map<string, string>();
  const env = {
    ...probeEnv(material.pem),
    TOKEN_CACHE: {
      async get(key: string) { return store.get(key) ?? null; },
      async put(key: string, value: string) { store.set(key, value); },
    },
  };
  const app = createProbeApp({ fetch: async () => { throw new Error('mreža nije deo KV čitanja'); } });
  const seeded = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/measure', { phase: 'seed-kv' }, {
    'x-matchahead-enroll': ENROLL,
  }), env);
  assert.equal(seeded.status, 200);
  assert.equal(store.has(TOKEN_CACHE_KEY), true);
  const warm = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/measure', { phase: 'warm-kv' }, {
    'x-matchahead-enroll': ENROLL,
  }), env);
  const body = await warm.json() as { action: string; signMs: number; kvSimulated: boolean };
  assert.equal(body.action, 'warm-kv');
  assert.equal(body.signMs, 0);
  assert.equal(body.kvSimulated, true);
  const parsed = await app.fetch(jsonRequest('http://127.0.0.1:4173/api/probe/measure', { phase: 'firestore-parse' }, {
    'x-matchahead-enroll': ENROLL,
  }), env);
  const firestore = await parsed.json() as { firestoreLive: string; ok: boolean };
  assert.equal(firestore.firestoreLive, 'NOT_TESTED');
  assert.equal(firestore.ok, true);
});

test('tuđe poreklo i tajna u URL-u se odbijaju', async () => {
  const app = createProbeApp();
  const env = probeEnv(material.pem);
  const foreign = await app.fetch(new Request('http://127.0.0.1:4173/api/probe/status', {
    headers: { origin: 'https://evil.test' },
  }), env);
  assert.equal(foreign.status, 403);
  const leaked = await app.fetch(new Request('http://127.0.0.1:4173/api/probe/status?secret=1'), env);
  assert.equal(leaked.status, 400);
});
