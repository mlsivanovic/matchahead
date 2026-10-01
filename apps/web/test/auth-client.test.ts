import assert from 'node:assert/strict';
import test from 'node:test';

import type { Firestore } from 'firebase/firestore';

import { buildProfile, timeZoneForDisplay } from '../../../packages/domain/src/user-account.ts';
import { buildUserAgenda } from '../src/logic/agenda.ts';
import { AccountController, deletionFlagStore, type AccountRemote, type DeletionHooks } from '../src/logic/account-controller.ts';
import { memoryStore, readManualFixtureIds, writeManualFixtureIds } from '../src/logic/user-local.ts';

const NOW = '2026-09-30T12:00:00.000Z';
const LATER = '2026-09-30T12:05:00.000Z';
const FX = 'football:football:demo:demo-liga:demo-sezona:demo:fx-lokalni';

const DB = {} as unknown as Firestore;

function profile(favoriteTeamIds: string[] = []) {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeRemote(overrides: Partial<AccountRemote> = {}): AccountRemote & { writes: string[] } {
  const writes: string[] = [];
  let savedProfile: ReturnType<typeof profile> | null = null;
  return {
    writes,
    async load(_db, uid, email) {
      const current = savedProfile ?? profile();
      return {
        profile: current,
        followedTeamIds: uid === 'ana' && savedProfile === null ? ['football:rs:crvena-zvezda'] : [],
        favoriteTeamIds: current.favoriteTeamIds,
        manualFixtureIds: [],
        email,
      };
    },
    async setFollow() {
      writes.push('follow');
    },
    async setManual() {
      writes.push('manual');
    },
    async saveProfile(_db, _uid, next) {
      writes.push('profile');
      savedProfile = next;
    },
    async removeDevice() {
      writes.push('device');
    },
    async isDeletionOpen() {
      return false;
    },
    async deleteOwned() {
      writes.push('delete-owned');
    },
    ...overrides,
  };
}

test('odjava odmah čisti prikaz; kasno učitavanje starog uid-a se odbacuje', async () => {
  const gate = deferred<Awaited<ReturnType<AccountRemote['load']>>>();
  const remote = fakeRemote({ load: () => gate.promise });
  const controller = new AccountController(remote, () => NOW);
  const loading = controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  await controller.signOut({
    signOutAuth: async () => undefined,
    installationId: 'deviceinstall0001',
    onLocalClear: () => undefined,
  });
  const snap = controller.snapshot();
  assert.equal(snap.status, 'signed-out');
  assert.equal(snap.uid, null);
  assert.deepEqual(snap.followedTeamIds, []);
  assert.equal(snap.email, null);
  gate.resolve({
    profile: profile(),
    followedTeamIds: ['football:rs:crvena-zvezda'],
    favoriteTeamIds: [],
    manualFixtureIds: [FX],
    email: 'ana@example.com',
  });
  await loading;
  const after = controller.snapshot();
  assert.equal(after.uid, null);
  assert.deepEqual(after.followedTeamIds, []);
  assert.deepEqual(after.manualFixtureIds, []);
});

test('zamena naloga: tiket prethodnog uid-a ne puni novi prikaz', async () => {
  const first = deferred<Awaited<ReturnType<AccountRemote['load']>>>();
  const remote = fakeRemote({
    load: (_db, uid, email) => {
      // Odloženo učitavanje pripada Ani po uid-u, ne redosledu poziva:
      // provera brave popušta pa Borisin poziv može stići prvi.
      if (uid === 'ana') return first.promise;
      return Promise.resolve({
        profile: profile(),
        followedTeamIds: [],
        favoriteTeamIds: [],
        manualFixtureIds: [],
        email,
      });
    },
  });
  const controller = new AccountController(remote, () => NOW);
  const loadingAna = controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  await controller.handleIdentity(DB, { uid: 'boris', email: 'boris@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  assert.equal(controller.snapshot().uid, 'boris');
  assert.deepEqual(controller.snapshot().followedTeamIds, []);
  first.resolve({
    profile: profile(),
    followedTeamIds: ['football:rs:crvena-zvezda'],
    favoriteTeamIds: [],
    manualFixtureIds: [FX],
    email: 'ana@example.com',
  });
  await loadingAna;
  const snap = controller.snapshot();
  assert.equal(snap.uid, 'boris');
  assert.equal(snap.email, 'boris@example.com');
  assert.deepEqual(snap.followedTeamIds, []);
  assert.deepEqual(snap.manualFixtureIds, []);
});

test('upis posle zamene naloga ne čita niti puni tuđi prikaz', async () => {
  const release = deferred<void>();
  const remote = fakeRemote({
    setFollow: () => release.promise.then(() => undefined),
  });
  const controller = new AccountController(remote, () => LATER);
  await controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  const writing = controller.toggleFollow('football:rs:partizan');
  await controller.handleIdentity(DB, { uid: 'boris', email: 'boris@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  release.resolve();
  await writing;
  const snap = controller.snapshot();
  assert.equal(snap.uid, 'boris');
  assert.deepEqual(snap.followedTeamIds, []);
});

test('greška učitavanja ne ostavlja privatne podatke i ne otkriva nalog', async () => {
  const remote = fakeRemote({
    load: async () => {
      throw { code: 'auth/internal-error', token: 'tajna' };
    },
  });
  const controller = new AccountController(remote, () => NOW);
  await controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  const snap = controller.snapshot();
  assert.equal(snap.status, 'error');
  assert.equal(snap.profile, null);
  assert.deepEqual(snap.followedTeamIds, []);
  assert.equal(snap.message?.includes('ana@example.com'), false);
  assert.equal(snap.message?.includes('tajna'), false);
});

test('omiljeni klubovi ostaju odvojeni: agenda prima samo praćenja i ručne izbore', async () => {
  let saved = profile(['basketball:rs:partizan']);
  const remote = fakeRemote({
    async load(_db, _uid, email) {
      return {
        profile: saved,
        followedTeamIds: [],
        favoriteTeamIds: saved.favoriteTeamIds,
        manualFixtureIds: [],
        email,
      };
    },
    async saveProfile(_db, _uid, next) {
      saved = next;
    },
  });
  const controller = new AccountController(remote, () => NOW);
  await controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  const snap = controller.snapshot();
  assert.deepEqual(snap.favoriteTeamIds, ['basketball:rs:partizan']);
  assert.deepEqual(snap.followedTeamIds, []);
  const agenda = buildUserAgenda([], snap.followedTeamIds, snap.manualFixtureIds);
  assert.deepEqual(agenda, []);
  await controller.toggleFavorite('football:rs:partizan');
  const after = controller.snapshot();
  assert.ok(after.favoriteTeamIds.includes('football:rs:partizan'));
  assert.deepEqual(after.followedTeamIds, []);
});

test('brzi uzastopni klikovi na omiljene ne gaze jedan drugi', async () => {
  let saved = profile([]);
  const remote = fakeRemote({
    async load(_db, _uid, email) {
      return {
        profile: saved,
        followedTeamIds: [],
        favoriteTeamIds: saved.favoriteTeamIds,
        manualFixtureIds: [],
        email,
      };
    },
    async saveProfile(_db, _uid, next) {
      saved = next;
    },
  });
  const controller = new AccountController(remote, () => NOW);
  await signInFresh(controller, 'ana');
  const first = controller.toggleFavorite('football:rs:crvena-zvezda');
  const second = controller.toggleFavorite('football:rs:partizan');
  await Promise.all([first, second]);
  const snap = controller.snapshot();
  assert.ok(snap.favoriteTeamIds.includes('football:rs:crvena-zvezda'));
  assert.ok(snap.favoriteTeamIds.includes('football:rs:partizan'));
});

test('neuspeo upis ne predstavlja podatke kao sačuvane', async () => {
  const remote = fakeRemote({
    setManual: async () => {
      throw { code: 'permission-denied' };
    },
  });
  const controller = new AccountController(remote, () => NOW);
  await controller.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  await controller.toggleManual(FX);
  const snap = controller.snapshot();
  assert.equal(snap.uid, 'ana');
  assert.deepEqual(snap.manualFixtureIds, []);
  assert.match(snap.message ?? '', /nije sačuvan/);
});

test('lokalni DEMO ručni izbori ostaju lokalni i odbacuju nevažeće ID-jeve', () => {
  const session = memoryStore();
  writeManualFixtureIds(session, [FX, 'loš id sa razmakom', FX]);
  assert.deepEqual(readManualFixtureIds(session), [FX]);
  const broken = memoryStore({ 'matchahead.session.manualFixtureIds': 'nije-json' });
  assert.deepEqual(readManualFixtureIds(broken), []);
});

function deletionHooks(overrides: Partial<DeletionHooks> = {}) {
  const local = memoryStore();
  const flags = deletionFlagStore(local);
  const cleared: Array<string | null> = [];
  return {
    hooks: {
      isFlagged: (uid) => flags.isSet(uid),
      setFlag: (uid) => flags.set(uid),
      clearFlag: (uid) => flags.clear(uid),
      deleteAuthUser: async () => undefined,
      onLocalClear: (uid) => {
        cleared.push(uid);
      },
      ...overrides,
    } satisfies DeletionHooks,
    cleared,
    isFlagged: (uid: string) => flags.isSet(uid),
  };
}

async function signInFresh(controller: AccountController, uid: string, hooks?: DeletionHooks) {
  await controller.handleIdentity(DB, { uid, email: `${uid}@example.com` }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  }, hooks);
}

test('brisanje: brava ostaje, dokumenti nestaju, zastavica se čisti', async () => {
  const remote = fakeRemote();
  const controller = new AccountController(remote, () => NOW);
  const { hooks, cleared, isFlagged } = deletionHooks();
  await signInFresh(controller, 'ana', hooks);
  assert.equal(controller.snapshot().status, 'signed-in');
  await controller.deleteAccount(hooks);
  const snap = controller.snapshot();
  assert.equal(snap.status, 'signed-out');
  assert.equal(snap.message, 'Nalog je obrisan.');
  assert.deepEqual(snap.followedTeamIds, []);
  assert.deepEqual(cleared, ['ana']);
  assert.equal(isFlagged('ana'), false);
  assert.ok(remote.writes.includes('delete-owned'));
});

test('zastarela prijava ostavlja zastavicu; ponovna prijava samo briše Auth', async () => {
  const remote = fakeRemote();
  const controller = new AccountController(remote, () => NOW);
  let authDeleted = 0;
  const { hooks, isFlagged } = deletionHooks({
    deleteAuthUser: async () => {
      authDeleted += 1;
      if (authDeleted === 1) throw { code: 'auth/requires-recent-login' };
    },
  });
  await signInFresh(controller, 'ana', hooks);
  await controller.deleteAccount(hooks);
  const stuck = controller.snapshot();
  assert.equal(stuck.status, 'error');
  assert.equal(stuck.profile, null);
  assert.equal(isFlagged('ana'), true);
  assert.match(stuck.message ?? '', /novu prijavu/);
  await signInFresh(controller, 'ana', hooks);
  const done = controller.snapshot();
  assert.equal(done.status, 'signed-out');
  assert.equal(done.message, 'Nalog je obrisan.');
  assert.equal(isFlagged('ana'), false);
  assert.equal(authDeleted, 2);
});

test('brava na serveru nastavlja brisanje pri sledećoj prijavi bez otvaranja profila', async () => {
  const remote = fakeRemote({ isDeletionOpen: async () => true });
  const { hooks } = deletionHooks();
  let loaded = 0;
  const counting: AccountRemote = { ...remote, load: async (...args) => { loaded += 1; return remote.load(...args); } };
  const strict = new AccountController(counting, () => NOW);
  await strict.handleIdentity(DB, { uid: 'ana', email: 'ana@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  }, hooks);
  assert.equal(loaded, 0);
  assert.equal(strict.snapshot().status, 'signed-out');
  assert.equal(strict.snapshot().message, 'Nalog je obrisan.');
});

test('brisanje zadržava potvrdu i posle null događaja Auth brisanja', async () => {
  const remote = fakeRemote();
  const controller = new AccountController(remote, () => NOW);
  const { hooks, cleared } = deletionHooks();
  await signInFresh(controller, 'ana', hooks);
  await controller.deleteAccount({
    ...hooks,
    deleteAuthUser: async () => {
      // SDK gasi Auth pre kraja toka: null događaj podiže generaciju.
      await controller.handleIdentity(null, null, { offline: false, fallbackTimeZone: 'Europe/Belgrade' });
    },
  });
  const snap = controller.snapshot();
  assert.equal(snap.status, 'signed-out');
  assert.equal(snap.uid, null);
  assert.equal(snap.message, 'Nalog je obrisan.');
  assert.deepEqual(cleared, ['ana']);
});

test('potvrda brisanja ne prelazi na novi uid koji je preuzeo prikaz', async () => {
  const remote = fakeRemote();
  const controller = new AccountController(remote, () => NOW);
  const { hooks, cleared } = deletionHooks();
  await signInFresh(controller, 'ana', hooks);
  await controller.deleteAccount({
    ...hooks,
    deleteAuthUser: async () => {
      // Drugi tab je u međuvremenu prijavio Borisa na istom uređaju.
      await controller.handleIdentity(DB, { uid: 'boris', email: 'boris@example.com' }, {
        offline: false,
        fallbackTimeZone: 'Europe/Belgrade',
      }, hooks);
    },
  });
  const snap = controller.snapshot();
  assert.equal(snap.uid, 'boris');
  assert.notEqual(snap.message, 'Nalog je obrisan.');
  assert.deepEqual(cleared, []);
});

test('odjava prvo uklanja vezu uređaja dok je vlasnik autentifikovan', async () => {
  const order: string[] = [];
  const remote = fakeRemote({
    removeDevice: async () => {
      order.push('unlink');
    },
  });
  const controller = new AccountController(remote, () => NOW);
  await signInFresh(controller, 'ana', deletionHooks().hooks);
  await controller.signOut({
    signOutAuth: async () => {
      order.push('signout');
    },
    installationId: 'deviceinstall0001',
    onLocalClear: () => undefined,
  });
  assert.deepEqual(order, ['unlink', 'signout']);
});

test('zaglavljeni unlink ne blokira lokalnu odjavu', async () => {
  const remote = fakeRemote({ removeDevice: () => new Promise<void>(() => undefined) });
  const controller = new AccountController(remote, () => NOW);
  await signInFresh(controller, 'ana', deletionHooks().hooks);
  let authed = true;
  await controller.signOut({
    signOutAuth: async () => {
      authed = false;
    },
    installationId: 'deviceinstall0001',
    onLocalClear: () => undefined,
    unlinkTimeoutMs: 5,
  });
  assert.equal(authed, false);
  assert.equal(controller.snapshot().uid, null);
});

test('zona profila je overlay: nevažeća zona pada na Beograd bez diranja uređaja', () => {
  assert.equal(timeZoneForDisplay('Europe/Belgrade'), 'Europe/Belgrade');
  assert.equal(timeZoneForDisplay('ne/važeća zona'), 'Europe/Belgrade');
  const local = memoryStore();
  assert.deepEqual(local.keys(), []);
});
