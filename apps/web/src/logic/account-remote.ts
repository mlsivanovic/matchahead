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

import {
  ACCOUNT_OPS_COLLECTION,
  DELETION_DOC_ID,
  DEVICES_COLLECTION,
  FOLLOWS_COLLECTION,
  MANUAL_SELECTIONS_COLLECTION,
  USER_COLLECTION,
  agendaInputs,
  buildDeletion,
  buildDevice,
  buildFollow,
  buildManualSelection,
  isIsoStamp,
  readDevice,
  readFollow,
  readManualSelection,
  readProfile,
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

export async function deletionIsOpen(db: Firestore, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, USER_COLLECTION, uid, ACCOUNT_OPS_COLLECTION, DELETION_DOC_ID));
  return snap.exists();
}

/** Marker prvo. Dok postoji, rules odbijaju novi profil i poddokumente. */
export async function openDeletionMarker(db: Firestore, uid: string, now: string): Promise<void> {
  const ref = doc(db, USER_COLLECTION, uid, ACCOUNT_OPS_COLLECTION, DELETION_DOC_ID);
  const snap = await getDoc(ref);
  const startedAt = snap.exists() && typeof snap.data().startedAt === 'string' && isIsoStamp(snap.data().startedAt)
    ? snap.data().startedAt
    : now;
  await setDoc(ref, buildDeletion({ startedAt, updatedAt: now }));
}

/**
 * Briše praćenja, ručne izbore, uređaje i profil.
 * Marker se briše poslednji. Ponovni poziv nastavlja prekinuto brisanje.
 * Auth nalog ova funkcija ne dira.
 */
export async function deleteOwnedDocuments(db: Firestore, uid: string, now: string): Promise<void> {
  await openDeletionMarker(db, uid, now);
  await deleteCollection(db, uid, FOLLOWS_COLLECTION);
  await deleteCollection(db, uid, MANUAL_SELECTIONS_COLLECTION);
  await deleteCollection(db, uid, DEVICES_COLLECTION);
  const profile = doc(db, USER_COLLECTION, uid);
  if ((await getDoc(profile)).exists()) await deleteDoc(profile);
  await deleteDoc(doc(db, USER_COLLECTION, uid, ACCOUNT_OPS_COLLECTION, DELETION_DOC_ID));
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
