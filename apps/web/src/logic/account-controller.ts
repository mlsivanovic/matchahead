import { doc, getDoc, type Firestore } from 'firebase/firestore';

import {
  buildProfile,
  defaultProfile,
  readProfile,
  type UserProfileRecord,
} from '../../../../packages/domain/src/user-account.ts';
import { AccountGate, runOwned, type AccountTicket, type LoadedAccountView } from './account-gate.ts';
import {
  deleteOwnedDocuments,
  deletionIsOpen,
  readAgendaIds,
  writeFollow,
  writeManual,
  writeProfile,
} from './account-remote.ts';
import {
  DELETED_MESSAGE,
  OFFLINE_MESSAGE,
  RECENT_LOGIN_MESSAGE,
  firebaseErrorCode,
  safeFirebaseMessage,
} from './auth-messages.ts';
import { openingAction, resumeAccountDeletion } from './account-deletion.ts';
import { deletionFlagKey } from '../../../../packages/domain/src/user-account.ts';
import type { KeyValueStore } from './user-local.ts';

export interface AuthIdentity {
  uid: string;
  email: string | null;
}

export interface AccountSnapshot {
  status: 'unconfigured' | 'signed-out' | 'offline' | 'working' | 'signed-in' | 'error';
  uid: string | null;
  email: string | null;
  profile: UserProfileRecord | null;
  followedTeamIds: string[];
  favoriteTeamIds: string[];
  manualFixtureIds: string[];
  message: string | null;
  ready: boolean;
}

export interface AccountRemote {
  load(db: Firestore, uid: string, email: string | null, fallbackTimeZone: string, now: string): Promise<LoadedAccountView>;
  setFollow(db: Firestore, uid: string, teamId: string, active: boolean, now: string): Promise<void>;
  setManual(db: Firestore, uid: string, fixtureId: string, active: boolean, now: string): Promise<void>;
  saveProfile(db: Firestore, uid: string, profile: UserProfileRecord): Promise<void>;
  removeDevice(db: Firestore, uid: string, installationId: string): Promise<void>;
  isDeletionOpen(db: Firestore, uid: string): Promise<boolean>;
  deleteOwned(db: Firestore, uid: string, now: string): Promise<void>;
}

/** Lokalna zastavica brisanja; bravu accountTombstones klijent nikad ne skida. */
export function deletionFlagStore(local: KeyValueStore) {
  return {
    isSet: (uid: string): boolean => local.getItem(deletionFlagKey(uid)) === '1',
    set: (uid: string): void => {
      local.setItem(deletionFlagKey(uid), '1');
    },
    clear: (uid: string): void => {
      local.removeItem(deletionFlagKey(uid));
    },
  };
}

export interface DeletionHooks {
  isFlagged(uid: string): boolean;
  setFlag(uid: string): void;
  clearFlag(uid: string): void;
  /** Brisanje Auth naloga; ponovna prijava samo nastavlja Auth brisanje. */
  deleteAuthUser(): Promise<void>;
  onLocalClear(uid: string | null): void;
}

function nowStamp(): string {
  return new Date().toISOString();
}

/**
 * Podrazumevani server za kontroler. Pravila traže nepromenjen
 * createdAt kod update-a, pa se aktivnost preklopnika piše uz
 * sačuvani createdAt postojećeg dokumenta.
 */
