import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { probeClickUrl } from '../src/click.ts';
import { timeFirestoreParse } from '../src/firestore-measure.ts';
import { classifyInstallationId } from '../src/ids.ts';
import { pilotRequestBudget } from '../src/limits.ts';
import { syntheticFcmMessage, SYNTHETIC_BODY } from '../src/message.ts';
import { decidePermission } from '../src/permission.ts';
import { createRateLimiter } from '../src/rate.ts';
import { parseRegistrationBody } from '../src/registration.ts';
import { secretMatches } from '../src/secret.ts';
import { selectableTeams } from '../../../packages/domain/src/selectable-teams.ts';
import { VALID_FID } from './helpers.ts';

const secureBase = {
  secureContext: true,
  notificationApi: true,
  serviceWorker: true,
  pushManager: true,
  permission: 'default' as const,
  ios: false,
  standalone: false,
};

test('dozvola se ne traži bez klika, posle odbijanja ni na klik', () => {
  assert.equal(decidePermission(secureBase, false).request, false);
  assert.equal(decidePermission(secureBase, true).request, true);
  const denied = decidePermission({ ...secureBase, permission: 'denied' }, true);
  assert.equal(denied.request, false);
  assert.equal(denied.action, 'show-denied');
  let requests = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (decidePermission({ ...secureBase, permission: 'denied' }, true).request) requests += 1;
  }
  assert.equal(requests, 0);
});

test('iPhone van početnog ekrana ne dobija prompt', () => {
  const decision = decidePermission({ ...secureBase, ios: true, standalone: false }, true);
  assert.equal(decision.action, 'show-ios-install');
  assert.equal(decision.request, false);
  assert.equal(decidePermission({ ...secureBase, ios: true, standalone: true }, true).request, true);
});

test('nesiguran kontekst i nepodržan browser ne traže dozvolu', () => {
  assert.equal(decidePermission({ ...secureBase, secureContext: false }, true).request, false);
  assert.equal(decidePermission({ ...secureBase, pushManager: false }, true).action, 'show-unsupported');
});

test('FID se razlikuje od starog registration tokena', () => {
  assert.equal(classifyInstallationId(VALID_FID), 'fid');
  assert.equal(classifyInstallationId(`f${'b'.repeat(21)}`), 'fid');
  assert.equal(classifyInstallationId(`b${'a'.repeat(21)}`), 'invalid');
  assert.equal(classifyInstallationId(`${'a'.repeat(40)}:APA91b${'x'.repeat(80)}`), 'legacy_token');
  assert.equal(classifyInstallationId('x'.repeat(140)), 'legacy_token');
});

test('klik vodi tačno na sintetičku putanju, i na podputanju', () => {
  const id = 'synthetic-11111111-2222-4333-8444-555555555555';
  assert.equal(
    probeClickUrl('https://primer.test', id),
    `https://primer.test/poruka.html?probe=synthetic&id=${id}`,
  );
  assert.equal(
    probeClickUrl('https://korisnik.github.io/matchahead', id),
    `https://korisnik.github.io/matchahead/poruka.html?probe=synthetic&id=${id}`,
  );
  assert.equal(
    probeClickUrl('http://127.0.0.1:4173/', id).startsWith('http://127.0.0.1:4173/poruka.html?'),
    true,
  );
  assert.throws(() => probeClickUrl('http://primer.test', id));
  assert.throws(() => probeClickUrl('https://user:pass@primer.test', id));
});

test('FCM telo cilja fid i ne meša stari token', () => {
  const id = 'synthetic-11111111-2222-4333-8444-555555555555';
  const clickUrl = probeClickUrl('https://primer.test', id);
  const message = syntheticFcmMessage({
    fid: VALID_FID,
    probeMessageId: id,
    clickUrl,
    iconUrl: 'https://primer.test/icons/icon-192.png',
  });
  assert.equal(message.message.fid, VALID_FID);
  assert.equal('token' in message.message, false);
  assert.equal(message.message.webpush.fcm_options.link, clickUrl);
  assert.equal(message.message.notification.body, SYNTHETIC_BODY);
  assert.equal(message.message.data.kind, 'synthetic-probe');
  assert.equal(message.message.data.clickPath, `/poruka.html?probe=synthetic&id=${id}`);
});

test('registracija prima samo četiri kluba, a protivnika ne proverava po katalogu', () => {
  assert.equal(selectableTeams().length, 4);
  for (const team of selectableTeams()) {
    const parsed = parseRegistrationBody({ fid: VALID_FID, followedTeamId: team.id, opponentLabel: 'Real Madrid' });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.opponentLabel, 'Real Madrid');
  }
  const rejected = parseRegistrationBody({ fid: VALID_FID, followedTeamId: 'football:rs:radnicki' });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error, 'team_not_selectable');
  const legacy = parseRegistrationBody({ fid: `${'tok'.repeat(30)}:APA91b`, token: 'stari' });
  assert.equal(legacy.ok, false);
  if (!legacy.ok) assert.equal(legacy.error, 'legacy_token_rejected');
});

test('tajna se poredi i kad je pogrešna, a prazna očekivana ne prolazi', async () => {
  assert.equal(await secretMatches('tačno', 'tačno'), true);
  assert.equal(await secretMatches('drugo', 'tačno'), false);
  assert.equal(await secretMatches('tačno', ''), false);
});

test('ograničenje broja pokušaja staje na granici', () => {
  const limiter = createRateLimiter();
  assert.equal(limiter.take('kljuc', 0, 3, 60_000), true);
  assert.equal(limiter.take('kljuc', 1, 3, 60_000), true);
  assert.equal(limiter.take('kljuc', 2, 3, 60_000), true);
  assert.equal(limiter.take('kljuc', 3, 3, 60_000), false);
  assert.equal(limiter.take('kljuc', 60_000, 3, 60_000), true);
});

test('pilot broj zahteva staje u besplatni dnevni limit, a prevelik batch ne', () => {
  const pilot = pilotRequestBudget({
    cronPerDay: 1440,
    sendsPerDay: 1000,
    registrationsPerDay: 50,
    firestoreReadsPerSend: 0,
  });
  assert.equal(pilot.fitsDailyRequestCap, true);
  assert.equal(pilot.subrequestsWarmSend, 1);
  assert.equal(pilot.subrequestsColdSend, 2);
  assert.equal(pilot.fitsSubrequestCap, true);
  const tooManyReads = pilotRequestBudget({
    cronPerDay: 0,
    sendsPerDay: 1,
    registrationsPerDay: 0,
    firestoreReadsPerSend: 49,
  });
  assert.equal(tooManyReads.fitsSubrequestCap, false);
});

test('parsiranje Firestore oblika je lokalno i označeno kao sintetičko', () => {
  const timed = timeFirestoreParse();
  assert.equal(timed.ok, true);
  assert.equal(timed.parseMs >= 0, true);
});

test('klijentski izvor ne zove stari API za token', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  for (const relative of ['src/client-entry.ts', 'src/sw-entry.ts', 'src/message.ts', 'src/worker.ts']) {
    const source = readFileSync(join(root, '..', relative), 'utf8');
    assert.equal(source.includes('getToken'), false, relative);
    assert.equal(source.includes('deleteToken'), false, relative);
    assert.equal(source.includes('firebase-admin'), false, relative);
    assert.equal(source.includes('BEGIN PRIVATE KEY'), false, relative);
  }
});
