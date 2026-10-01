import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

import { deleteApp, initializeApp } from 'firebase/app';

import { INSTALLATION_ID_PATTERN } from '../../../packages/domain/src/user-account.ts';

/**
 * Regresija za blokirajući nalaz: disposeFirebaseSession je postavljao
 * session=null pre kraja gašenja, pa je preklapajući drugi poziv odmah
 * prolazio, a nova sesija reciklirala app koji staro gašenje tek treba
 * da obriše. Test vozi STVARNI firebase/app SDK (initializeApp/deleteApp
 * iz instaliranog paketa); kontroliše se samo latencija Firestore
 * terminate koraka, kao u koordinatorskom reprou. Bez mreže/pravih naloga.
 */

interface TestFirebaseSession {
  app: { isDeleted?: boolean };
  auth: unknown;
  db: unknown;
}

interface TestEmulators {
  authUrl: null;
  firestoreHost: null;
  firestorePort: null;
}

interface SessionModule {
  ensureFirebaseSession(
    config: { apiKey: string; authDomain: string; projectId: string; appId: string },
    emulators: TestEmulators,
  ): TestFirebaseSession;
  disposeFirebaseSession(): Promise<void>;
}

const CONFIG = {
  apiKey: 'public-demo',
  authDomain: 'demo.invalid',
  projectId: 'demo-matchahead',
  appId: 'demo',
};
const HOSTS: TestEmulators = { authUrl: null, firestoreHost: null, firestorePort: null };

function makeSession(): { api: SessionModule; releaseTerminate: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const source = readFileSync(new URL('../src/logic/firebase-app.ts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import[\s\S]*?;\s*/gm, '')
    .replace(/^export /gm, '');
  const sandbox: Record<string, unknown> = {
    initializeApp,
    deleteApp,
    initializeAuth: () => ({}),
    browserLocalPersistence: {},
    browserPopupRedirectResolver: {},
    initializeFirestore: () => ({}),
    memoryLocalCache: () => ({}),
    terminate: () => gate,
    connectAuthEmulator: () => undefined,
    connectFirestoreEmulator: () => undefined,
    INSTALLATION_ID_PATTERN,
    crypto: globalThis.crypto,
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  return { api: sandbox as unknown as SessionModule, releaseTerminate: release };
}

test('preklopljeni dispose čeka isto gašenje; nova sesija tek posle kraja', async () => {
  const { api, releaseTerminate } = makeSession();
  const old = api.ensureFirebaseSession(CONFIG, HOSTS);
  const first = api.disposeFirebaseSession();
  let secondDone = false;
  const second = api.disposeFirebaseSession().then(() => {
    secondDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(secondDone, false, 'drugi dispose ne sme da prođe pre kraja zajedničkog gašenja');
  releaseTerminate();
  await first;
  await second;
  const next = api.ensureFirebaseSession(CONFIG, HOSTS);
  assert.notEqual(next.app, old.app, 'nova sesija posle gašenja dobija svež app');
  assert.equal(old.app.isDeleted, true, 'staro gašenje je završeno pre nove sesije');
  await api.disposeFirebaseSession();
});

test('jednostruki dispose gasi sesiju; sledeća je sveža', async () => {
  const { api, releaseTerminate } = makeSession();
  const old = api.ensureFirebaseSession(CONFIG, HOSTS);
  const done = api.disposeFirebaseSession();
  releaseTerminate();
  await done;
  const next = api.ensureFirebaseSession(CONFIG, HOSTS);
  assert.notEqual(next.app, old.app, 'posle završenog gašenja nema reciklaže app-a');
  await api.disposeFirebaseSession();
});

test('klik/remount tokom tuđeg gašenja: barijera pa sveža sesija bez bacanja', async () => {
  // Disciplina koju sprovode signIn (retiring=false) i početni mount u
  // use-account.ts: bez aktivne sesije prvo await dispose (samo čeka
  // tuđu barijeru, ništa ne gasi), pa tek onda ensure. Ovim redosledom
  // ensure guard nikad ne baca na stvarnim putanjama.
  const { api, releaseTerminate } = makeSession();
  const old = api.ensureFirebaseSession(CONFIG, HOSTS);
  const crossTab = api.disposeFirebaseSession();
  const clickBarrier = api.disposeFirebaseSession();
  let barrierDone = false;
  const joined = clickBarrier.then(() => {
    barrierDone = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(barrierDone, false, 'klik čeka cross-tab gašenje');
  releaseTerminate();
  await crossTab;
  await joined;
  const next = api.ensureFirebaseSession(CONFIG, HOSTS);
  assert.notEqual(next.app, old.app, 'klik posle barijere dobija svežu sesiju');
  await api.disposeFirebaseSession();
});

test('ensure tokom gašenja baca; posle kraja nova sesija je sveža', async () => {
  const { api, releaseTerminate } = makeSession();
  const old = api.ensureFirebaseSession(CONFIG, HOSTS);
  const done = api.disposeFirebaseSession();
  // Pokriva baš pokušaj ensure tokom gašenja istim simbolima: stari kod
  // tiho reciklira app koji gašenje tek treba da obriše.
  assert.throws(
    () => api.ensureFirebaseSession(CONFIG, HOSTS),
    /još gasi/,
    'nova sesija ne sme da nastane dok teardown traje',
  );
  releaseTerminate();
  await done;
  const next = api.ensureFirebaseSession(CONFIG, HOSTS);
  assert.notEqual(next.app, old.app, 'posle kraja gašenja sesija je sveža');
  await api.disposeFirebaseSession();
});
