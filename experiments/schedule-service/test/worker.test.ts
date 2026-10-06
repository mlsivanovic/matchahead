import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

import type { FetchFailureKind, FindFixturesHttpSuccess, FixtureStatus } from '../../../packages/domain/src/index.ts';
import { BodyTimeout, readBodyText } from '../src/read-body.ts';
import { DEFAULT_QUOTA_LIMITS, type QuotaLimits } from '../src/quota-logic.ts';
import { SCHEDULE_OBJECT_NAME } from '../src/schedule-object.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ORIGIN = 'https://mlsivanovic.github.io';
const TEAM = 'football:rs:partizan';
const ZVEZDA = 'football:rs:crvena-zvezda';
const START = '2027-01-15T12:00:00.000Z';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certPem = certificatePem(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })));

const bundleDir = mkdtempSync(join(tmpdir(), 'matchahead-schedule-'));
const bundlePath = join(bundleDir, 'worker.js');
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

test('Worker paket ne vuče Node skladište, PDF ni privatni Euroleague endpoint', () => {
  assert.equal(workerSource.includes('node:fs'), false);
  assert.equal(workerSource.includes('node:zlib'), false);
  assert.equal(workerSource.includes('node:crypto'), false);
  assert.equal(workerSource.includes('node:child_process'), false);
  assert.equal(workerSource.includes('pdftotext se ne poziva'), true);
  assert.equal(workerSource.includes('inflateSync'), false);
  assert.equal(workerSource.includes('parseFssSuperliga'), true);
  assert.equal(workerSource.includes('parseEuroleaguePdf'), true);
  assert.equal(workerSource.includes('DecompressionStream'), true);
  assert.equal(workerSource.includes('api-live.euroleague.net'), false);
  assert.equal(workerSource.includes('FileScheduleStore'), false);
});

test('workerd čuva raspored posle gašenja objekta i ne izmišlja otkazivanje', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, {}));
  const token = signToken('user-1', START);
  let cursor = Date.parse(START);
  const stamp = () => new Date(cursor).toISOString();
  try {
    const created = await post(mf, token, stamp());
    assert.equal(created.status, 200);
    const createdBody = created.body as FindFixturesHttpSuccess;
    assert.equal(createdBody.kind, 'synthetic-demo');
    assert.equal(createdBody.changes[0]?.kind, 'new');
    assert.equal(createdBody.teams.some((item) => item.id === TEAM), true);
    assert.equal(createdBody.teams.some((item) => item.id === 'football:xx:gost' && item.sport === 'football'), true);
    const fixtureId = createdBody.result.futureFixtures[0]?.id;
    const revision = createdBody.result.futureFixtures[0]?.revision;
    assert.ok(fixtureId?.includes('stable-1'));
    assert.equal(lab.fixtureFetches, 1);

    cursor += 60_000;
    const cached = await post(mf, token, stamp());
    const cachedBody = cached.body as FindFixturesHttpSuccess;
    assert.equal(cachedBody.result.cacheStatus, 'reused');
    assert.equal(cachedBody.changes.length, 0);
    assert.equal(lab.fixtureFetches, 1);

    await mf.unsafeEvictDurableObject('matchahead-schedule', 'ScheduleDirectoryObject', { name: SCHEDULE_OBJECT_NAME });
    const again = await post(mf, token, stamp());
    const againBody = again.body as FindFixturesHttpSuccess;
    assert.equal(againBody.result.futureFixtures[0]?.id, fixtureId);
    assert.equal(againBody.result.futureFixtures[0]?.revision, revision);
    assert.equal(lab.fixtureFetches, 1);

    cursor += 16 * 60_000;
    const same = await post(mf, token, stamp(), { refresh: true });
    const sameBody = same.body as FindFixturesHttpSuccess;
    assert.equal(sameBody.result.futureFixtures[0]?.revision, revision);
    assert.equal(sameBody.changes.length, 0);

    lab.fixtures[0] = fixture('stable-1', TEAM, 'football:xx:gost', 'scheduled', '2027-03-03T18:00:00Z', '2027-03-03', '19:00');
    cursor += 16 * 60_000;
    const moved = await post(mf, token, stamp(), { refresh: true });
    const movedBody = moved.body as FindFixturesHttpSuccess;
    assert.equal(movedBody.result.futureFixtures[0]?.id, fixtureId);
    assert.equal(movedBody.changes[0]?.kind, 'rescheduled');

    lab.fixtures[0] = { ...lab.fixtures[0], status: 'postponed' };
    cursor += 16 * 60_000;
    const postponed = await post(mf, token, stamp(), { refresh: true });
    const postponedBody = postponed.body as FindFixturesHttpSuccess;
    assert.equal(postponedBody.changes[0]?.kind, 'postponed');
    assert.equal(postponedBody.changes[0]?.fixtureId, fixtureId);
    assert.equal(postponedBody.result.futureFixtures[0]?.status, 'postponed');

    lab.fixtures[0] = { ...lab.fixtures[0], status: 'cancelled' };
    cursor += 16 * 60_000;
    const cancelled = await post(mf, token, stamp(), { refresh: true });
    const cancelledBody = cancelled.body as FindFixturesHttpSuccess;
    assert.equal(cancelledBody.changes.some((change) => change.kind === 'cancelled' && change.fixtureId === fixtureId), true);
    assert.equal(cancelledBody.result.futureFixtures.some((item) => item.id === fixtureId), false);

    lab.fixtures[0] = fixture('stable-1', TEAM, 'football:xx:gost');
    cursor += 16 * 60_000;
    const restored = await post(mf, token, stamp(), { refresh: true });
    assert.equal((restored.body as FindFixturesHttpSuccess).result.futureFixtures[0]?.id, fixtureId);

    for (const failure of ['timeout', 'rate_limited', 'unexpected_empty', 'incomplete_page'] as const) {
      lab.failure = failure;
      cursor += 16 * 60_000;
      const held = await post(mf, token, stamp(), { refresh: true });
      const heldBody = held.body as FindFixturesHttpSuccess;
      assert.equal(held.status, 200, failure);
      assert.equal(heldBody.result.futureFixtures.some((item) => item.id === fixtureId), true, failure);
      assert.equal(heldBody.teams.some((item) => item.id === 'football:xx:gost'), true, failure);
      assert.equal(heldBody.changes.some((change) => change.kind === 'cancelled'), false, failure);
    }

    lab.failure = 'none';
    lab.fixtures = [fixture('stable-2', TEAM, 'football:xx:drugi')];
    cursor += 16 * 60_000;
    const omitted = await post(mf, token, stamp(), { refresh: true });
    const omittedBody = omitted.body as FindFixturesHttpSuccess;
    assert.equal(omittedBody.result.futureFixtures.some((item) => item.id === fixtureId), true);
    assert.equal(omittedBody.changes.some((change) => change.kind === 'cancelled'), false);
  } finally {
    await mf.dispose();
  }
});

