import { isSelectableTeamId } from './selectable-teams.ts';

/**
 * Ugovor privatnih podataka za faze 04, 06 i 10.
 * Omiljeni klub nije praćenje i ne ulazi u agendu.
 * Klijent ne piše notifJobs ni notificationDeliveries.
 */

export const USER_SCHEMA_VERSION = 1;

export const PROFILE_FIELDS = [
  'schemaVersion',
  'locale',
  'timeZone',
  'favoriteTeamIds',
  'reminderMinutes',
  'notifyScheduleChange',
  'notifyCancellation',
  'createdAt',
  'updatedAt',
] as const;

export const FOLLOW_FIELDS = ['teamId', 'active', 'createdAt', 'updatedAt'] as const;
export const MANUAL_SELECTION_FIELDS = ['fixtureId', 'active', 'createdAt', 'updatedAt'] as const;
export const DEVICE_FIELDS = ['installationId', 'fid', 'createdAt', 'updatedAt', 'lastSeenAt'] as const;
export const DELETION_FIELDS = ['status', 'startedAt', 'updatedAt'] as const;

export const USER_COLLECTION = 'users';
export const FOLLOWS_COLLECTION = 'follows';
export const MANUAL_SELECTIONS_COLLECTION = 'manualSelections';
export const DEVICES_COLLECTION = 'devices';
export const ACCOUNT_OPS_COLLECTION = 'accountOps';
export const DELETION_DOC_ID = 'deletion';
export const ACCOUNT_TOMBSTONES_COLLECTION = 'accountTombstones';
export const TOMBSTONE_FIELDS = ['status', 'startedAt', 'updatedAt'] as const;
export const NOTIF_JOBS_COLLECTION = 'notifJobs';
export const NOTIFICATION_DELIVERIES_COLLECTION = 'notificationDeliveries';

export const SELECTABLE_TEAM_LIMIT = 4;
export const REMINDER_MINUTE_OPTIONS = [0, 15, 30, 60] as const;

export const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/;
export const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const FID_PATTERN = /^[cdef][A-Za-z0-9_-]{21}$/;
export const FIXTURE_DOC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,399}$/;
export const ACCOUNT_UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type ReminderMinutes = (typeof REMINDER_MINUTE_OPTIONS)[number];
export type NotifJobKind = 'reminder' | 'schedule_change' | 'cancellation';

/** Isti oblik kao Muse agenda: followed_team ili manual_selection. */
export type InclusionReason =
  | { kind: 'followed_team'; teamId: string }
  | { kind: 'manual_selection'; fixtureId: string };

