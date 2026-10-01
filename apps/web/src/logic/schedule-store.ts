import { DEFAULT_ON_DEMAND_POLICY } from '../../../../packages/domain/src/find-fixtures.ts';
import type { FindFixturesHttpSuccess } from '../../../../packages/domain/src/schedule-api.ts';

import { parseFindResponse } from './schedule-api.ts';
import type { KeyValueStore } from './user-local.ts';

/**
 * Faza 05: trajno poslednje dobro stanje po klubu i sezoni.
 * Ključ je namerno na uređaju (`matchahead.device.schedule.*`), a ne u
 * sesiji ni po uid-u: sportski raspored je javan podatak i preživljava
 * odjavu i zamenu naloga. Nikad ne sadrži uid, email, token ni Authorization
 * vrednost — samo serverov odgovor i trenutke pokušaja.
 * Pad servera, 429, timeout i pogrešan odgovor čuvaju prikaz: ništa se ne
 * briše pre uspešnog novog odgovora. Nestanak reda nije otkazivanje.
 *
 * Sintetički DEMO se ovde nikad ne upisuje: služi izolovanoj proveri i ne
 * sme da zameni niti zarazi provereni prikaz i agendu. Prva blokada sa
 * checkedAt null je validna i ne sme se potpisati kao „poslednji uspeh”.
 */

const DEVICE_KEY_PREFIX = 'matchahead.device.schedule.';
const ATTEMPT_SUFFIX = ':attempt-at';

export interface LastGoodSchedule {
  teamId: string;
  sport: string;
  seasonId: string;
  kind: 'verified-schedule' | 'source-blocked';
  response: FindFixturesHttpSuccess;
  /**
   * Trenutak poslednjeg snimka koji je objavio bar jedan dozvoljen feed.
   * null dok takav snimak ne postoji (prva blokada, neuspeh).
   */
  checkedAt: string | null;
  storedAt: string;
}

function entryKey(teamId: string, seasonId: string): string {
  return `${DEVICE_KEY_PREFIX}${teamId}:${seasonId}`;
}

function attemptKey(teamId: string, seasonId: string): string {
  return `${entryKey(teamId, seasonId)}${ATTEMPT_SUFFIX}`;
}

function isSafeKey(teamId: string, seasonId: string): boolean {
  return /^[a-z]+:[a-z]{2}:[a-z0-9-]+$/.test(teamId) && /^\d{4}-\d{4}$/.test(seasonId);
}

/**
 * Čitanje prolazi kroz isti potpuni validator kao mrežni odgovor,
 * ne kroz plitku proveru nizova: oštećen zapis je null, ne prikaz.
 */
export function readLastGood(store: KeyValueStore, teamId: string, seasonId: string): LastGoodSchedule | null {
  if (!isSafeKey(teamId, seasonId)) return null;
  const raw = store.getItem(entryKey(teamId, seasonId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastGoodSchedule>;
    if (parsed.teamId !== teamId || parsed.seasonId !== seasonId) return null;
    if (parsed.kind !== 'verified-schedule' && parsed.kind !== 'source-blocked') return null;
    if (parsed.checkedAt !== null && (typeof parsed.checkedAt !== 'string' || Number.isNaN(Date.parse(parsed.checkedAt)))) {
      return null;
    }
    if (typeof parsed.storedAt !== 'string' || Number.isNaN(Date.parse(parsed.storedAt))) return null;
    const response = parseFindResponse(parsed.response);
    if (response.kind !== parsed.kind) return null;
    if (response.result.teamId !== teamId || response.result.seasonId !== seasonId) return null;
    return { ...parsed, response } as LastGoodSchedule;
  } catch {
    return null;
  }
}

/**
 * Upis samo posle uspešno validiranog verified/blocked odgovora.
 * DEMO se odbija da ne bi zamenio provereno stanje; greške nikad ne brišu.
 */
export function writeLastGood(store: KeyValueStore, entry: LastGoodSchedule): void {
  if (!isSafeKey(entry.teamId, entry.seasonId)) throw new Error('Neispravan ključ rasporeda.');
  if (entry.kind === 'synthetic-demo' as string) throw new Error('DEMO se ne upisuje u trajno stanje.');
  parseFindResponse(entry.response);
  store.setItem(entryKey(entry.teamId, entry.seasonId), JSON.stringify(entry));
}

/** Trenutak poslednjeg klika (uspeo ili ne) — osnova kuldauna za „Osveži”. */
export function readLastAttemptAt(store: KeyValueStore, teamId: string, seasonId: string): string | null {
  if (!isSafeKey(teamId, seasonId)) return null;
  const raw = store.getItem(attemptKey(teamId, seasonId));
  if (!raw || Number.isNaN(Date.parse(raw))) return null;
  return raw;
}

export function writeLastAttemptAt(store: KeyValueStore, teamId: string, seasonId: string, at: string): void {
  if (!isSafeKey(teamId, seasonId)) throw new Error('Neispravan ključ rasporeda.');
  if (Number.isNaN(Date.parse(at))) throw new Error('attemptAt nije trenutak.');
  store.setItem(attemptKey(teamId, seasonId), at);
}

export interface CooldownState {
  allowed: boolean;
  /** Preostalo do sledećeg dozvoljenog ručnog osvežavanja, u ms. */
  waitMs: number;
}

/**
 * Ručno osvežavanje ne zove izvor češće od minRefreshMinutes (15 po
 * DEFAULT_ON_DEMAND_POLICY). Prvo pronalaženje je uvek dozvoljeno.
 */
export function refreshCooldown(
  store: KeyValueStore,
  teamId: string,
  seasonId: string,
  nowMs: number,
  minRefreshMinutes: number = DEFAULT_ON_DEMAND_POLICY.minRefreshMinutes,
): CooldownState {
  const last = readLastAttemptAt(store, teamId, seasonId);
  if (!last) return { allowed: true, waitMs: 0 };
  const elapsed = nowMs - Date.parse(last);
  if (!Number.isFinite(elapsed)) return { allowed: true, waitMs: 0 };
  // Sat prikaza može kasniti za upravo upisanim pokušajem: negativno je nula.
  const since = Math.max(0, elapsed);
  const windowMs = Math.max(0, minRefreshMinutes) * 60 * 1000;
  if (since >= windowMs) return { allowed: true, waitMs: 0 };
  return { allowed: false, waitMs: windowMs - since };
}

/** Sva sačuvana stanja za sezonu, za spajanje sa ličnom agendom. */
export function listLastGood(store: KeyValueStore, seasonId: string): LastGoodSchedule[] {
  if (!/^\d{4}-\d{4}$/.test(seasonId)) return [];
  const found: LastGoodSchedule[] = [];
  for (const key of store.keys()) {
    if (!key.startsWith(DEVICE_KEY_PREFIX)) continue;
    const rest = key.slice(DEVICE_KEY_PREFIX.length);
    const separator = rest.lastIndexOf(':');
    if (separator < 0) continue;
    const teamId = rest.slice(0, separator);
    const season = rest.slice(separator + 1);
    if (season !== seasonId) continue;
    const entry = readLastGood(store, teamId, season);
    if (entry) found.push(entry);
  }
  return found.sort((left, right) => left.teamId.localeCompare(right.teamId));
}

/** Ključevi ovog modula ostaju na uređaju i preživljavaju zamenu naloga. */
export function isDeviceScheduleKey(key: string): boolean {
  return key.startsWith(DEVICE_KEY_PREFIX);
}
