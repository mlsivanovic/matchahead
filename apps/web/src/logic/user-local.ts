import { isSelectableTeamId } from '../../../../packages/domain/src/selectable-teams.ts';
import { FIXTURE_DOC_ID_PATTERN } from '../../../../packages/domain/src/user-account.ts';
import { parseThemePreference, type ThemePreference } from './theme.ts';

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
    getItem: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        // Odbijen ili pun storage ne sme da sruši prijavu ni temu.
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch {
        // Isto: brisanje koje storage odbije ostavlja prikaz živim.
      }
    },
    keys: () => {
      try {
        const names: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key) names.push(key);
        }
        return names;
      } catch {
        return [];
      }
    },
  };
}

/** Kad je sam pristup storage-u zabranjen, memorija drži sesiju dok se ekran ne sruši. */
export function ensureAccessibleStorage(target: Pick<Window, 'localStorage' | 'sessionStorage'> = window): void {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      void target[name].getItem(DEVICE_PREFS_KEY);
    } catch {
      const data = new Map<string, string>();
      const memory = {
        get length() {
          return data.size;
        },
        clear() {
          data.clear();
        },
        getItem(key: string) {
          return data.has(key) ? data.get(key) ?? null : null;
        },
        key(index: number) {
          return [...data.keys()][index] ?? null;
        },
        removeItem(key: string) {
          data.delete(key);
        },
        setItem(key: string, value: string) {
          data.set(key, value);
        },
      } satisfies Storage;
      try {
        Object.defineProperty(target, name, { configurable: true, get: () => memory });
      } catch {
        // Pozivi kroz browserStore i dalje hvataju grešku ako se zamena ne prihvati.
      }
    }
  }
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

/**
 * Lokalni DEMO ručni izbori: ostaju u sesiji, jasno su lokalni i
 * nikad se ne šalju na server. Ulogovani nalog koristi Firestore.
 */
export function readManualFixtureIds(session: KeyValueStore): string[] {
  const raw = session.getItem(`${SESSION_PREFIX}manualFixtureIds`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && FIXTURE_DOC_ID_PATTERN.test(id));
  } catch {
    return [];
  }
}

export function writeManualFixtureIds(session: KeyValueStore, fixtureIds: readonly string[]): void {
  const unique = [...new Set(fixtureIds.filter((id) => FIXTURE_DOC_ID_PATTERN.test(id)))];
  session.setItem(`${SESSION_PREFIX}manualFixtureIds`, JSON.stringify(unique));
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
  theme: ThemePreference;
}

export function defaultDevicePrefs(): DevicePrefs {
  return { timeZone: 'Europe/Belgrade', reminderMinutes: 30, theme: 'auto' };
}

export function readDevicePrefs(local: KeyValueStore): DevicePrefs {
  const fallback = defaultDevicePrefs();
  let raw: string | null;
  try {
    raw = local.getItem(DEVICE_PREFS_KEY);
  } catch {
    return fallback;
  }
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
    return { timeZone, reminderMinutes, theme: parseThemePreference(parsed.theme) };
  } catch {
    return fallback;
  }
}

export function writeDevicePrefs(local: KeyValueStore, prefs: DevicePrefs): void {
  try {
    local.setItem(DEVICE_PREFS_KEY, JSON.stringify({
      timeZone: prefs.timeZone,
      reminderMinutes: prefs.reminderMinutes,
      theme: parseThemePreference(prefs.theme),
    }));
  } catch {
    // Tema u memoriji i dalje važi; sledeće čitanje bez zapisa daje Auto.
  }
}