export const firestoreAccountRemote: AccountRemote = {
  async load(db, uid, email, fallbackTimeZone, now) {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    let profile = snap.exists() ? readProfile(snap.data()) : null;
    if (!profile) {
      profile = defaultProfile(now, fallbackTimeZone, 30);
      await writeProfile(db, uid, profile);
    }
    const agenda = await readAgendaIds(db, uid);
    return {
      profile,
      followedTeamIds: agenda.followedTeamIds,
      favoriteTeamIds: profile.favoriteTeamIds,
      manualFixtureIds: agenda.manualFixtureIds,
      email,
    };
  },

  async setFollow(db, uid, teamId, active, now) {
    const ref = doc(db, 'users', uid, 'follows', teamId);
    const snap = await getDoc(ref);
    const createdAt = snap.exists() && typeof snap.data().createdAt === 'string' ? snap.data().createdAt : now;
    await writeFollow(db, uid, { teamId, active, createdAt, updatedAt: now });
  },

  async setManual(db, uid, fixtureId, active, now) {
    const ref = doc(db, 'users', uid, 'manualSelections', fixtureId);
    const snap = await getDoc(ref);
    const createdAt = snap.exists() && typeof snap.data().createdAt === 'string' ? snap.data().createdAt : now;
    await writeManual(db, uid, { fixtureId, active, createdAt, updatedAt: now });
  },

  async saveProfile(db, uid, profile) {
    await writeProfile(db, uid, profile);
  },

  async removeDevice(db, uid, installationId) {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'users', uid, 'devices', installationId));
  },

  async isDeletionOpen(db, uid) {
    return deletionIsOpen(db, uid);
  },

  async deleteOwned(db, uid, now) {
    await deleteOwnedDocuments(db, uid, now);
  },
};

/**
 * Klijentski kontroler naloga oko AccountGate. Sva kasna čitanja i
 * upisi proveravaju generacijski tiket: rezultat koji stigne posle
 * odjave ili zamene naloga se odbacuje i nikad ne puni tuđi prikaz.
 * Omiljeni klubovi se nikad ne mešaju u praćenja: agenda prima samo
 * followedTeamIds i manualFixtureIds.
 */
/**
 * Značka konkretnog pokušaja prijave: uid pri kliku, redni broj klika i
 * epoha završenih identiteta. Null odjek bez vlasnika (već odjavljen)
 * ne diže epohu; null koji zaista završava identitet je čini zastarelom.
 */
export interface SignInAttempt {
  uid: string | null;
  seq: number;
  endedEpoch: number;
}

export class AccountController {
  readonly gate = new AccountGate();
  private listeners = new Set<() => void>();
  private db: Firestore | null = null;
  private remote: AccountRemote;
  private clock: () => string;

  constructor(remote: AccountRemote = firestoreAccountRemote, clock: () => string = nowStamp) {
    this.remote = remote;
    this.clock = clock;
  }

