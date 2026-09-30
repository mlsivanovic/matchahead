import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

import { DIRECTORY_NAME } from '../src/directory.ts';
import { ENROLL, VALID_FID, generatePrivateKeyPem } from './helpers.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundleDir = mkdtempSync(join(tmpdir(), 'matchahead-probe-'));
const bundlePath = join(bundleDir, 'worker.js');
const material = await generatePrivateKeyPem();

await esbuild.build({
  entryPoints: [resolve(root, 'src/worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: bundlePath,
  legalComments: 'none',
});

const workerSource = readFileSync(bundlePath, 'utf8');
rmSync(bundleDir, { recursive: true, force: true });

function probeOptions(pem: string, enabled: string, missingFid: boolean) {
  return {
    workers: [
      {
        config: {
          name: 'matchahead-push-probe',
          compatibilityDate: '2026-09-27',
          manifest: {
            mainModule: 'worker.js',
            modules: {
              'worker.js': { type: 'esm', contents: workerSource },
            },
          },
          exports: {
            ProbeDirectoryObject: { type: 'durable-object', storage: 'sqlite' },
          },
          env: {
            PROBE_SEND_ENABLED: { type: 'text', value: enabled },
            PROBE_ENROLL_SECRET: { type: 'text', value: ENROLL },
            FIREBASE_PROJECT_ID: { type: 'text', value: 'matchahead-probe' },
            FCM_CLIENT_EMAIL: { type: 'text', value: 'probe@matchahead-probe.iam.gserviceaccount.com' },
            FCM_PRIVATE_KEY: { type: 'text', value: pem },
            PROBE_DIRECTORY: {
              type: 'durable-object',
              worker: 'matchahead-push-probe',
              exportName: 'ProbeDirectoryObject',
            },
          },
        },
        dev: {
          outboundService: {
            type: 'fetcher' as const,
            handler: async (request: Request) => {
              const url = new URL(request.url);
              if (url.hostname === 'oauth2.googleapis.com') {
                return Response.json({ access_token: 'ya29.test-token', expires_in: 3600 });
              }
              if (url.hostname === 'fcm.googleapis.com') {
                const body = await request.text();
                if (body.includes('"token"') || !body.includes(VALID_FID)) {
                  return Response.json({ error: 'rejected' }, { status: 400 });
                }
                if (missingFid) return new Response('missing', { status: 404 });
                return Response.json({ name: 'projects/matchahead-probe/messages/1' });
              }
              return new Response('unexpected', { status: 500 });
            },
          },
        },
      },
    ],
  };
}

function jsonInit(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://probe.local', ...headers },
    body: JSON.stringify(body),
  };
}

async function register(mf: Miniflare, enroll = ENROLL) {
  const response = await mf.dispatchFetch('https://probe.local/api/registrations', jsonInit({ fid: VALID_FID }, {
    'x-matchahead-enroll': enroll,
  }));
  const text = await response.text();
  assert.equal(text.includes(ENROLL), false);
  assert.equal(text.includes('BEGIN PRIVATE KEY'), false);
  return { status: response.status, body: JSON.parse(text) as { registrationId?: string; selfSendKey?: string; error?: string } };
}

async function send(mf: Miniflare, registrationId: string, selfSendKey: string) {
  const response = await mf.dispatchFetch('https://probe.local/api/probe/send', jsonInit({ registrationId }, {
    authorization: `Bearer ${selfSendKey}`,
  }));
  const text = await response.text();
  assert.equal(text.includes(ENROLL), false);
  assert.equal(text.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(text.includes(VALID_FID), false);
  return { status: response.status, body: JSON.parse(text) as { error?: string; delivery?: string } };
}

test('workerd čuva registraciju posle gašenja objekta i odbija tuđi ključ', async () => {
  const mf = new Miniflare(probeOptions(material.pem, '1', false));
  try {
    const status = await mf.dispatchFetch('https://probe.local/api/probe/status');
    const statusBody = await status.json() as { enabled: boolean; store: string; storeBound: boolean; delivery: string };
    assert.equal(statusBody.enabled, true);
    assert.equal(statusBody.store, 'durable-object');
    assert.equal(statusBody.storeBound, true);
    assert.equal(statusBody.delivery, 'NOT_TESTED');

    const wrongEnroll = await register(mf, 'nije-prava-tajna-ali-dovoljno-duga-1234567890abcd');
    assert.equal(wrongEnroll.status, 401);
    assert.equal(wrongEnroll.body.error, 'enroll_rejected');

    const created = await register(mf);
    assert.equal(created.status, 201);
    assert.ok(created.body.registrationId);
    assert.match(created.body.selfSendKey ?? '', /^[A-Za-z0-9_-]{43}$/);
    const registrationId = created.body.registrationId;
    const selfSendKey = created.body.selfSendKey ?? '';

    await mf.unsafeEvictDurableObject('matchahead-push-probe', 'ProbeDirectoryObject', { name: DIRECTORY_NAME });

    const owner = await send(mf, registrationId, selfSendKey);
    assert.equal(owner.status, 200);
    assert.equal(owner.body.delivery, 'accepted_by_fcm');

    const stranger = await send(mf, registrationId, 'A'.repeat(43));
    assert.equal(stranger.status, 401);
    const stillOwner = await send(mf, registrationId, selfSendKey);
    assert.equal(stillOwner.status, 200);
  } finally {
    await mf.dispose();
  }
});

test('workerd ograničava istovremena slanja i brisanje ostaje važeće', async () => {
  const mf = new Miniflare(probeOptions(material.pem, '1', false));
  try {
    const created = await register(mf);
    assert.equal(created.status, 201);
    const registrationId = created.body.registrationId ?? '';
    const selfSendKey = created.body.selfSendKey ?? '';
    const burst = await Promise.all(Array.from({ length: 8 }, () => send(mf, registrationId, selfSendKey)));
    const accepted = burst.filter((item) => item.status === 200);
    const limited = burst.filter((item) => item.status === 429);
    assert.equal(accepted.length, 3);
    assert.equal(limited.length, 5);

    const removal = await register(mf);
    assert.equal(removal.status, 201);
    const removedId = removal.body.registrationId ?? '';
    const removedKey = removal.body.selfSendKey ?? '';
    const deleted = await Promise.all(Array.from({ length: 6 }, () => mf.dispatchFetch(`https://probe.local/api/registrations/${removedId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${removedKey}`, origin: 'https://probe.local' },
    })));
    const deleteStatuses = await Promise.all(deleted.map(async (response) => response.status));
    assert.equal(deleteStatuses.every((status) => status === 200 || status === 401), true);
    assert.equal(deleteStatuses.includes(200), true);
    await mf.unsafeEvictDurableObject('matchahead-push-probe', 'ProbeDirectoryObject', { name: DIRECTORY_NAME });
    const after = await send(mf, removedId, removedKey);
    assert.equal(after.status, 401);
  } finally {
    await mf.dispose();
  }
});