test('workerd opoziv u minutu briše i drugi klub', async () => {
  const lab = freshLab();
  lab.fixtures.push(fixture('zvezda-1', ZVEZDA, 'football:xx:gost'));
  const mf = new Miniflare(options(lab, {}));
  const token = signToken('user-1', START);
  try {
    assert.equal((await post(mf, token, START)).status, 200);
    const zvezda = await post(mf, token, '2027-01-15T12:00:30.000Z', {
      sport: 'football',
      teamId: ZVEZDA,
      seasonId: '2026-2027',
      refresh: false,
    });
    assert.ok((zvezda.body as FindFixturesHttpSuccess).result.futureFixtures.length > 0);
    const fetches = lab.fixtureFetches;
    lab.publication = 'forbidden';
    const hidden = await post(mf, token, '2027-01-15T12:01:00.000Z', { refresh: true });
    const hiddenBody = hidden.body as FindFixturesHttpSuccess;
    assert.equal(hiddenBody.result.futureFixtures.length, 0);
    assert.equal(hiddenBody.result.checkedAt, null);
    assert.equal(hiddenBody.changes.length, 0);
    assert.equal(lab.fixtureFetches, fetches);
    const other = await post(mf, token, '2027-01-15T12:01:30.000Z', {
      sport: 'football',
      teamId: ZVEZDA,
      seasonId: '2026-2027',
      refresh: true,
    });
    const otherBody = other.body as FindFixturesHttpSuccess;
    assert.equal(otherBody.result.futureFixtures.length, 0);
    assert.equal(otherBody.result.checkedAt, null);
  } finally {
    await mf.dispose();
  }
});

test('workerd produkcija ostaje source-blocked i ne zove izvor', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, { mode: 'production' }));
  const now = new Date().toISOString();
  const token = signToken('user-1', now);
  try {
    const response = await post(mf, token, now, {}, false);
    const body = response.body as FindFixturesHttpSuccess;
    assert.equal(response.status, 200);
    assert.equal(body.kind, 'source-blocked');
    assert.equal(body.result.futureFixtures.length, 0);
    assert.equal(body.result.checkedAt, null);
    assert.equal(body.changes.length, 0);
    assert.equal(body.result.coverage.some((row) => row.publication === 'allowed'), false);
    assert.equal(body.result.coverage.every((row) => row.publication === 'unknown'), true);
    assert.equal(body.result.coverage.some((row) => row.evidence.includes('10 ms')), false);
    assert.equal(body.result.coverage.some((row) => row.evidence.includes('unknown')), true);
    assert.equal(lab.fixtureFetches, 0);
    assert.equal(lab.unexpected, 0);
  } finally {
    await mf.dispose();
  }
});

test('workerd odgovor drži manifeste samo sporta koji je tražen', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, { mode: 'production' }));
  const now = new Date().toISOString();
  const token = signToken('user-1', now);
  const football = { sport: 'football', teamId: TEAM, seasonId: '2026-2027', refresh: false };
  const basketball = { sport: 'basketball', teamId: 'basketball:rs:partizan', seasonId: '2026-2027', refresh: false };
  try {
    const first = await post(mf, token, now, football, false);
    const firstBody = first.body as FindFixturesHttpSuccess;
    assert.equal(first.status, 200);
    assert.equal(firstBody.kind, 'source-blocked');
    assert.ok(firstBody.manifests.length > 0);
    assert.equal(firstBody.manifests.every((item) => item.competitionId.startsWith('football:')), true);
    assert.equal(firstBody.competitions.every((item) => item.sport === 'football'), true);
    const superliga = firstBody.manifests.find((item) => item.provider === 'fss' && item.competitionId === 'football:domestic:superliga-srbije');
    assert.ok(superliga?.lastAttemptAt);

    const kk = await post(mf, token, now, basketball, false);
    const kkBody = kk.body as FindFixturesHttpSuccess;
    assert.equal(kk.status, 200);
    assert.equal(kkBody.kind, 'source-blocked');
    assert.ok(kkBody.manifests.length > 0);
    assert.equal(kkBody.manifests.every((item) => item.competitionId.startsWith('basketball:')), true);
    assert.equal(kkBody.competitions.every((item) => item.sport === 'basketball'), true);
    assert.equal(kkBody.teams.some((item) => item.id === 'basketball:rs:partizan' && item.sport === 'basketball'), true);
    assert.equal(kkBody.teams.every((item) => item.sport === 'basketball'), true);

    const third = await post(mf, token, now, football, false);
    const thirdBody = third.body as FindFixturesHttpSuccess;
    assert.equal(third.status, 200);
    assert.equal(thirdBody.manifests.length, firstBody.manifests.length);
    assert.equal(thirdBody.manifests.every((item) => item.competitionId.startsWith('football:')), true);
    assert.equal(thirdBody.competitions.every((item) => item.sport === 'football'), true);
    const kept = thirdBody.manifests.find((item) => item.provider === 'fss' && item.competitionId === 'football:domestic:superliga-srbije');
    assert.equal(kept?.lastAttemptAt, superliga?.lastAttemptAt);
    assert.equal(thirdBody.result.cacheStatus, 'throttled');
    assert.equal(lab.fixtureFetches, 0);
  } finally {
    await mf.dispose();
  }
});