  snapshot(): AccountSnapshot {
    return {
      status: this.gate.status,
      uid: this.gate.uid,
      email: this.gate.email,
      profile: this.gate.profile,
      followedTeamIds: [...this.gate.followedTeamIds],
      favoriteTeamIds: [...this.gate.favoriteTeamIds],
      manualFixtureIds: [...this.gate.manualFixtureIds],
      message: this.gate.message,
      ready: this.gate.ready,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  showUnconfigured(message: string): void {
    this.db = null;
    this.gate.showUnconfigured(message);
    this.emit();
  }

  showSignedOut(offline: boolean, message: string | null): void {
    this.db = null;
    this.gate.showSignedOut(offline, message);
    this.emit();
  }

  /**
   * Klik na prijavu: radno stanje pre popup-a; uspeh stiže preko auth
   * događaja. Vraća značku konkretnog pokušaja: kasni failure se vezuje
   * za nju, pa zastareli rejection posle novog klika, novog identiteta
   * ili null događaja ostaje bez dejstva. Sama generacija tiketa nije
   * dovoljna: observer null događaj podigne generaciju bez promene
   * vlasnika, a tekući pokušaj tada i dalje važi.
   */
  private endedEpoch = 0;

  beginSignIn(message: string): SignInAttempt {
    const attempt: SignInAttempt = { uid: this.gate.uid, seq: this.nextSignInSeq(), endedEpoch: this.endedEpoch };
    if (this.gate.uid !== null) return attempt;
    this.gate.showWorking(message);
    this.emit();
    return attempt;
  }

  /**
   * Direktna zamena naloga bez prethodne odjave: veza ka bazi se
   * odbacuje pre gašenja sesije, pa kasni rezultati starog uid-a
   * nemaju db i ne mogu da se primene. Učitavanje novog uid-a vodi
   * sledeći auth događaj sa svežom memorijskom bazom.
   */
  prepareSwitch(uid: string): void {
    this.db = null;
    this.gate.beginUser(uid);
    this.emit();
  }

  private signInSeq = 0;

  private nextSignInSeq(): number {
    this.signInSeq += 1;
    return this.signInSeq;
  }

  /**
   * Neuspeo pokušaj prijave bez identiteta: greška bez privatnih
   * podataka. Važi samo za značku svog pokušaja (isti uid i isti redni
   * broj klika): gate.applyError proverava generaciju (i briše privatne
   * podatke), pa zakašnjeli failure starog pokušaja nikad ne prebacuje
   * novi nalog u grešku niti mu briše privatne podatke.
   */
  noticeFailure(message: string, attempt: SignInAttempt): void {
    if (attempt.uid !== this.gate.uid || attempt.seq !== this.signInSeq
      || attempt.endedEpoch !== this.endedEpoch) return;
    const ticket = this.gate.ticket();
    this.gate.applyError(ticket, message);
    this.emit();
  }

  /** Auth je javio identitet: star prikaz se odmah čisti, pa se učitava novi. */
  async handleIdentity(
    db: Firestore | null,
    identity: AuthIdentity | null,
    options: { offline: boolean; fallbackTimeZone: string },
    deletion?: DeletionHooks,
  ): Promise<void> {
    if (!identity || !db) {
      // Null koji zaista završava identitet diže epohu i zastareva
      // tekuće pokušaje; odjek bez vlasnika ne dira ništa.
      if (this.gate.uid !== null) this.endedEpoch += 1;
      // deleteUser gasi Auth i stiže null pre kraja brisanja: sveža
      // potvrda brisanja se čuva, ostalo se čisti kao odjava.
      const keepDeleted = this.gate.message === DELETED_MESSAGE;
      this.showSignedOut(
        options.offline,
        keepDeleted ? DELETED_MESSAGE : (options.offline ? OFFLINE_MESSAGE : null),
      );
      return;
    }
    if (this.gate.uid !== identity.uid) {
      this.db = db;
      const ticket = this.gate.beginUser(identity.uid);
      this.emit();
      await this.openUnder(ticket, identity.email, options.fallbackTimeZone, deletion);
      return;
    }
    this.db = db;
    const ticket = this.gate.ticket();
    await this.openUnder(ticket, identity.email, options.fallbackTimeZone, deletion);
  }

  /**
   * Zastavica ili brava accountTombstones nastavljaju brisanje umesto
   * učitavanja. Bez deletion hooks brava samo zaključava prikaz:
   * profil se ne otvara i zapisi se ne rekreiraju.
   */
  private async openUnder(
    ticket: AccountTicket,
    email: string | null,
    fallbackTimeZone: string,
    deletion?: DeletionHooks,
  ): Promise<void> {
    const db = this.db;
    const uid = ticket.uid;
    if (!db || !uid || !this.gate.shouldApply(ticket)) return;
    let locked = false;
    try {
      const seen = await runOwned(this.gate, ticket, () => this.remote.isDeletionOpen(db, uid));
      if (seen === null) return;
      locked = seen;
    } catch (error) {
      this.gate.applyError(ticket, safeFirebaseMessage(firebaseErrorCode(error)));
      this.emit();
      return;
    }
    const flagged = deletion?.isFlagged(uid) ?? false;
    if (openingAction({ deletionFlag: flagged, marker: locked }) === 'resume-deletion') {
      if (!deletion) {
        this.gate.applyError(ticket, 'Brisanje naloga je u toku. Podaci nisu dostupni.');
        this.emit();
        return;
      }
      await this.runDeletionFlow(ticket, uid, deletion);
      return;
    }
    await this.reloadUnder(ticket, email, fallbackTimeZone);
  }

  /**
   * Brisanje koje je pokrenuo korisnik: brava accountTombstones se
   * otvara i ostaje (klijent je nikad ne skida), dokumenti se brišu,
   * pa se briše Auth nalog. Ponovna prijava samo nastavlja Auth brisanje.
   */
  async deleteAccount(deletion: DeletionHooks): Promise<void> {
    const ticket = this.gate.ticket();
    const uid = ticket.uid;
    if (!uid || !this.gate.shouldApply(ticket)) return;
    await this.runDeletionFlow(ticket, uid, deletion);
  }

  private async runDeletionFlow(ticket: AccountTicket, uid: string, deletion: DeletionHooks): Promise<void> {
    const db = this.db;
    if (!db) return;
    deletion.setFlag(uid);
    try {
      const outcome = await resumeAccountDeletion({
        deleteDocuments: () => this.remote.deleteOwned(db, uid, this.clock()),
        deleteAuthUser: () => deletion.deleteAuthUser(),
        setFlag: () => deletion.setFlag(uid),
        clearFlag: () => deletion.clearFlag(uid),
      });
      // deleteUser okida null događaj koji podigne generaciju pre kraja
      // toka: potvrda važi dok prikaz nije preuzeo novi vlasnik. Novi
      // uid nikad ne vidi tuđu potvrdu niti mu se čisti lokalno stanje.
      if (outcome === 'deleted') {
        const ownerGone = this.gate.uid === null || this.gate.uid === uid;
        this.db = this.gate.uid === uid ? null : this.db;
        if (ownerGone) {
          this.gate.showSignedOut(false, DELETED_MESSAGE);
          deletion.onLocalClear(uid);
        }
      } else if (this.gate.shouldApply(ticket)) {
        this.gate.applyError(ticket, RECENT_LOGIN_MESSAGE);
      }
    } catch (error) {
      if (this.gate.shouldApply(ticket)) {
        this.gate.applyError(ticket, safeFirebaseMessage(firebaseErrorCode(error)));
      }
    }
    this.emit();
  }

  private async reloadUnder(ticket: AccountTicket, email: string | null, fallbackTimeZone: string): Promise<void> {
    const db = this.db;
    const uid = ticket.uid;
    if (!db || !uid) return;
    try {
      const loaded = await runOwned(this.gate, ticket, () =>
        this.remote.load(db, uid, email, fallbackTimeZone, this.clock()));
      if (!loaded) return;
      this.gate.applyLoaded(ticket, loaded);
    } catch (error) {
      this.gate.applyError(ticket, safeFirebaseMessage(firebaseErrorCode(error)));
    }
    this.emit();
  }

  async refresh(): Promise<void> {
    const ticket = this.gate.ticket();
    if (!this.gate.shouldApply(ticket)) return;
    await this.reloadUnder(ticket, this.gate.email, this.gate.profile?.timeZone ?? 'Europe/Belgrade');
  }

  /**
   * Odjava odmah čisti prikaz i privatnu memoriju. Veza uređaja se
   * uklanja dok je vlasnik još autentifikovan (posle signOut pravila
   * odbijaju owner upis), ograničeno tajmerom: vanmrežni zastoj ne
   * blokira lokalnu odjavu niti vraća privatni prikaz.
   */
  async signOut(input: {
    signOutAuth: () => Promise<void>;
    installationId: string;
    onLocalClear: () => void;
    unlinkTimeoutMs?: number;
  }): Promise<void> {
    const db = this.db;
    const uid = this.gate.uid;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.db = null;
    this.gate.showSignedOut(offline, null);
    input.onLocalClear();
    this.emit();
    if (db && uid) {
      await this.bounded(this.remote.removeDevice(db, uid, input.installationId), input.unlinkTimeoutMs ?? 5000);
      try {
        await input.signOutAuth();
      } catch {
        /* Lokalni UI je već čist; greška odjave se ne predstavlja kao prijava. */
      }
    } else {
      try {
        await input.signOutAuth();
      } catch {
        /* Isto: lokalno stanje ostaje čisto. */
      }
    }
  }

  private async bounded(work: Promise<unknown>, timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([work.then(() => undefined, () => undefined), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Vlasnički upisi idu kroz red: brzi uzastopni klikovi ne trče
   * paralelno. Tiket se uzima u trenutku klika pa upis posle zamene
   * naloga ili odjave ne dira tuđi prikaz. Pre samog upisa stanje se
   * sveže pročita, a namera (koji klub/izbor) se tumači nad svežim
   * stanjem tek pri izvršenju — drugi klik ne gazi prvi.
   */
  private mutationQueue: Promise<void> = Promise.resolve();

  private async mutate(
    work: (db: Firestore, uid: string, now: string) => Promise<void>,
    failureNote: string,
  ): Promise<void> {
    const ticket = this.gate.ticket();
    const run = this.mutationQueue.then(() => this.mutateNow(ticket, work, failureNote));
    this.mutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async mutateNow(
    ticket: AccountTicket,
    work: (db: Firestore, uid: string, now: string) => Promise<void>,
    failureNote: string,
  ): Promise<void> {
    const db = this.db;
    const uid = ticket.uid;
    if (!db || !uid || !this.gate.shouldApply(ticket)) return;
    try {
      await this.reloadUnder(ticket, this.gate.email, this.gate.profile?.timeZone ?? 'Europe/Belgrade');
      if (!this.gate.shouldApply(ticket)) return;
      await work(db, uid, this.clock());
      await this.reloadUnder(ticket, this.gate.email, this.gate.profile?.timeZone ?? 'Europe/Belgrade');
    } catch (error) {
      if (this.gate.shouldApply(ticket)) {
        this.gate.applyNotice(ticket, `${safeFirebaseMessage(firebaseErrorCode(error))} ${failureNote}`);
        this.emit();
      }
    }
  }

  toggleFollow(teamId: string): Promise<void> {
    return this.mutate(
      (db, uid, now) => {
        const active = !this.gate.followedTeamIds.includes(teamId);
        return this.remote.setFollow(db, uid, teamId, active, now);
      },
      'Praćenje nije sačuvano.',
    );
  }

  toggleManual(fixtureId: string): Promise<void> {
    return this.mutate(
      (db, uid, now) => {
        const active = !this.gate.manualFixtureIds.includes(fixtureId);
        return this.remote.setManual(db, uid, fixtureId, active, now);
      },
      'Ručni izbor nije sačuvan.',
    );
  }

  toggleFavorite(teamId: string): Promise<void> {
    return this.mutate(
      (db, uid, now) => {
        const current = this.gate.profile;
        if (!current) return Promise.resolve();
        const favorites = current.favoriteTeamIds.includes(teamId)
          ? current.favoriteTeamIds.filter((id) => id !== teamId)
          : [...current.favoriteTeamIds, teamId];
        const next = buildProfile({
          timeZone: current.timeZone,
          favoriteTeamIds: favorites,
          reminderMinutes: current.reminderMinutes,
          notifyScheduleChange: current.notifyScheduleChange,
          notifyCancellation: current.notifyCancellation,
          createdAt: current.createdAt,
          updatedAt: now,
        });
        return this.remote.saveProfile(db, uid, next);
      },
      'Omiljeni klub nije sačuvan.',
    );
  }

  savePrefs(input: {
    timeZone: string;
    reminderMinutes: number;
    notifyScheduleChange: boolean;
    notifyCancellation: boolean;
  }): Promise<void> {
    return this.mutate(
      (db, uid, now) => {
        const current = this.gate.profile;
        if (!current) return Promise.resolve();
        const next = buildProfile({
          timeZone: input.timeZone,
          favoriteTeamIds: current.favoriteTeamIds,
          reminderMinutes: input.reminderMinutes,
          notifyScheduleChange: input.notifyScheduleChange,
          notifyCancellation: input.notifyCancellation,
          createdAt: current.createdAt,
          updatedAt: now,
        });
        return this.remote.saveProfile(db, uid, next);
      },
      'Podešavanja nisu sačuvana.',
    );
  }
}
