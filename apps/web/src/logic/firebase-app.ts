import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  terminate,
  type Firestore,
} from 'firebase/firestore';

import type { FirebasePublicConfig } from './firebase-config.ts';
import { INSTALLATION_ID_PATTERN } from '../../../../packages/domain/src/user-account.ts';
import type { KeyValueStore } from './user-local.ts';

export interface FirebaseSession {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export interface EmulatorHosts {
  authUrl: string | null;
  firestoreHost: string | null;
  firestorePort: number | null;
}

const INSTALLATION_KEY = 'matchahead.device.installationId';

let session: FirebaseSession | null = null;
/**
 * Gašenje u letu koje svi pozivi dele. Dok je postavljeno, nova sesija
 * ne sme da nastane: initializeApp bi vratio app koji završetak ovog
 * gašenja tek treba da obriše. Barijera je await disposeFirebaseSession:
 * tek po njegovom povratku gašenje je zaista završeno.
 */
let teardown: Promise<void> | null = null;

/**
 * Pravi Firebase sesiju lenjo, tek kada je podešena konfiguracija.
 * Firestore keš je isključivo memorijski (memoryLocalCache, nikad
 * persistentLocalCache): privatni podaci ne ostaju offline na disku.
 * Auth token se čuva u browserLocalPersistence (eksplicitan izbor):
 * posle zatvaranja i ponovnog otvaranja pregledača isti nalog se
 * obnavlja pa favoriti/profil stižu sa servera; odjava briše token.
 */
export function ensureFirebaseSession(config: FirebasePublicConfig, emulators: EmulatorHosts): FirebaseSession {
  if (teardown) {
    // Gašenje prethodne sesije još traje: initializeApp bi vratio app
    // koji završetak gašenja tek treba da obriše. Pozivalac mora da
    // sačeka await disposeFirebaseSession() pre nove sesije (sva mesta
    // poziva to već rade); tiho recikliranje je zabranjeno.
    throw new Error('Firebase sesija se još gasi; sačekaj kraj gašenja pre nove sesije.');
  }
  if (session) return session;
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    ...(config.messagingSenderId ? { messagingSenderId: config.messagingSenderId } : {}),
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
  });
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  if (emulators.authUrl) connectAuthEmulator(auth, emulators.authUrl, { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  if (emulators.firestoreHost && emulators.firestorePort !== null) {
    connectFirestoreEmulator(db, emulators.firestoreHost, emulators.firestorePort);
  }
  session = { app, auth, db };
  return session;
}

/**
 * Gasi Firestore i briše Firebase app instancu. Posle odjave ili
 * zamene naloga memorijski keš prethodnog uid-a više ne postoji.
 * Podržani životni ciklus: terminate(db) + deleteApp(app).
 */
export async function disposeFirebaseSession(): Promise<void> {
  const active = session;
  session = null;
  if (!active) {
    // Sesiju je već preuzeo raniji poziv: sačekaj isto gašenje umesto
    // trenutnog povratka, inače pozivalac prerano pravi novu sesiju nad
    // app-om koji se još gasi. Barijera čeka; greška pripada vlasniku.
    await teardown?.catch(() => undefined);
    return;
  }
  const work = (async () => {
    try {
      await terminate(active.db);
    } finally {
      await deleteApp(active.app);
    }
  })();
  teardown = work;
  try {
    await work;
  } finally {
    if (teardown === work) teardown = null;
  }
}

/**
 * Gasi sesiju samo ako je još uvek važeća. Kasna odjava ne sme da
 * ugasi novu sesiju koju je u međuvremenu otvorila nova prijava.
 */
export async function disposeSessionIfCurrent(target: FirebaseSession | null): Promise<void> {
  if (target && session === target) {
    await disposeFirebaseSession();
    return;
  }
  // Tuđi poziv već gasi sesiju: sačekaj kraj pre spuštanja retiring
  // zastavice, inače nova prijava prerano pravi sesiju nad starim app-om.
  // Barijera čeka, grešku ne prenosi (pripada vlasniku gašenja).
  if (session === null) await teardown?.catch(() => undefined);
}

export function activeFirebaseSession(): FirebaseSession | null {
  return session;
}

/** Stabilan ID instalacije uređaja za devices kolekciju (faza 09 upisuje fid). */
export function ensureInstallationId(local: KeyValueStore): string {
  const raw = local.getItem(INSTALLATION_KEY);
  if (raw && INSTALLATION_ID_PATTERN.test(raw)) return raw;
  const next = `dev-${randomSuffix()}${randomSuffix()}`;
  local.setItem(INSTALLATION_KEY, next);
  return next;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (const byte of bytes) out += alphabet[byte % 64];
  return out;
}