test('workerd kvote po nalogu, IP i globalno opstaju posle gašenja', async () => {
  const limits: QuotaLimits = { ...DEFAULT_QUOTA_LIMITS, userRequests: 1, userFresh: 1, ipRequests: 10, ipFresh: 10, globalUpstream: 100, ipAuthFailures: 30 };
  const lab = freshLab();
  const mf = new Miniflare(options(lab, { limits }));
  const token = signToken('user-1', START);
  try {
    assert.equal((await post(mf, token, START)).status, 200);
    await mf.unsafeEvictDurableObject('matchahead-schedule', 'ScheduleDirectoryObject', { name: SCHEDULE_OBJECT_NAME });
    const again = await post(mf, token, '2027-01-15T12:20:00.000Z', { refresh: true });
    assert.equal(again.status, 429);
    assert.equal((again.body as { error: { code: string } }).error.code, 'quota_user');
    assert.equal(lab.fixtureFetches, 1);
  } finally {
    await mf.dispose();
  }

  const shared = freshLab();
  const sharedMf = new Miniflare(options(shared, { limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1, userRequests: 10 } }));
  try {
    assert.equal((await post(sharedMf, signToken('user-1', START), START)).status, 200);
    const second = await post(sharedMf, signToken('user-2', START), START);
    assert.equal(second.status, 429);
    assert.equal((second.body as { error: { code: string } }).error.code, 'quota_ip');
    assert.equal(shared.fixtureFetches, 1);
  } finally {
    await sharedMf.dispose();
  }

  const global = freshLab();
  const globalMf = new Miniflare(options(global, { limits: { ...DEFAULT_QUOTA_LIMITS, globalUpstream: 0 } }));
  try {
    const denied = await post(globalMf, signToken('user-1', START), START);
    assert.equal(denied.status, 429);
    assert.equal((denied.body as { error: { code: string } }).error.code, 'quota_global');
    assert.equal(global.fixtureFetches, 0);
  } finally {
    await globalMf.dispose();
  }
});

test('workerd zaustavlja neuspele prijave pre provere i ne veruje X-Forwarded-For', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, { limits: { ...DEFAULT_QUOTA_LIMITS, ipAuthFailures: 1 } }));
  const good = signToken('user-1', START);
  try {
    const bad = await post(mf, `${good.slice(0, -4)}aaaa`, START);
    assert.equal(bad.status, 401);
    assert.equal(JSON.stringify(bad.body).includes(good), false);
    const certs = lab.certFetches;
    const blocked = await post(mf, good, '2027-01-15T14:00:00.000Z');
    assert.equal(blocked.status, 429);
    assert.equal((blocked.body as { error: { code: string } }).error.code, 'quota_ip');
    assert.equal(lab.certFetches, certs);
  } finally {
    await mf.dispose();
  }

  const untrusted = freshLab();
  const untrustedMf = new Miniflare(options(untrusted, { limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1 }, trustProxy: false }));
  const token = signToken('user-1', START);
  try {
    assert.equal((await post(untrustedMf, token, START)).status, 200);
    const forwarded = await post(untrustedMf, token, '2027-01-15T12:20:00.000Z', { refresh: true }, true, { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(forwarded.status, 429);
  } finally {
    await untrustedMf.dispose();
  }

  const trusted = freshLab();
  const trustedMf = new Miniflare(options(trusted, { limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1 }, trustProxy: true }));
  try {
    const first = await post(trustedMf, token, START, {}, true, { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(first.status, 200);
    const second = await post(trustedMf, token, START, {}, true, { 'x-forwarded-for': '203.0.113.10' });
    assert.equal(second.status, 200);
  } finally {
    await trustedMf.dispose();
  }
});

test('workerd CORS, token u URL-u i tuđe vreme', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, {}));
  const token = signToken('user-1', START);
  try {
    const leaked = await mf.dispatchFetch('https://schedule.local/api/find-fixtures?access_token=SUPER-SECRET-URL', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: ORIGIN, 'x-matchahead-test-now': START },
      body: JSON.stringify({ sport: 'football', teamId: TEAM, seasonId: '2026-2027', refresh: false }),
    });
    const leakedText = await leaked.text();
    assert.equal(leaked.status, 401);
    assert.equal(leakedText.includes('SUPER-SECRET-URL'), false);

    const forbidden = await post(mf, token, START, {}, true, { origin: 'https://evil.example' });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
    const allowed = await post(mf, token, START);
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');

    const preflight = await mf.dispatchFetch('https://schedule.local/api/find-fixtures', { method: 'OPTIONS', headers: { origin: ORIGIN } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);

    const extra = await post(mf, token, START, { now: '1999-01-01T00:00:00Z' });
    assert.equal(extra.status, 400);
    assert.equal((extra.body as { error: { code: string } }).error.code, 'invalid_body');
  } finally {
    await mf.dispose();
  }
});

