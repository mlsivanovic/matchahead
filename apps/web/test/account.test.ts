import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AccountGate, runOwned } from '../src/logic/account-gate.ts';
import { openingAction, resumeAccountDeletion } from '../src/logic/account-deletion.ts';
import { safeFirebaseMessage } from '../src/logic/auth-messages.ts';
import { readFirebaseSetup } from '../src/logic/firebase-config.ts';
import { buildProfile } from '../../../packages/domain/src/user-account.ts';
import { memoryStore } from '../src/logic/user-local.ts';
import { clearUserLocalContent } from '../src/logic/user-local.ts';

const NOW = '2026-09-30T12:00:00.000Z';

function profile() {
  return buildProfile({
    timeZone: 'Europe/Belgrade',
    favoriteTeamIds: ['football:rs:partizan'],
    reminderMinutes: 30,
    notifyScheduleChange: true,
    notifyCancellation: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test('kasni odgovor prethodnog uid-a ne puni novi prikaz', async () => {
  const gate = new AccountGate();
  const ticket = gate.beginUser('ana');
  gate.applyLoaded(ticket, {
    profile: profile(),
    followedTeamIds: ['football:rs:crvena-zvezda'],
    favoriteTeamIds: ['football:rs:partizan'],
    manualFixtureIds: [],
    email: 'ana@example.com',
  });
  const stale = gate.ticket();
  gate.showSignedOut(false, null);
  assert.equal(gate.applyLoaded(stale, {
    profile: profile(),
    followedTeamIds: ['football:rs:crvena-zvezda'],
    favoriteTeamIds: ['football:rs:partizan'],
    manualFixtureIds: ['football:football:demo:demo-liga:demo-sezona:demo:fx'],
    email: 'ana@example.com',
  }), false);
  const boris = gate.beginUser('boris');
  assert.equal(gate.applyLoaded(stale, {
    profile: profile(),
    followedTeamIds: ['football:rs:crvena-zvezda'],
    favoriteTeamIds: [],
    manualFixtureIds: [],
    email: 'ana@example.com',
  }), false);
  assert.equal(gate.email, null);
  assert.deepEqual(gate.followedTeamIds, []);
  let writes = 0;
  const result = await runOwned(gate, boris, async () => {
    gate.showSignedOut(false, null);
    if (!gate.shouldApply(boris)) return 'skipped';
    writes += 1;
    return 'wrote';
  });
  assert.equal(result, null);
  assert.equal(writes, 0);
});

test('prekid brisanja traži novu prijavu i ne skida zastavicu', async () => {
  assert.equal(openingAction({ deletionFlag: true, marker: false }), 'resume-deletion');
  assert.equal(openingAction({ deletionFlag: false, marker: true }), 'resume-deletion');
  assert.equal(openingAction({ deletionFlag: false, marker: false }), 'load');
  let flagged = false;
  const result = await resumeAccountDeletion({
    setFlag: () => {
      flagged = true;
    },
    clearFlag: () => {
      flagged = false;
    },
    deleteDocuments: async () => undefined,
    deleteAuthUser: async () => {
      throw { code: 'auth/requires-recent-login' };
    },
  });
  assert.equal(result, 'needs-recent-login');
  assert.equal(flagged, true);
  assert.equal(safeFirebaseMessage('auth/requires-recent-login').includes('ana@example.com'), false);
  assert.equal(safeFirebaseMessage('auth/internal-error').includes('token'), false);
  const network = safeFirebaseMessage('auth/network-request-failed');
  assert.equal(network.includes('Firebase'), false);
  assert.match(network, /Nema mreže/);
  assert.match(network, /Prijava nije uspela/);
});

test('prazna Firebase konfiguracija nije prijava', () => {
  assert.equal(readFirebaseSetup({}).kind, 'unconfigured');
  assert.equal(readFirebaseSetup({
    VITE_FIREBASE_API_KEY: 'demo',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-matchahead.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-matchahead',
    VITE_FIREBASE_APP_ID: '1:0:web:demo',
    VITE_FIREBASE_AUTH_EMULATOR_HOST: 'example.com:9099',
  }).kind, 'emulator-rejected');
  const ready = readFirebaseSetup({
    VITE_FIREBASE_API_KEY: 'demo',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-matchahead.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-matchahead',
    VITE_FIREBASE_APP_ID: '1:0:web:demo',
    VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  });
  assert.equal(ready.kind, 'ready');
  if (ready.kind === 'ready') assert.equal(ready.emulators.firestorePort, 8080);
});

test('odjava i dalje briše samo sesiju i taj uid', () => {
  const local = memoryStore({ 'matchahead.user.boris.note': 'tuđe' });
  const session = memoryStore({ 'matchahead.session.followedTeamIds': '["football:rs:partizan"]' });
  clearUserLocalContent(local, session, 'ana');
  assert.equal(session.getItem('matchahead.session.followedTeamIds'), null);
  assert.equal(local.getItem('matchahead.user.boris.note'), 'tuđe');
});

test('izvorni kod jezgra ne ugrađuje javni ključ ni trajni Firestore keš', () => {
  const rules = readFileSync(new URL('../../../firebase/firestore.rules', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/logic/firebase-config.ts', import.meta.url), 'utf8');
  assert.equal(rules.includes('AIza'), false);
  assert.equal(config.includes('AIza'), false);
  assert.equal(config.includes('persistentLocalCache'), false);
});
