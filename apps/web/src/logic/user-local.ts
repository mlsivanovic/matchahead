import { isSelectableTeamId } from '../../../../packages/domain/src/selectable-teams.ts';

export const SESSION_PREFIX = 'matchahead.session.';
export const USER_PREFIX = 'matchahead.user.';
export const DEVICE_PREFS_KEY = 'matchahead.device.prefs';

const UID = /^[A-Za-z0-9_-]{1,128}$/;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
  };
}

export function browserStore(storage: Storage): KeyValueStore {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const names: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) names.push(key);
      }
      return names;
    },
  };
}

export function assertUid(uid: string): string {
  if (!UID.test(uid)) throw new Error('uid nije bezbedan ključ.');
  return uid;
}

export function readFollowedTeamIds(session: KeyValueStore): string[] {
  const raw = session.getItem(`${SESSION_PREFIX}followedTeamIds`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && isSelectableTeamId(id));
  } catch {
    return [];
  }
}

export function writeFollowedTeamIds(session: KeyValueStore, teamIds: readonly string[]): void {
  const unique = [...new Set(teamIds.filter((id) => isSelectableTeamId(id)))];
  session.setItem(`${SESSION_PREFIX}followedTeamIds`, JSON.stringify(unique));
}

export function readDraftNote(session: KeyValueStore): string {
  return session.getItem(`${SESSION_PREFIX}draftNote`) ?? '';
}

export function writeDraftNote(session: KeyValueStore, note: string): void {
  session.setItem(`${SESSION_PREFIX}draftNote`, note.slice(0, 2000));
}

export function writeUserScopedNote(local: KeyValueStore, uid: string, note: string): void {
  local.setItem(`${USER_PREFIX}${assertUid(uid)}.note`, note);
}

/**
 * Odjava briše sesiju i samo taj uid. Tuđi ključ i podešavanja uređaja ostaju.
 * U ovoj fazi nema Google naloga; sesija je privremena i nije nalog.
 */
export function clearUserLocalContent(local: KeyValueStore, session: KeyValueStore, uid: string | null): void {
  for (const key of session.keys()) {
    if (key.startsWith(SESSION_PREFIX)) session.removeItem(key);
  }
  if (uid === null) return;
  const prefix = `${USER_PREFIX}${assertUid(uid)}.`;
  for (const key of local.keys()) {
    if (key.startsWith(prefix)) local.removeItem(key);
  }
}

export interface DevicePrefs {
  timeZone: string;
  reminderMinutes: 0 | 15 | 30 | 60;
}

export function defaultDevicePrefs(): DevicePrefs {
  return { timeZone: 'Europe/Belgrade', reminderMinutes: 30 };
}

export function readDevicePrefs(local: KeyValueStore): DevicePrefs {
  const fallback = defaultDevicePrefs();
  const raw = local.getItem(DEVICE_PREFS_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DevicePrefs>;
    const reminder = parsed.reminderMinutes;
    const timeZone = typeof parsed.timeZone === 'string' && parsed.timeZone.length > 0
      ? parsed.timeZone
      : fallback.timeZone;
    const reminderMinutes = reminder === 0 || reminder === 15 || reminder === 30 || reminder === 60
      ? reminder
      : fallback.reminderMinutes;
    return { timeZone, reminderMinutes };
  } catch {
    return fallback;
  }
}

export function writeDevicePrefs(local: KeyValueStore, prefs: DevicePrefs): void {
  local.setItem(DEVICE_PREFS_KEY, JSON.stringify(prefs));
}