test('čitanje tela odustaje i sledeće čitanje radi', async () => {
  const hung = new Request('https://schedule.local/api/find-fixtures', {
    method: 'POST',
    body: new ReadableStream({
      pull() {
        return new Promise(() => undefined);
      },
    }),
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(() => readBodyText(hung, 80, 4096), BodyTimeout);
  const ready = new Request('https://schedule.local/api/find-fixtures', { method: 'POST', body: '{"ok":true}' });
  assert.equal(await readBodyText(ready, 80, 4096), '{"ok":true}');
});

test('workerd ne drži red zbog zaglavljenog tela', async () => {
  const lab = freshLab();
  const mf = new Miniflare(options(lab, { ioTimeoutMs: 200 }));
  const token = signToken('user-1', START);
  let socket: net.Socket | undefined;
  try {
  const direct = await mf.unsafeGetDirectURL('matchahead-schedule');
  socket = net.connect({ host: direct.hostname, port: Number(direct.port) });
  await new Promise<void>((resolve, reject) => {
    socket?.once('connect', () => resolve());
    socket?.once('error', reject);
  });
  let raw = '';
  socket.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  socket.write([
    'POST /api/find-fixtures HTTP/1.1',
    `Host: ${direct.host}`,
    'Content-Type: application/json',
    `Origin: ${ORIGIN}`,
    `Authorization: Bearer ${token}`,
    `x-matchahead-test-now: ${START}`,
    'Content-Length: 80',
    'Connection: close',
    '',
    '{',
  ].join('\r\n'));
    const started = Date.now();
    const ok = await post(mf, token, START);
    assert.equal(ok.status, 200);
    assert.ok(Date.now() - started < 1500, String(Date.now() - started));
    const deadline = Date.now() + 1500;
    while (!raw.includes('payload_too_large') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.match(raw, /^HTTP\/1\.[01] 400/);
    assert.match(raw, /payload_too_large/);
    assert.equal(raw.includes(token), false);
    assert.equal(lab.fixtureFetches, 1);
    const again = await post(mf, token, '2027-01-15T12:01:00.000Z');
    assert.equal(again.status, 200);
    assert.equal(lab.fixtureFetches, 1);
  } finally {
    socket?.destroy();
    await mf.dispose();
  }
});

test('workerd prekida zaglavljen sertifikat i pušta sledeći zahtev', async () => {
  const lab = freshLab();
  lab.hangCertsRemaining = 1;
  const mf = new Miniflare(options(lab, { ioTimeoutMs: 200 }));
  const token = signToken('user-1', START);
  try {
    const first = post(mf, token, START);
    const deadline = Date.now() + 1000;
    while (lab.certFetches < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(lab.certFetches >= 1, true);
    const started = Date.now();
    const second = await post(mf, signToken('user-2', START), '2027-01-15T12:00:30.000Z');
    assert.equal(second.status, 200);
    assert.ok(Date.now() - started < 2000, String(Date.now() - started));
    const blocked = await first;
    assert.equal(blocked.status, 401);
    assert.equal(JSON.stringify(blocked.body).includes(token), false);
    assert.ok(lab.certFetches >= 2);
  } finally {
    await mf.dispose();
  }
});

test('workerd dozvoljeni HTML prolazi kroz pravi FSS parser i preživljava gašenje', async () => {
  const lab = freshLab();
  lab.document = superligaHtml();
  const mf = new Miniflare(options(lab, { labKind: 'html', labParser: 'fss' }));
  const token = signToken('user-1', START);
  try {
    const created = await post(mf, token, START);
    assert.equal(created.status, 200);
    const createdBody = created.body as FindFixturesHttpSuccess;
    assert.equal(createdBody.kind, 'synthetic-demo');
    const fixture = createdBody.result.futureFixtures.find((item) => item.id.endsWith(':fss:partizan-gost-01'));
    assert.ok(
      fixture,
      JSON.stringify({
        count: createdBody.result.futureFixtures.length,
        ids: createdBody.result.futureFixtures.slice(0, 3).map((item) => item.id),
        coverage: createdBody.result.coverage.map((row) => ({
          provider: row.provider,
          publication: row.publication,
          availability: row.scheduleAvailability,
          evidence: row.evidence.slice(0, 180),
        })),
      }),
    );
    assert.equal(fixture.startsAtUtc, null);
    assert.equal(fixture.timeConfirmed, false);
    assert.equal(fixture.status, 'time_tbd');
    assert.equal(fixture.scheduledLocalDate, '2027-02-01');
    assert.equal(fixture.round, '1');
    assert.equal(fixture.seasonId, '2026-2027');
    assert.match(fixture.sourceUrl, /fss\.rs/);
    assert.equal(fixture.provider, 'fss');
    assert.equal(/:k\d+-/.test(fixture.id), false);
    assert.equal(createdBody.result.futureFixtures.length, 26);
    const partizan = createdBody.teams.find((item) => item.id === 'football:rs:partizan');
    const gost = createdBody.teams.find((item) => item.id === 'football:xx:gost-01');
    const zvezda = createdBody.teams.find((item) => item.id === 'football:rs:crvena-zvezda');
    assert.equal(partizan?.sport, 'football');
    assert.equal(partizan?.name, 'FK Partizan');
    assert.equal(gost?.sport, 'football');
    assert.equal(gost?.country, 'xx');
    assert.equal(gost?.name, 'gost-01');
    assert.equal(gost?.city, '');
    assert.deepEqual(gost?.aliases, []);
    assert.deepEqual(gost?.providerIds, {});
    assert.equal(zvezda?.sport, 'football');
    assert.equal(zvezda?.name, 'FK Crvena zvezda');
    const coverage = createdBody.result.coverage.find((row) => row.provider === 'fss');
    assert.equal(coverage?.publication, 'allowed');
    assert.equal(coverage?.scheduleAvailability, 'published');
    assert.match(coverage?.evidence ?? '', /Parsiranje u ovom procesu/);
    assert.doesNotMatch(coverage?.evidence ?? '', /10 ms/);
    assert.equal(lab.fixtureFetches, 1);
    const revision = fixture.revision;

    await mf.unsafeEvictDurableObject('matchahead-schedule', 'ScheduleDirectoryObject', { name: SCHEDULE_OBJECT_NAME });
    const again = await post(mf, token, '2027-01-15T12:01:00.000Z');
    const againBody = again.body as FindFixturesHttpSuccess;
    const kept = againBody.result.futureFixtures.find((item) => item.id === fixture.id);
    assert.equal(kept?.revision, revision);
    assert.equal(lab.fixtureFetches, 1);
  } finally {
    await mf.dispose();
  }
});

test('workerd dozvoljeni PDF ide kroz inflate u objektu', async () => {
  const lab = freshLab();
  lab.document = tinyPdf([
    '[(Thursday, 24 September 2026)] TJ',
    '[(20:00)] TJ',
    '[(18:00)] TJ',
    '[(CRVENA ZVEZDA MERIDIANBET BELGRADE)] TJ',
    '[(ZALGIRIS KAUNAS)] TJ',
  ].join(' '));
  const mf = new Miniflare(options(lab, { labKind: 'pdf', labParser: 'euroleague' }));
  const token = signToken('user-1', START);
  try {
    const response = await post(mf, token, START, {
      sport: 'basketball',
      teamId: 'basketball:rs:crvena-zvezda',
    });
    assert.equal(response.status, 200);
    const body = response.body as FindFixturesHttpSuccess;
    assert.equal(body.kind, 'synthetic-demo');
    assert.equal(body.result.futureFixtures.length, 0);
    const coverage = body.result.coverage.find((row) => row.provider === 'euroleague');
    assert.equal(coverage?.publication, 'allowed');
    assert.match(coverage?.evidence ?? '', /pdftotext se ne poziva/);
    assert.match(coverage?.evidence ?? '', /redova 1/);
    assert.match(coverage?.evidence ?? '', /ms zida/);
    assert.equal(lab.fixtureFetches, 1);
  } finally {
    await mf.dispose();
  }
});

test('workerd meri sačuvani FSS HTML', { skip: existsSync('/tmp/ma-sources/fss.html') ? false : 'nema /tmp/ma-sources/fss.html' }, async () => {
  const lab = freshLab();
  lab.document = readFileSync('/tmp/ma-sources/fss.html', 'utf8');
  const mf = new Miniflare(options(lab, { labKind: 'html', labParser: 'fss', ioTimeoutMs: 20_000 }));
  const token = signToken('user-1', new Date().toISOString());
  try {
    const response = await post(mf, token, new Date().toISOString(), {}, false);
    const body = response.body as FindFixturesHttpSuccess;
    assert.equal(response.status, 200);
    const evidence = body.result.coverage.find((row) => row.provider === 'fss')?.evidence ?? '';
    assert.match(evidence, /blokova/);
    const wall = /Parsiranje u ovom procesu: ([0-9.]+) ms/.exec(evidence);
    assert.ok(wall);
    console.log(`fss-html-wall-ms=${wall?.[1]}`);
  } finally {
    await mf.dispose();
  }
});

test('workerd meri sačuvani Evroliga PDF', { skip: existsSync('/tmp/ma-sources/el-2026-27.pdf') ? false : 'nema /tmp/ma-sources/el-2026-27.pdf', timeout: 120_000 }, async () => {
  const lab = freshLab();
  lab.document = new Uint8Array(readFileSync('/tmp/ma-sources/el-2026-27.pdf'));
  const mf = new Miniflare(options(lab, { labKind: 'pdf', labParser: 'euroleague', ioTimeoutMs: 20_000 }));
  const token = signToken('user-1', new Date().toISOString());
  try {
    const response = await post(mf, token, new Date().toISOString(), {
      sport: 'basketball',
      teamId: 'basketball:rs:crvena-zvezda',
    }, false);
    const body = response.body as FindFixturesHttpSuccess;
    assert.equal(response.status, 200);
    const evidence = body.result.coverage.find((row) => row.provider === 'euroleague')?.evidence ?? '';
    assert.match(evidence, /redova 380/);
    assert.match(evidence, /pdftotext se ne poziva/);
    const wall = /Parsiranje u ovom procesu: ([0-9.]+) ms/.exec(evidence);
    assert.ok(wall);
    console.log(`euroleague-pdf-wall-ms=${wall?.[1]}`);
  } finally {
    await mf.dispose();
  }
});

test('workerd jedna ligaška strana služi oba košarkaška kluba', async () => {
  const partizan = 'basketball:rs:partizan';
  const zvezda = 'basketball:rs:crvena-zvezda';
  const derby = () => fixture('derbi', partizan, zvezda, 'scheduled', '2027-03-02T18:00:00Z', '2027-03-02', '19:00');
  const basketball = (teamId: string, refresh = false) => ({
    sport: 'basketball',
    teamId,
    seasonId: '2026-2027',
    refresh,
  });
  const lab = freshLab();
  lab.fixtures = [derby(), fixture('gost-p', partizan, 'basketball:xx:gost'), fixture('gost-z', zvezda, 'basketball:xx:gost')];
  const mf = new Miniflare(options(lab, {}));
  const token = signToken('user-1', START);
  try {
    const first = await post(mf, token, START, basketball(partizan));
    const second = await post(mf, token, START, basketball(zvezda));
    const third = await post(mf, token, START, basketball(partizan));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);
    assert.equal(lab.fixtureFetches, 1);
    const firstBody = first.body as FindFixturesHttpSuccess;
    const secondBody = second.body as FindFixturesHttpSuccess;
    const left = firstBody.result.futureFixtures.find((item) => item.id.includes('derbi'));
    const right = secondBody.result.futureFixtures.find((item) => item.id.includes('derbi'));
    assert.ok(left && right);
    assert.equal(left.id, right.id);
    assert.equal(left.revision, right.revision);
    assert.equal(secondBody.result.cacheStatus, 'reused');
    assert.equal(secondBody.result.upstreamRequests, 0);
    assert.equal(secondBody.result.futureFixtures.length, 2);
    assert.equal(secondBody.teams.some((item) => item.id === partizan && item.name === 'KK Partizan'), true);
    assert.equal(secondBody.teams.some((item) => item.id === 'basketball:xx:gost' && item.city === ''), true);
    const coverage = secondBody.result.coverage.find((row) => row.provider === 'lab');
    assert.equal(coverage?.competitionId, 'basketball:regional:aba-liga');
    assert.equal(coverage?.scheduleAvailability, 'published');
    assert.equal((third.body as FindFixturesHttpSuccess).result.cacheStatus, 'reused');

    await mf.unsafeEvictDurableObject('matchahead-schedule', 'ScheduleDirectoryObject', { name: SCHEDULE_OBJECT_NAME });
    const evicted = await post(mf, token, '2027-01-15T12:05:00.000Z', basketball(zvezda));
    assert.equal(lab.fixtureFetches, 1);
    assert.equal((evicted.body as FindFixturesHttpSuccess).result.futureFixtures.length, 2);

    const throttled = await post(mf, token, '2027-01-15T12:10:00.000Z', basketball(zvezda, true));
    assert.equal(lab.fixtureFetches, 1);
    assert.equal((throttled.body as FindFixturesHttpSuccess).result.cacheStatus, 'throttled');
    const refreshed = await post(mf, token, '2027-01-15T12:21:00.000Z', basketball(partizan, true));
    assert.equal(lab.fixtureFetches, 2);
    const reused = await post(mf, token, '2027-01-15T18:20:00.000Z', basketball(zvezda));
    assert.equal(lab.fixtureFetches, 2);
    assert.equal((reused.body as FindFixturesHttpSuccess).result.cacheStatus, 'reused');
    const stale = await post(mf, token, '2027-01-15T18:22:00.000Z', basketball(partizan));
    assert.equal(lab.fixtureFetches, 3);
    assert.equal((stale.body as FindFixturesHttpSuccess).result.futureFixtures.some((item) => item.id === left.id), true);

    lab.fixtures[0] = fixture('derbi', partizan, zvezda, 'scheduled', '2027-03-04T19:00:00Z', '2027-03-04', '20:00');
    const moved = await post(mf, token, '2027-01-15T18:40:00.000Z', basketball(partizan, true));
    const movedDerby = (moved.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.id.includes('derbi'));
    const followed = await post(mf, token, '2027-01-15T18:45:00.000Z', basketball(zvezda));
    const followedDerby = (followed.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.id.includes('derbi'));
    assert.ok(movedDerby && followedDerby);
    assert.equal(movedDerby.revision, followedDerby.revision);
    assert.equal(movedDerby.revision > left.revision, true);
    const noop = await post(mf, token, '2027-01-15T19:05:00.000Z', basketball(zvezda, true));
    const noopDerby = (noop.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.id.includes('derbi'));
    assert.equal(noopDerby?.revision, movedDerby.revision);
    assert.equal((noop.body as FindFixturesHttpSuccess).changes.length, 0);

    const fetches = lab.fixtureFetches;
    lab.failure = 'timeout';
    const held = await post(mf, token, '2027-01-15T19:30:00.000Z', basketball(partizan, true));
    assert.equal(lab.fixtureFetches, fetches);
    assert.equal((held.body as FindFixturesHttpSuccess).result.futureFixtures.some((item) => item.id === movedDerby.id), true);
    const heldOther = await post(mf, token, '2027-01-15T19:35:00.000Z', basketball(zvezda, true));
    assert.equal(lab.fixtureFetches, fetches);
    assert.equal((heldOther.body as FindFixturesHttpSuccess).result.futureFixtures.some((item) => item.id === movedDerby.id), true);

    lab.failure = 'none';
    lab.publication = 'unknown';
    const revoked = await post(mf, token, '2027-01-15T19:55:00.000Z', basketball(partizan, true));
    assert.equal((revoked.body as FindFixturesHttpSuccess).result.futureFixtures.length, 0);
    assert.equal((revoked.body as FindFixturesHttpSuccess).result.checkedAt, null);
    const otherRevoked = await post(mf, token, '2027-01-15T19:56:00.000Z', basketball(zvezda));
    assert.equal((otherRevoked.body as FindFixturesHttpSuccess).result.futureFixtures.length, 0);
    assert.equal(lab.fixtureFetches, fetches);
    lab.publication = 'allowed';
    lab.fixtures[0] = fixture('derbi-2', partizan, zvezda, 'scheduled', '2027-03-06T19:00:00Z', '2027-03-06', '20:00');
    const restored = await post(mf, token, '2027-01-15T20:20:00.000Z', basketball(zvezda, true));
    const restoredBody = restored.body as FindFixturesHttpSuccess;
    assert.equal(lab.fixtureFetches, fetches + 1);
    assert.equal(restoredBody.result.futureFixtures.some((item) => item.id.includes('derbi-2')), true);
    assert.equal(restoredBody.result.checkedAt !== null, true);
  } finally {
    await mf.dispose();
  }
});

test('workerd istovremeni klubovi i globalna kvota dele jedno preuzimanje lige', async () => {
  const partizan = 'basketball:rs:partizan';
  const zvezda = 'basketball:rs:crvena-zvezda';
  const basketball = (teamId: string) => ({ sport: 'basketball', teamId, seasonId: '2026-2027', refresh: false });
  const lab = freshLab();
  lab.fixtures = [fixture('derbi', partizan, zvezda, 'scheduled', '2027-03-02T18:00:00Z', '2027-03-02', '19:00')];
  const mf = new Miniflare(options(lab, {}));
  const token = signToken('user-1', START);
  try {
    const [left, right] = await Promise.all([
      post(mf, token, START, basketball(partizan)),
      post(mf, token, START, basketball(zvezda)),
    ]);
    assert.equal(left.status, 200);
    assert.equal(right.status, 200);
    assert.equal(lab.fixtureFetches, 1);
    const leftId = (left.body as FindFixturesHttpSuccess).result.futureFixtures[0];
    const rightId = (right.body as FindFixturesHttpSuccess).result.futureFixtures[0];
    assert.equal(leftId?.id, rightId?.id);
    assert.equal(leftId?.revision, rightId?.revision);
  } finally {
    await mf.dispose();
  }

  const limited = freshLab();
  limited.fixtures = [fixture('derbi', partizan, zvezda, 'scheduled', '2027-03-02T18:00:00Z', '2027-03-02', '19:00')];
  const limitedMf = new Miniflare(options(limited, { limits: { ...DEFAULT_QUOTA_LIMITS, globalUpstream: 1 } }));
  try {
    assert.equal((await post(limitedMf, token, START, basketball(partizan))).status, 200);
    assert.equal((await post(limitedMf, token, START, basketball(zvezda))).status, 200);
    assert.equal(limited.fixtureFetches, 1);
    const denied = await post(limitedMf, token, '2027-01-15T12:20:00.000Z', { ...basketball(partizan), refresh: true });
    assert.equal(denied.status, 429);
    assert.equal((denied.body as { error: { code: string } }).error.code, 'quota_global');
    assert.equal(limited.fixtureFetches, 1);
  } finally {
    await limitedMf.dispose();
  }
});

interface LabFixture {
  providerFixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledLocalDate: string;
  printedLocalTime: string;
  startsAtUtc: string;
  status: FixtureStatus;
  venue: string | null;
}

interface LabState {
  publication: 'allowed' | 'forbidden' | 'unknown';
  failure: FetchFailureKind;
  fixtures: LabFixture[];
  fixtureFetches: number;
  certFetches: number;
  unexpected: number;
  document: string | Uint8Array | null;
  hangCertsRemaining: number;
}

function freshLab(): LabState {
  return {
    publication: 'allowed',
    failure: 'none',
    fixtures: [fixture('stable-1', TEAM, 'football:xx:gost')],
    fixtureFetches: 0,
    certFetches: 0,
    unexpected: 0,
    document: null,
    hangCertsRemaining: 0,
  };
}

function fixture(
  id: string,
  home: string,
  away: string,
  status: FixtureStatus = 'scheduled',
  startsAtUtc = '2027-03-02T16:00:00Z',
  scheduledLocalDate = '2027-03-02',
  printedLocalTime = '17:00',
  venue: string | null = 'stara sala',
): LabFixture {
  return { providerFixtureId: id, homeTeamId: home, awayTeamId: away, scheduledLocalDate, printedLocalTime, startsAtUtc, status, venue };
}

function options(lab: LabState, input: { mode?: string; limits?: QuotaLimits; trustProxy?: boolean; labKind?: string; labParser?: string; ioTimeoutMs?: number }) {
  const mode = input.mode ?? 'synthetic';
  return {
    workers: [
      {
        config: {
          name: 'matchahead-schedule',
          compatibilityDate: '2026-09-27',
          manifest: {
            mainModule: 'worker.js',
            modules: { 'worker.js': { type: 'esm', contents: workerSource } },
          },
          exports: {
            ScheduleDirectoryObject: { type: 'durable-object', storage: 'sqlite' },
          },
          env: {
            FIREBASE_PROJECT_ID: { type: 'text', value: 'matchahead' },
            SCHEDULE_MODE: { type: 'text', value: mode },
            SCHEDULE_ALLOWED_ORIGINS: { type: 'text', value: ORIGIN },
            SCHEDULE_TRUST_PROXY: { type: 'text', value: input.trustProxy ? '1' : '' },
            SCHEDULE_ALLOW_TEST_CLOCK: { type: 'text', value: mode === 'synthetic' ? '1' : '' },
            SCHEDULE_LAB_URL: { type: 'text', value: 'https://lab.schedule.test/fixtures' },
            SCHEDULE_LAB_KIND: { type: 'text', value: input.labKind ?? '' },
            SCHEDULE_LAB_PARSER: { type: 'text', value: input.labParser ?? '' },
            SCHEDULE_IO_TIMEOUT_MS: { type: 'text', value: input.ioTimeoutMs === undefined ? '' : String(input.ioTimeoutMs) },
            SCHEDULE_QUOTA_LIMITS: { type: 'text', value: JSON.stringify(input.limits ?? DEFAULT_QUOTA_LIMITS) },
            NODE_ENV: { type: 'text', value: 'test' },
            SCHEDULE: {
              type: 'durable-object',
              worker: 'matchahead-schedule',
              exportName: 'ScheduleDirectoryObject',
            },
          },
        },
        dev: {
          unsafeDirectSockets: [{ entrypoint: 'default' }],
          outboundService: {
            type: 'fetcher' as const,
            handler: async (request: Request) => {
              const url = new URL(request.url);
              if (url.hostname === 'www.googleapis.com' && url.pathname.includes('securetoken')) {
                lab.certFetches += 1;
                if (lab.hangCertsRemaining > 0) {
                  lab.hangCertsRemaining -= 1;
                  await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 3_000);
                    request.signal.addEventListener('abort', () => {
                      clearTimeout(timer);
                      reject(new Error('aborted'));
                    });
                  }).catch(() => undefined);
                  return new Response('aborted', { status: 504 });
                }
                return Response.json({ k1: certPem });
              }
              if (url.hostname === 'lab.schedule.test' && url.pathname === '/policy') {
                return Response.json({ publication: lab.publication, failure: lab.failure });
              }
              if (url.hostname === 'lab.schedule.test' && url.pathname === '/fixtures') {
                lab.fixtureFetches += 1;
                if (typeof lab.document === 'string') {
                  return new Response(lab.document, { headers: { 'content-type': 'text/html; charset=utf-8' } });
                }
                if (lab.document instanceof Uint8Array) {
                  return new Response(new Uint8Array(lab.document), { headers: { 'content-type': 'application/pdf' } });
                }
                return Response.json({ fixtures: lab.fixtures });
              }
              lab.unexpected += 1;
              return new Response('unexpected', { status: 500 });
            },
          },
        },
      },
    ],
  };
}