export interface UserProfileRecord {
  schemaVersion: 1;
  locale: 'sr';
  timeZone: string;
  favoriteTeamIds: string[];
  reminderMinutes: ReminderMinutes;
  notifyScheduleChange: boolean;
  notifyCancellation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FollowedClubRecord {
  teamId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManualSelectionRecord {
  fixtureId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord {
  installationId: string;
  /** null dok faza 09 ne upiše Firebase Installation ID. Nije FCM registration token. */
  fid: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface AccountDeletionRecord {
  status: 'in_progress';
  startedAt: string;
  updatedAt: string;
}

/** Brava van users/{uid}. Nema profila, omiljenih ni uređaja. Klijent je ne briše. */
export interface AccountTombstoneRecord {
  status: 'in_progress';
  startedAt: string;
  updatedAt: string;
}

/**
 * Identitet posla koji faza 10 sme da dopuni serverskim poljima.
 * Kolekciju i dalje piše samo server.
 */
export interface NotifJobIdentity {
  uid: string;
  installationId: string;
  fixtureId: string;
  kind: NotifJobKind;
  scheduleRevision: number;
  leadMinutes: ReminderMinutes;
}

export function assertAccountUid(uid: string): string {
  if (!ACCOUNT_UID_PATTERN.test(uid)) throw new Error('uid');
  return uid;
}

export function deletionFlagKey(uid: string): string {
  return `matchahead.deletion.${assertAccountUid(uid)}`;
}

export function isReminderMinutes(value: number): value is ReminderMinutes {
  return value === 0 || value === 15 || value === 30 || value === 60;
}

export function isIsoStamp(value: string): boolean {
  return ISO_STAMP.test(value);
}

/** Pravila proveravaju oblik. Nepodržana IANA zona ne sme da sruši Intl. */
export function timeZoneForDisplay(value: string): string {
  if (!TIME_ZONE_PATTERN.test(value)) return 'Europe/Belgrade';
  try {
    new Intl.DateTimeFormat('sr', { timeZone: value }).format(0);
    return value;
  } catch {
    return 'Europe/Belgrade';
  }
}

export interface ProfileInput {
  timeZone: string;
  favoriteTeamIds: readonly string[];
  reminderMinutes: number;
  notifyScheduleChange: boolean;
  notifyCancellation: boolean;
  createdAt: string;
  updatedAt: string;
}

export function buildProfile(input: ProfileInput): UserProfileRecord {
  const timeZone = timeZoneForDisplay(input.timeZone);
  if (!isReminderMinutes(input.reminderMinutes)) throw new Error('reminder');
  if (!isIsoStamp(input.createdAt) || !isIsoStamp(input.updatedAt)) throw new Error('stamp');
  if (input.favoriteTeamIds.length > SELECTABLE_TEAM_LIMIT) throw new Error('favorites_limit');
  const favoriteTeamIds: string[] = [];
  for (const teamId of input.favoriteTeamIds) {
    if (!isSelectableTeamId(teamId)) throw new Error('team_not_selectable');
    if (!favoriteTeamIds.includes(teamId)) favoriteTeamIds.push(teamId);
  }
  return {
    schemaVersion: USER_SCHEMA_VERSION,
    locale: 'sr',
    timeZone,
    favoriteTeamIds,
    reminderMinutes: input.reminderMinutes,
    notifyScheduleChange: input.notifyScheduleChange,
    notifyCancellation: input.notifyCancellation,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function defaultProfile(now: string, timeZone: string, reminderMinutes: number): UserProfileRecord {
  const zone = timeZoneForDisplay(timeZone);
  const reminder = isReminderMinutes(reminderMinutes) ? reminderMinutes : 30;
  return buildProfile({
    timeZone: zone,
    favoriteTeamIds: [],
    reminderMinutes: reminder,
    notifyScheduleChange: true,
    notifyCancellation: true,
    createdAt: now,
    updatedAt: now,
  });
}

export function readProfile(data: unknown): UserProfileRecord | null {
  const record = exactKeys(data, PROFILE_FIELDS);
  if (!record) return null;
  if (record.schemaVersion !== USER_SCHEMA_VERSION || record.locale !== 'sr') return null;
  if (typeof record.timeZone !== 'string' || !TIME_ZONE_PATTERN.test(record.timeZone)) return null;
  const timeZone = timeZoneForDisplay(record.timeZone);
  if (!isReminderMinutes(record.reminderMinutes as number)) return null;
  if (typeof record.notifyScheduleChange !== 'boolean' || typeof record.notifyCancellation !== 'boolean') return null;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return null;
  if (!isIsoStamp(record.createdAt) || !isIsoStamp(record.updatedAt)) return null;
  if (!Array.isArray(record.favoriteTeamIds) || record.favoriteTeamIds.length > SELECTABLE_TEAM_LIMIT) return null;
  const favoriteTeamIds: string[] = [];
  for (const teamId of record.favoriteTeamIds) {
    if (typeof teamId !== 'string' || !isSelectableTeamId(teamId) || favoriteTeamIds.includes(teamId)) return null;
    favoriteTeamIds.push(teamId);
  }
  return {
    schemaVersion: 1,
    locale: 'sr',
    timeZone,
    favoriteTeamIds,
    reminderMinutes: record.reminderMinutes as ReminderMinutes,
    notifyScheduleChange: record.notifyScheduleChange,
    notifyCancellation: record.notifyCancellation,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildFollow(input: {
  teamId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}): FollowedClubRecord {
  if (!isSelectableTeamId(input.teamId)) throw new Error('team_not_selectable');
  if (!isIsoStamp(input.createdAt) || !isIsoStamp(input.updatedAt)) throw new Error('stamp');
  return {
    teamId: input.teamId,
    active: input.active,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function readFollow(docId: string, data: unknown): FollowedClubRecord | null {
  const record = exactKeys(data, FOLLOW_FIELDS);
  if (!record) return null;
  if (record.teamId !== docId || typeof record.teamId !== 'string' || !isSelectableTeamId(record.teamId)) return null;
  if (typeof record.active !== 'boolean') return null;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return null;
  if (!isIsoStamp(record.createdAt) || !isIsoStamp(record.updatedAt)) return null;
  return {
    teamId: record.teamId,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildManualSelection(input: {
  fixtureId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}): ManualSelectionRecord {
  if (!FIXTURE_DOC_ID_PATTERN.test(input.fixtureId)) throw new Error('fixture_id');
  if (!isIsoStamp(input.createdAt) || !isIsoStamp(input.updatedAt)) throw new Error('stamp');
  return {
    fixtureId: input.fixtureId,
    active: input.active,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function readManualSelection(docId: string, data: unknown): ManualSelectionRecord | null {
  const record = exactKeys(data, MANUAL_SELECTION_FIELDS);
  if (!record) return null;
  if (record.fixtureId !== docId || typeof record.fixtureId !== 'string') return null;
  if (!FIXTURE_DOC_ID_PATTERN.test(record.fixtureId) || typeof record.active !== 'boolean') return null;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return null;
  if (!isIsoStamp(record.createdAt) || !isIsoStamp(record.updatedAt)) return null;
  return {
    fixtureId: record.fixtureId,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildDevice(input: {
  installationId: string;
  fid: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}): DeviceRecord {
  if (!INSTALLATION_ID_PATTERN.test(input.installationId)) throw new Error('installation_id');
  if (input.fid !== null && !FID_PATTERN.test(input.fid)) throw new Error('fid');
  if (!isIsoStamp(input.createdAt) || !isIsoStamp(input.updatedAt) || !isIsoStamp(input.lastSeenAt)) {
    throw new Error('stamp');
  }
  return { ...input };
}

export function readDevice(docId: string, data: unknown): DeviceRecord | null {
  const record = exactKeys(data, DEVICE_FIELDS);
  if (!record) return null;
  if (record.installationId !== docId || typeof record.installationId !== 'string') return null;
  if (!INSTALLATION_ID_PATTERN.test(record.installationId)) return null;
  if (record.fid !== null && (typeof record.fid !== 'string' || !FID_PATTERN.test(record.fid))) return null;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string' || typeof record.lastSeenAt !== 'string') {
    return null;
  }
  if (!isIsoStamp(record.createdAt) || !isIsoStamp(record.updatedAt) || !isIsoStamp(record.lastSeenAt)) return null;
  return {
    installationId: record.installationId,
    fid: record.fid === null ? null : record.fid,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
  };
}

export function buildDeletion(input: { startedAt: string; updatedAt: string }): AccountDeletionRecord {
  if (!isIsoStamp(input.startedAt) || !isIsoStamp(input.updatedAt)) throw new Error('stamp');
  return { status: 'in_progress', startedAt: input.startedAt, updatedAt: input.updatedAt };
}

export function buildTombstone(input: { startedAt: string; updatedAt: string }): AccountTombstoneRecord {
  if (!isIsoStamp(input.startedAt) || !isIsoStamp(input.updatedAt)) throw new Error('stamp');
  return { status: 'in_progress', startedAt: input.startedAt, updatedAt: input.updatedAt };
}

export function readTombstone(data: unknown): AccountTombstoneRecord | null {
  const record = exactKeys(data, TOMBSTONE_FIELDS);
  if (!record) return null;
  if (record.status !== 'in_progress') return null;
  if (typeof record.startedAt !== 'string' || typeof record.updatedAt !== 'string') return null;
  if (!isIsoStamp(record.startedAt) || !isIsoStamp(record.updatedAt)) return null;
  return { status: 'in_progress', startedAt: record.startedAt, updatedAt: record.updatedAt };
}

export function agendaInputs(input: {
  follows: readonly FollowedClubRecord[];
  manualSelections: readonly ManualSelectionRecord[];
}): { followedTeamIds: string[]; manualFixtureIds: string[] } {
  const followedTeamIds: string[] = [];
  for (const follow of input.follows) {
    if (!follow.active || !isSelectableTeamId(follow.teamId) || followedTeamIds.includes(follow.teamId)) continue;
    followedTeamIds.push(follow.teamId);
  }
  const manualFixtureIds: string[] = [];
  for (const selection of input.manualSelections) {
    if (!selection.active || !FIXTURE_DOC_ID_PATTERN.test(selection.fixtureId)) continue;
    if (!manualFixtureIds.includes(selection.fixtureId)) manualFixtureIds.push(selection.fixtureId);
  }
  return { followedTeamIds, manualFixtureIds };
}

export function inclusionReasonsForFixture(input: {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  followedTeamIds: readonly string[];
  manualFixtureIds: readonly string[];
}): InclusionReason[] {
  const reasons: InclusionReason[] = [];
  const seen = new Set<string>();
  for (const teamId of input.followedTeamIds) {
    if (!isSelectableTeamId(teamId)) continue;
    if (teamId !== input.homeTeamId && teamId !== input.awayTeamId) continue;
    const key = `followed_team:${teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reasons.push({ kind: 'followed_team', teamId });
  }
  if (input.manualFixtureIds.includes(input.fixtureId)) {
    reasons.push({ kind: 'manual_selection', fixtureId: input.fixtureId });
  }
  return reasons;
}

function exactKeys(data: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const present = Object.keys(record);
  if (present.length !== keys.length) return null;
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) return null;
  }
  return record;
}
