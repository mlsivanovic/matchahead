import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import { firebaseErrorCode } from './auth-messages.ts';
import {
  ACCOUNT_OPS_COLLECTION,
  ACCOUNT_TOMBSTONES_COLLECTION,
  DEVICES_COLLECTION,
  FOLLOWS_COLLECTION,
  MANUAL_SELECTIONS_COLLECTION,
  USER_COLLECTION,
  agendaInputs,
  buildDevice,
  buildFollow,
  buildManualSelection,
  buildTombstone,
  readDevice,
  readFollow,
  readManualSelection,
  readProfile,
  readTombstone,
  type AccountTombstoneRecord,
  type DeviceRecord,
  type FollowedClubRecord,
  type ManualSelectionRecord,
  type UserProfileRecord,
} from '../../../../packages/domain/src/user-account.ts';

export async function writeProfile(db: Firestore, uid: string, profile: UserProfileRecord): Promise<void> {
  await setDoc(doc(db, USER_COLLECTION, uid), profile);
}

export async function writeFollow(db: Firestore, uid: string, follow: FollowedClubRecord): Promise<void> {
  const record = buildFollow(follow);
  await setDoc(doc(db, USER_COLLECTION, uid, FOLLOWS_COLLECTION, record.teamId), record);
}

export async function writeManual(db: Firestore, uid: string, selection: ManualSelectionRecord): Promise<void> {
  const record = buildManualSelection(selection);
  await setDoc(doc(db, USER_COLLECTION, uid, MANUAL_SELECTIONS_COLLECTION, record.fixtureId), record);
}

export async function writeDevice(db: Firestore, uid: string, device: DeviceRecord): Promise<void> {
  const record = buildDevice(device);
  await setDoc(doc(db, USER_COLLECTION, uid, DEVICES_COLLECTION, record.installationId), record);
}

export async function readDeletionLock(db: Firestore, uid: string): Promise<AccountTombstoneRecord | null> {
  const snap = await getDoc(doc(db, ACCOUNT_TOMBSTONES_COLLECTION, uid));
  return snap.exists() ? readTombstone(snap.data()) : null;
}

export async function deletionIsOpen(db: Firestore, uid: string): Promise<boolean> {
  return (await readDeletionLock(db, uid)) !== null;
}

/**
 * Brava je accountTombstones/{uid}, van stabla korisnika.
 * Posle kreiranja klijent je ne menja i ne briše. Ponovni poziv je prazan ako već postoji.
 */
export async function openDeletionLock(db: Firestore, uid: string, now: string): Promise<void> {
  const ref = doc(db, ACCOUNT_TOMBSTONES_COLLECTION, uid);
  if ((await getDoc(ref)).exists()) return;
  try {
    await setDoc(ref, buildTombstone({ startedAt: now, updatedAt: now }));
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (code !== 'permission-denied' && code !== 'already-exists') throw error;
    if (!(await getDoc(ref)).exists()) throw error;
  }
}

/**
 * Prvo otvara bravu, pa briše praćenja, ručne izbore, uređaje, accountOps i profil.
 * Brava ostaje. Auth nalog ova funkcija ne dira.
 * Ponovni poziv nastavlja prekinuto brisanje i ne skida bravu.
 */
export async function deleteOwnedDocuments(db: Firestore, uid: string, now: string): Promise<void> {
  await openDeletionLock(db, uid, now);
  await deleteCollection(db, uid, FOLLOWS_COLLECTION);
  await deleteCollection(db, uid, MANUAL_SELECTIONS_COLLECTION);
  await deleteCollection(db, uid, DEVICES_COLLECTION);
  await deleteCollection(db, uid, ACCOUNT_OPS_COLLECTION);
  const profile = doc(db, USER_COLLECTION, uid);
  if ((await getDoc(profile)).exists()) await deleteDoc(profile);
}

export async function readAgendaIds(db: Firestore, uid: string): Promise<{
  followedTeamIds: string[];
  manualFixtureIds: string[];
  favoriteTeamIds: string[];
}> {
  const profileSnap = await getDoc(doc(db, USER_COLLECTION, uid));
  const profile = profileSnap.exists() ? readProfile(profileSnap.data()) : null;
  const follows = await collectFollows(db, uid);
  const manuals = await collectManuals(db, uid);
  const agenda = agendaInputs({ follows, manualSelections: manuals });
  return {
    followedTeamIds: agenda.followedTeamIds,
    manualFixtureIds: agenda.manualFixtureIds,
    favoriteTeamIds: profile?.favoriteTeamIds ?? [],
  };
}

async function collectFollows(db: Firestore, uid: string): Promise<FollowedClubRecord[]> {
  const snap = await getDocs(collection(db, USER_COLLECTION, uid, FOLLOWS_COLLECTION));
  return snap.docs.flatMap((item) => {
    const parsed = readFollow(item.id, item.data());
    return parsed ? [parsed] : [];
  });
}

async function collectManuals(db: Firestore, uid: string): Promise<ManualSelectionRecord[]> {
  const snap = await getDocs(collection(db, USER_COLLECTION, uid, MANUAL_SELECTIONS_COLLECTION));
  return snap.docs.flatMap((item) => {
    const parsed = readManualSelection(item.id, item.data());
    return parsed ? [parsed] : [];
  });
}

async function deleteCollection(db: Firestore, uid: string, name: string): Promise<void> {
  const col = collection(db, USER_COLLECTION, uid, name);
  while (true) {
    const snap = await getDocs(query(col, limit(20)));
    if (snap.empty) return;
    for (const item of snap.docs) await deleteDoc(item.ref);
  }
}

export async function preserveDeviceFid(db: Firestore, uid: string, installationId: string, now: string): Promise<void> {
  const ref = doc(db, USER_COLLECTION, uid, DEVICES_COLLECTION, installationId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? readDevice(installationId, snap.data()) : null;
  await writeDevice(db, uid, buildDevice({
    installationId,
    fid: existing?.fid ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
  }));
}