interface Reply {
  status: number;
  headers: { get(name: string): string | null };
  body: unknown;
}

async function post(
  mf: Miniflare,
  token: string,
  now: string,
  body: Record<string, unknown> = {},
  sendClock = true,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const requestHeaders: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    origin: ORIGIN,
    ...headers,
  };
  if (sendClock) requestHeaders['x-matchahead-test-now'] = now;
  const response = await mf.dispatchFetch('https://schedule.local/api/find-fixtures', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      sport: 'football',
      teamId: TEAM,
      seasonId: '2026-2027',
      refresh: false,
      ...body,
    }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) as unknown : null };
}

function signToken(uid: string, nowIso: string): string {
  const now = Date.parse(nowIso);
  const header = segment({ alg: 'RS256', kid: 'k1' });
  const payload = segment({
    aud: 'matchahead',
    iss: 'https://securetoken.google.com/matchahead',
    sub: uid,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 48 * 3600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function certificatePem(spki: Uint8Array): string {
  const oid = Uint8Array.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
  const sigAlg = seq(oid, Uint8Array.from([0x05, 0x00]));
  const version = tlv(0xa0, Uint8Array.from([0x02, 0x01, 0x02]));
  const serial = Uint8Array.from([0x02, 0x01, 0x01]);
  const validity = seq(tlv(0x17, new TextEncoder().encode('260101000000Z')), tlv(0x17, new TextEncoder().encode('270101000000Z')));
  const empty = seq();
  const tbs = seq(version, serial, sigAlg, empty, validity, empty, spki);
  const signature = tlv(0x03, concat(Uint8Array.of(0), new Uint8Array(8)));
  const der = seq(tbs, sigAlg, signature);
  const body = Buffer.from(der).toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derLen(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  const length = derLen(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
}

function seq(...parts: Uint8Array[]): Uint8Array {
  return tlv(0x30, concat(...parts));
}

function superligaHtml(): string {
  const chunks = ['<div>Mozzart Bet Super liga Srbije 2026/27</div>'];
  for (let round = 1; round <= 26; round += 1) {
    const day = String(round).padStart(2, '0');
    chunks.push(`<div class="fss-rezultati__title"> ${round}. kolo </div>`);
    if (round === 26) {
      chunks.push(fssMatch(day, 'PARTIZAN', 'CRVENA ZVEZDA'));
      continue;
    }
    chunks.push(fssMatch(day, 'PARTIZAN', `GOST ${day}`));
    chunks.push(fssMatch(day, 'CRVENA ZVEZDA', `DRUGI ${day}`));
  }
  return chunks.join('\n');
}

function fssMatch(day: string, home: string, away: string): string {
  return `<div class="fss-rezultati__one-date">${day}.02.2027 18:00</div><div class="fss-rezultati__one-city">Beograd</div><a class="fss-rezultati__teams"><div class="col-6">${home}</div><div class="col-6">${away}</div></a><div class="fss-rezultati__result"><div>/</div><div>/</div></div></div>`;
}

function tinyPdf(commands: string): Uint8Array {
  const stream = deflateSync(Buffer.from(commands));
  const head = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`);
  const tail = Buffer.from('\nendstream\nendobj\n');
  return new Uint8Array(Buffer.concat([head, stream, tail]));
}
