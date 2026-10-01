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
 * Pravi Firebase sesiju lenjo, tek kada je podešena konfiguracija.
 * Firestore keš je isključivo memorijski (memoryLocalCache, nikad
 * persistentLocalCache): privatni podaci ne ostaju offline na disku.
 * Auth token se čuva u browserLocalPersistence (eksplicitan izbor):
 * posle zatvaranja i ponovnog otvaranja pregledača isti nalog se
 * obnavlja pa favoriti/profil stižu sa servera; odjava briše token.
 */
export function ensureFirebaseSession(config: FirebasePublicConfig, emulators: EmulatorHosts): FirebaseSession {
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
  if (!active) return;
  try {
    await terminate(active.db);
  } finally {
    await deleteApp(active.app);
  }
}

/**
 * Gasi sesiju samo ako je još uvek važeća. Kasna odjava ne sme da
 * ugasi novu sesiju koju je u međuvremenu otvorila nova prijava.
 */
export async function disposeSessionIfCurrent(target: FirebaseSession | null): Promise<void> {
  if (target && session === target) await disposeFirebaseSession();
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
