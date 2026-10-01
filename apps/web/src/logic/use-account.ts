import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

import { AccountController, deletionFlagStore, type AccountSnapshot, type DeletionHooks } from './account-controller.ts';
import { browserStore } from './user-local.ts';
import {
  EMULATOR_REJECTED_MESSAGE,
  OFFLINE_MESSAGE,
  UNCONFIGURED_MESSAGE,
  WORKING_MESSAGE,
  firebaseErrorCode,
  safeFirebaseMessage,
} from './auth-messages.ts';
import {
  activeFirebaseSession,
  disposeFirebaseSession,
  disposeSessionIfCurrent,
  ensureFirebaseSession,
} from './firebase-app.ts';
import { readFirebaseSetup, type FirebaseEnv, type FirebaseSetup } from './firebase-config.ts';

export type AccountSetupState = 'ready' | 'unconfigured' | 'emulator-rejected';

export interface UseAccountInput {
  controller: AccountController;
  /** Zona uređaja za prvi profil; prikaz profila je overlay i ne menja globalu. */
  fallbackTimeZone: string;
  installationId: string;
  /** Poziva se odmah pri odjavi, uz kontrolerovo čišćenje. */
  onLocalClear: (uid: string | null) => void;
}

export interface UseAccountResult {
  setup: AccountSetupState;
  account: AccountSnapshot;
  signIn: () => void;
  signOut: () => void;
  deleteAccount: () => void;
}

function browserEnv(): FirebaseEnv {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_AUTH_EMULATOR_HOST: env.VITE_FIREBASE_AUTH_EMULATOR_HOST,
    VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST,
  };
}

/**
 * Browser veza Firebase Auth <-> AccountController. Stvarna Google
 * prijava se pokreće isključivo klikom (signInWithPopup u akciji).
 * Zamena naloga i odjava odmah čiste prikaz; Firestore sesija se
 * gasi pa sledeći uid dobija svež memorijski keš. Listener se vezuje
 * za svaku novu Auth instancu, pa signOut->signIn ciklusi ostaju živi.
 */
