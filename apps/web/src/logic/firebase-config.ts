export interface FirebaseEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_AUTH_EMULATOR_HOST?: string;
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST?: string;
}

export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

export interface EmulatorEndpoints {
  authUrl: string | null;
  firestoreHost: string | null;
  firestorePort: number | null;
}

export type FirebaseSetup =
  | { kind: 'unconfigured' }
  | { kind: 'emulator-rejected' }
  | { kind: 'ready'; config: FirebasePublicConfig; emulators: EmulatorEndpoints };

const LOCAL_EMULATOR = /^(?:127\.0\.0\.1|localhost):(\d{2,5})$/;

export function readFirebaseSetup(env: FirebaseEnv): FirebaseSetup {
  const config = readConfig(env);
  if (!config) return { kind: 'unconfigured' };
  const authHost = clean(env.VITE_FIREBASE_AUTH_EMULATOR_HOST);
  const firestoreHost = clean(env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST);
  if ((authHost && !LOCAL_EMULATOR.test(authHost)) || (firestoreHost && !LOCAL_EMULATOR.test(firestoreHost))) {
    return { kind: 'emulator-rejected' };
  }
  const firestore = firestoreHost ? LOCAL_EMULATOR.exec(firestoreHost) : null;
  return {
    kind: 'ready',
    config,
    emulators: {
      authUrl: authHost ? `http://${authHost}` : null,
      firestoreHost: firestore ? firestoreHost.slice(0, firestoreHost.lastIndexOf(':')) : null,
      firestorePort: firestore ? Number(firestore[1]) : null,
    },
  };
}

function readConfig(env: FirebaseEnv): FirebasePublicConfig | null {
  const apiKey = clean(env.VITE_FIREBASE_API_KEY);
  const authDomain = clean(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = clean(env.VITE_FIREBASE_PROJECT_ID);
  const appId = clean(env.VITE_FIREBASE_APP_ID);
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  if ([apiKey, authDomain, projectId, appId].some((value) => value.length > 200 || /[\s"'`]/.test(value))) return null;
  const messagingSenderId = clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID);
  const storageBucket = clean(env.VITE_FIREBASE_STORAGE_BUCKET);
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(storageBucket ? { storageBucket } : {}),
  };
}

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}
