import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  deleteUser,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  signInWithCredential,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
  terminate,
  type Firestore,
} from 'firebase/firestore';

import { firebaseErrorCode } from '../../src/logic/auth-messages.ts';
import {
  deleteOwnedDocuments,
  openDeletionMarker,
  readAgendaIds,
  writeDevice,
  writeFollow,
  writeManual,
  writeProfile,
} from '../../src/logic/account-remote.ts';
import { buildProfile } from '../../../../packages/domain/src/user-account.ts';
import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';

const PROJECT = 'demo-matchahead';
const AUTH_URL = 'http://127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const NOW = '2026-09-30T08:00:00.000Z';
const LATER = '2026-09-30T08:05:00.000Z';
const FIXTURE = 'football:football:demo:demo-liga:demo-sezona:demo:fx-zvezda-sever';
const INSTALLATION = 'deviceinstall0001';

let sequence = 0;

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  close: () => Promise<void>;
}

async function resetEmulators(): Promise<void> {
  const accounts = await fetch(`${AUTH_URL}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  const documents = await fetch(
    `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!accounts.ok || !documents.ok) throw new Error(`Emulator reset ${accounts.status} ${documents.status}`);
}

async function openClient(): Promise<Client> {
  sequence += 1;
  const app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: 'demo-matchahead.firebaseapp.com',
    projectId: PROJECT,
    appId: '1:0:web:demo',
  }, `client-${sequence}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
  return {
    app,
    auth,
    db,
    close: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

async function signInGoogle(auth: Auth, sub: string) {
  const credential = GoogleAuthProvider.credential(JSON.stringify({
    sub,
    email: `${sub}@example.com`,
    email_verified: true,
  }));
  return (await signInWithCredential(auth, credential)).user;
}

async function assertDenied(work: Promise<unknown>): Promise<void> {
  await assert.rejects(work, (error: unknown) => {
    const code = firebaseErrorCode(error);
    return code === 'permission-denied' || code === 'unauthenticated';
  });
}

function baseProfile(favoriteTeamIds: string[]) {
  return buildProfile({
    timeZone: 'Europe/Belgrade',
    favoriteTeamIds,
    reminderMinutes: 30,
    notifyScheduleChange: true,
    notifyCancellation: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test.beforeEach(async () => {
  await resetEmulators();
});

test('dva korisnika ne čitaju ni ne menjaju podatke jedan drugog', { timeout: 30_000 }, async () => {
  const ana = await openClient();
  const boris = await openClient();
  const guest = await openClient();
  try {
    const anaUser = await signInGoogle(ana.auth, 'anaSub');
    const borisUser = await signInGoogle(boris.auth, 'borisSub');
    assert.notEqual(anaUser.uid, borisUser.uid);
    await writeProfile(ana.db, anaUser.uid, baseProfile(['football:rs:crvena-zvezda']));
    await writeFollow(ana.db, anaUser.uid, {
      teamId: 'football:rs:crvena-zvezda',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await assertDenied(getDoc(doc(boris.db, 'users', anaUser.uid)));
    await assertDenied(writeProfile(boris.db, anaUser.uid, baseProfile(['football:rs:partizan'])));
    await assertDenied(getDoc(doc(guest.db, 'users', anaUser.uid)));
    await assertDenied(getDocs(collection(ana.db, 'users')));
    const own = await getDoc(doc(ana.db, 'users', anaUser.uid));
    assert.equal(own.data()?.favoriteTeamIds?.[0], 'football:rs:crvena-zvezda');
    await writeProfile(boris.db, borisUser.uid, baseProfile(['basketball:rs:partizan']));
    const borisView = await readAgendaIds(boris.db, borisUser.uid);
    assert.deepEqual(borisView.favoriteTeamIds, ['basketball:rs:partizan']);
    assert.deepEqual(borisView.followedTeamIds, []);
  } finally {
    await ana.close();
    await boris.close();
    await guest.close();
  }
});

test('odbija tuđa polja, pogrešne tipove i tim van četiri kluba', { timeout: 30_000 }, async () => {
  const client = await openClient();
  try {
    const user = await signInGoogle(client.auth, 'anaSub');
    const profile = baseProfile(selectableTeams().map((team) => team.id));
    await writeProfile(client.db, user.uid, profile);
    await assertDenied(setDoc(doc(client.db, 'users', user.uid), { ...profile, email: 'hidden@example.com' }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid), { ...profile, reminderMinutes: '30' }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid), {
      ...profile,
      favoriteTeamIds: ['football:xx:demo-rival-sever'],
    }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid), {
      ...profile,
      favoriteTeamIds: ['football:rs:partizan', 'football:rs:partizan'],
    }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid, 'follows', 'football:xx:demo-rival-sever'), {
      teamId: 'football:xx:demo-rival-sever',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid, 'follows', 'football:rs:partizan'), {
      teamId: 'football:rs:partizan',
      active: 'true',
      createdAt: NOW,
      updatedAt: NOW,
    }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid), { ...profile, createdAt: LATER, updatedAt: LATER }));
    await writeManual(client.db, user.uid, {
      fixtureId: FIXTURE,
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const agenda = await readAgendaIds(client.db, user.uid);
    assert.deepEqual(agenda.favoriteTeamIds, selectableTeams().map((team) => team.id));
    assert.deepEqual(agenda.manualFixtureIds, [FIXTURE]);
    await assertDenied(setDoc(doc(client.db, 'notifJobs', 'job-1'), { uid: user.uid, kind: 'reminder' }));
    await assertDenied(setDoc(doc(client.db, 'notificationDeliveries', 'delivery-1'), { uid: user.uid }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid, 'notifJobs', 'job-1'), { uid: user.uid }));
  } finally {
    await client.close();
  }
});

test('isti nalog vidi omiljene klubove sa drugog klijenta', { timeout: 30_000 }, async () => {
  const first = await openClient();
  const second = await openClient();
  try {
    const left = await signInGoogle(first.auth, 'anaSub');
    const right = await signInGoogle(second.auth, 'anaSub');
    assert.equal(left.uid, right.uid);
    await writeProfile(first.db, left.uid, baseProfile(['football:rs:partizan', 'basketball:rs:crvena-zvezda']));
    const seen = await getDoc(doc(second.db, 'users', right.uid));
    assert.deepEqual(seen.data()?.favoriteTeamIds, ['football:rs:partizan', 'basketball:rs:crvena-zvezda']);
  } finally {
    await first.close();
    await second.close();
  }
});

test('tokom brisanja drugi klijent ne može da vrati profil ni praćenje', { timeout: 30_000 }, async () => {
  const cleaner = await openClient();
  const otherDevice = await openClient();
  const bystander = await openClient();
  try {
    const owner = await signInGoogle(cleaner.auth, 'anaSub');
    const same = await signInGoogle(otherDevice.auth, 'anaSub');
    const boris = await signInGoogle(bystander.auth, 'borisSub');
    assert.equal(owner.uid, same.uid);
    await writeProfile(cleaner.db, owner.uid, baseProfile(['football:rs:crvena-zvezda']));
    await writeFollow(cleaner.db, owner.uid, {
      teamId: 'football:rs:crvena-zvezda',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await writeDevice(cleaner.db, owner.uid, {
      installationId: INSTALLATION,
      fid: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastSeenAt: NOW,
    });
    await writeProfile(bystander.db, boris.uid, baseProfile(['basketball:rs:partizan']));
    await openDeletionMarker(cleaner.db, owner.uid, LATER);
    await assertDenied(writeFollow(otherDevice.db, same.uid, {
      teamId: 'football:rs:partizan',
      active: true,
      createdAt: NOW,
      updatedAt: LATER,
    }));
    await assertDenied(writeProfile(otherDevice.db, same.uid, baseProfile(['football:rs:partizan'])));
    await assertDenied(writeDevice(otherDevice.db, same.uid, {
      installationId: 'deviceinstall0002',
      fid: null,
      createdAt: LATER,
      updatedAt: LATER,
      lastSeenAt: LATER,
    }));
    await assertDenied(writeManual(otherDevice.db, same.uid, {
      fixtureId: FIXTURE,
      active: true,
      createdAt: NOW,
      updatedAt: LATER,
    }));
    await deleteOwnedDocuments(cleaner.db, owner.uid, LATER);
    assert.equal((await getDoc(doc(cleaner.db, 'users', owner.uid))).exists(), false);
    assert.equal((await getDoc(doc(bystander.db, 'users', boris.uid))).exists(), true);
    await deleteUser(owner);
    await signOut(cleaner.auth);
    await assertDenied(getDoc(doc(cleaner.db, 'users', owner.uid)));
  } finally {
    await cleaner.close();
    await otherDevice.close();
    await bystander.close();
  }
});

test('prekinuto brisanje se nastavlja i ne dira drugog korisnika', { timeout: 30_000 }, async () => {
  const client = await openClient();
  const other = await openClient();
  try {
    const owner = await signInGoogle(client.auth, 'anaSub');
    const boris = await signInGoogle(other.auth, 'borisSub');
    await writeProfile(client.db, owner.uid, baseProfile(['football:rs:partizan']));
    await writeFollow(client.db, owner.uid, {
      teamId: 'football:rs:partizan',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await writeFollow(client.db, owner.uid, {
      teamId: 'basketball:rs:partizan',
      active: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await writeProfile(other.db, boris.uid, baseProfile(['football:rs:crvena-zvezda']));
    await openDeletionMarker(client.db, owner.uid, NOW);
    await deleteDoc(doc(client.db, 'users', owner.uid, 'follows', 'football:rs:partizan'));
    await deleteOwnedDocuments(client.db, owner.uid, LATER);
    const left = await readAgendaIds(client.db, owner.uid);
    assert.deepEqual(left.followedTeamIds, []);
    assert.equal((await getDoc(doc(client.db, 'users', owner.uid))).exists(), false);
    assert.equal((await getDoc(doc(other.db, 'users', boris.uid))).data()?.favoriteTeamIds?.[0], 'football:rs:crvena-zvezda');
  } finally {
    await client.close();
    await other.close();
  }
});

test('praćenje bez profila i loš fid se odbijaju, a ispravan fid ostaje', { timeout: 30_000 }, async () => {
  const client = await openClient();
  try {
    const user = await signInGoogle(client.auth, 'anaSub');
    await assertDenied(writeFollow(client.db, user.uid, {
      teamId: 'football:rs:crvena-zvezda',
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    await writeProfile(client.db, user.uid, baseProfile([]));
    const fid = `c${'a'.repeat(21)}`;
    await writeDevice(client.db, user.uid, {
      installationId: INSTALLATION,
      fid,
      createdAt: NOW,
      updatedAt: NOW,
      lastSeenAt: NOW,
    });
    await assertDenied(setDoc(doc(client.db, 'users', user.uid, 'devices', INSTALLATION), {
      installationId: INSTALLATION,
      fid: 'not-a-firebase-installation',
      createdAt: NOW,
      updatedAt: LATER,
      lastSeenAt: LATER,
    }));
    await assertDenied(setDoc(doc(client.db, 'users', user.uid, 'devices', INSTALLATION), {
      installationId: INSTALLATION,
      fid,
      fcmToken: 'forbidden',
      createdAt: NOW,
      updatedAt: LATER,
      lastSeenAt: LATER,
    }));
    const stored = await getDoc(doc(client.db, 'users', user.uid, 'devices', INSTALLATION));
    assert.equal(stored.data()?.fid, fid);
  } finally {
    await client.close();
  }
});