export function useAccount(input: UseAccountInput): UseAccountResult {
  const { controller, installationId } = input;
  const [account, setAccount] = useState<AccountSnapshot>(() => controller.snapshot());
  const setup = useMemo<FirebaseSetup>(() => readFirebaseSetup(browserEnv()), []);
  const setupState: AccountSetupState = setup.kind === 'ready'
    ? 'ready'
    : setup.kind === 'emulator-rejected'
      ? 'emulator-rejected'
      : 'unconfigured';
  const live = useRef(input);
  live.current = input;
  const lastUid = useRef<string | null>(null);
  const attachedAuth = useRef<Auth | null>(null);
  const stopAuth = useRef<(() => void) | null>(null);
  const attachRef = useRef<(() => void) | null>(null);
  const retiring = useRef(false);
  const disposed = useRef(false);
  const flags = useMemo(() => deletionFlagStore(browserStore(localStorage)), []);

  const deletionFor = (auth: Auth, uid: string): DeletionHooks => ({
    isFlagged: (marked) => flags.isSet(marked),
    setFlag: (marked) => flags.set(marked),
    clearFlag: (marked) => flags.clear(marked),
    deleteAuthUser: async () => {
      const current: User | null = auth.currentUser;
      if (!current || current.uid !== uid) throw { code: 'auth/user-mismatch' };
      const { deleteUser } = await import('firebase/auth');
      await deleteUser(current);
    },
    onLocalClear: (ended) => live.current.onLocalClear(ended),
  });

  /** Zajednički ulaz observera i popup rezultata za isti identitet. */
  const driveIdentity = (db: Firestore, identity: { uid: string; email: string | null }, auth: Auth) => {
    if (disposed.current) return;
    lastUid.current = identity.uid;
    void controller.handleIdentity(db, identity, {
      offline: false,
      fallbackTimeZone: live.current.fallbackTimeZone,
    }, deletionFor(auth, identity.uid));
  };

  useEffect(() => {
    disposed.current = false;
    const stop = controller.subscribe(() => setAccount(controller.snapshot()));
    setAccount(controller.snapshot());
    if (setup.kind !== 'ready') {
      controller.showUnconfigured(
        setup.kind === 'emulator-rejected' ? EMULATOR_REJECTED_MESSAGE : UNCONFIGURED_MESSAGE,
      );
      return stop;
    }

    const handleUser = (auth: Auth, user: User | null) => {
      if (disposed.current) return;
      const current = activeFirebaseSession();
      if (!current) return;
      if (!user) {
        if (auth.currentUser) {
          // Zastareli odjek gašenja: sesija i dalje drži korisnika
          // (povraćen iz perzistencije dok se stara odjava gasila).
          // Ne diraj lastUid, prikaz ni sesiju nove prijave.
          return;
        }
        const prevUid = lastUid.current;
        lastUid.current = null;
        // Dok je lokalna odjava u toku, null je odjek njenog gašenja
        // (nova sesija je prethodno povratila starog korisnika iz
        // perzistencije): ne gasi sesiju nove prijave niti čisti ponovo.
        const settlingOwnSignOut = retiring.current;
        if (prevUid !== null && !settlingOwnSignOut) {
          // React sesija (beleška, lokalne liste) čisti se odmah i za
          // null iz drugog taba, ne samo za lokalnu odjavu.
          live.current.onLocalClear(prevUid);
        }
        void controller.handleIdentity(null, null, {
          offline: typeof navigator !== 'undefined' && navigator.onLine === false,
          fallbackTimeZone: live.current.fallbackTimeZone,
        });
        if (prevUid !== null && !settlingOwnSignOut) {
          // Null i iz drugog taba gasi memorijski keš prethodnog uid-a.
          void cycleSession();
        }
        return;
      }
      const identity = { uid: user.uid, email: user.email ?? null };
      if (lastUid.current !== null && lastUid.current !== user.uid) {
        // Direktna zamena bez odjave: odbaci db, očisti lokalnu sesiju
        // starog uid-a, ugasi sesiju, pa digni svežu za novi uid.
        const prevUid = lastUid.current;
        lastUid.current = user.uid;
        controller.prepareSwitch(user.uid);
        live.current.onLocalClear(prevUid);
        void (async () => {
          await disposeFirebaseSession();
          if (disposed.current) return;
          ensureFirebaseSession(setup.config, setup.emulators);
          attach();
        })();
        return;
      }
      driveIdentity(current.db, identity, auth);
    };

    const attach = () => {
      const session = activeFirebaseSession();
      if (!session || attachedAuth.current === session.auth) return;
      stopAuth.current?.();
      attachedAuth.current = session.auth;
      const auth = session.auth;
      stopAuth.current = onAuthStateChanged(auth, (user) => handleUser(auth, user));
    };

    const cycleSession = async () => {
      await disposeFirebaseSession();
      if (disposed.current) return;
      ensureFirebaseSession(setup.config, setup.emulators);
      attach();
    };

    ensureFirebaseSession(setup.config, setup.emulators);
    attach();
    attachRef.current = attach;

    const onOnline = () => {
      void controller.refresh();
    };
    window.addEventListener('online', onOnline);
    return () => {
      disposed.current = true;
      window.removeEventListener('online', onOnline);
      stopAuth.current?.();
      stopAuth.current = null;
      attachedAuth.current = null;
      stop();
    };
    // Namerno jednom po mount-u: sesija je procesni singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    setup: setupState,
    account,
    signIn: () => {
      if (setup.kind !== 'ready') {
        controller.showUnconfigured(
          setup.kind === 'emulator-rejected' ? EMULATOR_REJECTED_MESSAGE : UNCONFIGURED_MESSAGE,
        );
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        controller.noticeFailure(OFFLINE_MESSAGE);
        return;
      }
      controller.beginSignIn(WORKING_MESSAGE);
      void (async () => {
        if (retiring.current) {
          // Sačekaj gašenje stare sesije: initializeApp dok je deleteApp
          // prethodne instance u letu pravi mrtvu instancu (app-deleted)
          // pa popup umire usred toka.
          await disposeFirebaseSession();
          if (disposed.current) return;
        }
        const session = ensureFirebaseSession(setup.config, setup.emulators);
        // Posle gašenja sesije pri odjavi listener se vezuje na novu Auth instancu.
        attachRef.current?.();
        signInWithPopup(session.auth, new GoogleAuthProvider()).then(
        (credential) => {
          if (disposed.current) return;
          const user = credential.user;
          const sessionNow = activeFirebaseSession();
          if (!sessionNow) return;
          // Isti uid posle requires-recent-login ne mora da okine
          // observer: uspešan popup rezultat sam vozi nastavak.
          // Observer je primaran; dupli poziv za svež uid je običan reload.
          const resumeNeeded = controller.snapshot().status === 'error' || flags.isSet(user.uid);
          if (lastUid.current !== user.uid || resumeNeeded) {
            driveIdentity(
              sessionNow.db,
              { uid: user.uid, email: user.email ?? null },
              sessionNow.auth,
            );
          }
        },
        (error: unknown) => {
          controller.noticeFailure(safeFirebaseMessage(firebaseErrorCode(error)));
        },
        );
      })();
    },
    signOut: () => {
      const uid = controller.snapshot().uid;
      const session = activeFirebaseSession();
      const auth = session?.auth;
      retiring.current = true;
      live.current.onLocalClear(uid);
      void controller.signOut({
        signOutAuth: async () => {
          // Odjavi samo nameravani nalog: tuđi novi currentUser se ne dira.
          if (!auth) return;
          const current = auth.currentUser;
          if (current && uid !== null && current.uid !== uid) return;
          await signOut(auth);
        },
        installationId,
        onLocalClear: () => live.current.onLocalClear(uid),
      }).finally(async () => {
        // Zastarela odjava ne dira lastUid novije prijave.
        if (lastUid.current === uid) lastUid.current = null;
        // Gasi samo sesiju ove odjave: novija prijava ima svoju.
        await disposeSessionIfCurrent(session ?? null);
        retiring.current = false;
      });
    },
    deleteAccount: () => {
      const session = activeFirebaseSession();
      const auth = session?.auth;
      const uid = controller.snapshot().uid;
      if (!auth || !uid) return;
      retiring.current = true;
      void controller.deleteAccount(deletionFor(auth, uid)).finally(async () => {
        lastUid.current = null;
        await disposeSessionIfCurrent(session ?? null);
        retiring.current = false;
      });
    },
  };
}