test('workerd gasi FID koji FCM više ne poznaje i posle gašenja objekta', async () => {
  const mf = new Miniflare(probeOptions(material.pem, '1', true));
  try {
    const created = await register(mf);
    assert.equal(created.status, 201);
    const registrationId = created.body.registrationId ?? '';
    const selfSendKey = created.body.selfSendKey ?? '';
    const gone = await send(mf, registrationId, selfSendKey);
    assert.equal(gone.status, 410);
    await mf.unsafeEvictDurableObject('matchahead-push-probe', 'ProbeDirectoryObject', { name: DIRECTORY_NAME });
    const again = await send(mf, registrationId, selfSendKey);
    assert.equal(again.status, 401);
  } finally {
    await mf.dispose();
  }
});

test('isključen probe i dalje javlja vezan Durable Object, a slanje ostaje zatvoreno', async () => {
  const mf = new Miniflare(probeOptions(material.pem, '0', false));
  try {
    const status = await mf.dispatchFetch('https://probe.local/api/probe/status');
    const body = await status.json() as { enabled: boolean; store: string; storeBound: boolean };
    assert.equal(body.enabled, false);
    assert.equal(body.store, 'durable-object');
    assert.equal(body.storeBound, true);
    const blocked = await send(mf, '11111111-2222-4333-8444-555555555555', 'A'.repeat(43));
    assert.equal(blocked.status, 404);
    assert.equal(blocked.body.error, 'probe_disabled');
  } finally {
    await mf.dispose();
  }
});
