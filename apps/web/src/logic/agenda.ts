import type { Fixture } from '../../../../packages/domain/src/types.ts';

const MONTHS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
];

export function formatCalendarDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return isoDate;
  return `${Number(match[3])}. ${month} ${match[1]}.`;
}

export function localDateInZone(instantMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instantMs);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error('Datum mora biti YYYY-MM-DD.');
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return utc.toISOString().slice(0, 10);
}

export function formatKickoff(startsAtUtc: string, timeZone: string): string {
  const value = new Date(startsAtUtc);
  const date = new Intl.DateTimeFormat('sr-Latn-RS', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value);
  const time = new Intl.DateTimeFormat('sr-Latn-RS', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
  return `${date} u ${time}`;
}

export function formatFetchedAt(fetchedAt: string, timeZone: string): string {
  return formatKickoff(fetchedAt, timeZone);
}

/** Potvrđen budući termin. Prošli početak ne postaje uživo. Nepotvrđen sat nema odbrojavanje. Izričit live nema odbrojavanje: status se bezbedno prikazuje kao početak po rasporedu, pa buduće odbrojavanje uz njega ne sme da protivreči. */
export function countdownLabel(fixture: Fixture, nowMs: number): string | null {
  if (fixture.status === 'live') return null;
  if (!fixture.timeConfirmed || fixture.startsAtUtc === null) return null;
  if (fixture.status === 'finished' || fixture.status === 'cancelled' || fixture.status === 'abandoned') return null;
  const delta = Date.parse(fixture.startsAtUtc) - nowMs;
  if (delta < 0) return null;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'počinje za manje od minuta';
  if (minutes < 60) return `počinje za ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `počinje za ${hours} h`;
  return `počinje za ${Math.floor(hours / 24)} d`;
}

export function kickoffText(fixture: Fixture, timeZone: string): string {
  if ((fixture.status === 'postponed' || fixture.status === 'cancelled') && !fixture.timeConfirmed) {
    const previous = fixture.previousScheduledLocalDate
      ? ` Raniji datum: ${formatCalendarDate(fixture.previousScheduledLocalDate)}.`
      : '';
    const label = fixture.status === 'cancelled' ? 'Otkazano.' : 'Odloženo. Novi termin nije objavljen.';
    return `${label}${previous}`;
  }
  if (!fixture.timeConfirmed || fixture.startsAtUtc === null) {
    if (fixture.scheduledLocalDate) {
      return `Termin nije potvrđen. Datum u izvoru: ${formatCalendarDate(fixture.scheduledLocalDate)}`;
    }
    return 'Termin nije potvrđen.';
  }
  return formatKickoff(fixture.startsAtUtc, timeZone);
}

export function fixtureCalendarDate(fixture: Fixture, timeZone: string): string | null {
  if (fixture.timeConfirmed && fixture.startsAtUtc) {
    return localDateInZone(Date.parse(fixture.startsAtUtc), timeZone);
  }
  return fixture.scheduledLocalDate;
}

function compareFixtures(left: Fixture, right: Fixture): number {
  const leftTime = left.startsAtUtc ? Date.parse(left.startsAtUtc) : Number.POSITIVE_INFINITY;
  const rightTime = right.startsAtUtc ? Date.parse(right.startsAtUtc) : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const leftDate = left.scheduledLocalDate ?? '9999-99-99';
  const rightDate = right.scheduledLocalDate ?? '9999-99-99';
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
  return left.id.localeCompare(right.id);
}

export function nextConfirmedFixtures(fixtures: readonly Fixture[], nowMs: number): Fixture[] {
  const upcoming = fixtures
    .filter((fixture) => fixture.timeConfirmed
      && fixture.startsAtUtc !== null
      && fixture.status !== 'cancelled'
      && fixture.status !== 'finished'
      && fixture.status !== 'abandoned'
      && Date.parse(fixture.startsAtUtc) >= nowMs)
    .sort(compareFixtures);
  if (upcoming.length === 0) return [];
  const kick = upcoming[0]?.startsAtUtc;
  return upcoming.filter((fixture) => fixture.startsAtUtc === kick);
}

export function fixturesForLocalDates(
  fixtures: readonly Fixture[],
  dates: readonly string[],
  timeZone: string,
): Fixture[] {
  const wanted = new Set(dates);
  return fixtures
    .filter((fixture) => {
      const date = fixtureCalendarDate(fixture, timeZone);
      return date !== null && wanted.has(date);
    })
    .sort(compareFixtures);
}

export function weekDatesAfter(today: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(today, index + 1));
}

export interface MatchGroups {
  confirmed: Fixture[];
  unconfirmed: Fixture[];
  disrupted: Fixture[];
}

export function myMatchGroups(fixtures: readonly Fixture[]): MatchGroups {
  const confirmed: Fixture[] = [];
  const unconfirmed: Fixture[] = [];
  const disrupted: Fixture[] = [];
  for (const fixture of fixtures) {
    if (fixture.status === 'postponed' || fixture.status === 'cancelled' || fixture.status === 'abandoned') {
      disrupted.push(fixture);
    } else if (!fixture.timeConfirmed || fixture.startsAtUtc === null) {
      unconfirmed.push(fixture);
    } else {
      confirmed.push(fixture);
    }
  }
  confirmed.sort(compareFixtures);
  unconfirmed.sort(compareFixtures);
  disrupted.sort(compareFixtures);
  return { confirmed, unconfirmed, disrupted };
}

export function fixturesForFollowed(fixtures: readonly Fixture[], followedTeamIds: readonly string[]): Fixture[] {
  return fixtures.filter((fixture) => followedTeamIds.some((teamId) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId));
}

/**
 * Faza 06: čista korisnička agenda kao unija praćenih klubova i ručnih izbora.
 * Namerno prima samo `followedTeamIds` i `manualFixtureIds` kao readonly nizove
 * umesto celog korisničkog modela, jer Grok schema (faza 04) još nije gotova.
 * DEMO podaci; nema Google/ICS tvrdnji, nema mrežnih poziva, nema auth-a.
 */

/** Razlog uključivanja jednog reda agende. Svi razlozi se čuvaju. */
export type AgendaInclusionReason =
  | { kind: 'followed_team'; teamId: string }
  | { kind: 'manual_selection'; fixtureId: string };

/** Jedan red agende: jedna stabilna fixture ID, svi njeni razlozi. */
export interface AgendaEntry {
  fixture: Fixture;
  reasons: AgendaInclusionReason[];
}

function followedReasonsForFixture(
  fixture: Pick<Fixture, 'homeTeamId' | 'awayTeamId'>,
  followedTeamIds: readonly string[],
): AgendaInclusionReason[] {
  const reasons: AgendaInclusionReason[] = [];
  const seen = new Set<string>();
  for (const teamId of followedTeamIds) {
    if (seen.has(teamId)) continue;
    if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
      seen.add(teamId);
      reasons.push({ kind: 'followed_team', teamId });
    }
  }
  return reasons;
}

/** Svi razlozi uključivanja za jednu utakmicu. Prazan niz znači: nije u agendi. */
export function reasonsForFixture(
  fixture: Pick<Fixture, 'id' | 'homeTeamId' | 'awayTeamId'>,
  followedTeamIds: readonly string[],
  manualFixtureIds: readonly string[],
): AgendaInclusionReason[] {
  const reasons = followedReasonsForFixture(fixture, followedTeamIds);
  if (manualFixtureIds.includes(fixture.id)
    && !reasons.some((reason) => reason.kind === 'manual_selection')) {
    reasons.push({ kind: 'manual_selection', fixtureId: fixture.id });
  }
  return reasons;
}

/**
 * Unija praćenja i ručnih izbora, deduplikovana po stabilnom fixture ID-u.
 * Jedan red po ID-u; povlačenje jednog razloga (ponovni poziv bez njega)
 * ne uklanja utakmicu koju pokriva drugi razlog. Nepoznati ručni ID se ignoriše.
 * Redosled: UTC početak rastuće, stabilan dodatni ključ (isto kao postojeće).
 */
export function buildUserAgenda(
  fixtures: readonly Fixture[],
  followedTeamIds: readonly string[],
  manualFixtureIds: readonly string[],
): AgendaEntry[] {
  const byId = new Map<string, AgendaEntry>();
  for (const fixture of fixtures) {
    if (byId.has(fixture.id)) continue;
    const reasons = reasonsForFixture(fixture, followedTeamIds, manualFixtureIds);
    if (reasons.length > 0) byId.set(fixture.id, { fixture, reasons });
  }
  return [...byId.values()].sort(compareAgendaEntries);
}

export function compareAgendaEntries(left: AgendaEntry, right: AgendaEntry): number {
  return compareFixtures(left.fixture, right.fixture);
}

/** Grupe ekrana „Moje utakmice” iz faze 06. */
export interface UserAgendaGroups {
  /** Buduće utakmice sa potvrđenim početkom, bez poremećaja. */
  upcoming: AgendaEntry[];
  /** Nepotvrđen sat: nikad ponoć, nikad precizno odbrojavanje. */
  toBeAnnounced: AgendaEntry[];
  /** Odloženo ili otkazano (izričita oznaka organizatora). */
  disrupted: AgendaEntry[];
  /** Prošlo po rasporedu, uživo-downgrade, prekinuto ili završeno. */
  archive: AgendaEntry[];
}

/**
 * Grupisanje agende u odnosu na `nowMs`. Lokalni datum određuje samo
 * grupisanje po danima na ekranu, ne i ovu podelu.
 */
export function groupUserAgenda(entries: readonly AgendaEntry[], nowMs: number): UserAgendaGroups {
  const upcoming: AgendaEntry[] = [];
  const toBeAnnounced: AgendaEntry[] = [];
  const disrupted: AgendaEntry[] = [];
  const archive: AgendaEntry[] = [];
  for (const entry of entries) {
    const fixture = entry.fixture;
    if (fixture.status === 'postponed' || fixture.status === 'cancelled') {
      disrupted.push(entry);
      continue;
    }
    if (fixture.status === 'finished' || fixture.status === 'abandoned' || fixture.status === 'live') {
      archive.push(entry);
      continue;
    }
    if (fixture.timeConfirmed && fixture.startsAtUtc !== null) {
      if (Date.parse(fixture.startsAtUtc) < nowMs) archive.push(entry);
      else upcoming.push(entry);
    } else {
      toBeAnnounced.push(entry);
    }
  }
  upcoming.sort(compareAgendaEntries);
  toBeAnnounced.sort(compareAgendaEntries);
  disrupted.sort(compareAgendaEntries);
  archive.sort(compareAgendaEntries);
  return { upcoming, toBeAnnounced, disrupted, archive };
}

/**
 * „Sledeća” nad agendom: najraniji budući potvrđeni početak.
 * Predikat je namerno isti kao kod postojećeg nextConfirmedFixtures
 * (isključuje otkazane/završene/prekinute; odložena bez termina otpada jer
 * nema potvrđen početak). Istovremene vraćaju sve („još N u isto vreme”).
 */
export function nextAgendaFixtures(entries: readonly AgendaEntry[], nowMs: number): AgendaEntry[] {
  const upcoming = entries
    .filter((entry) => {
      const fixture = entry.fixture;
      return fixture.timeConfirmed
        && fixture.startsAtUtc !== null
        && fixture.status !== 'cancelled'
        && fixture.status !== 'finished'
        && fixture.status !== 'abandoned'
        && Date.parse(fixture.startsAtUtc) >= nowMs;
    })
    .sort(compareAgendaEntries);
  if (upcoming.length === 0) return [];
  const kick = upcoming[0]?.fixture.startsAtUtc;
  return upcoming.filter((entry) => entry.fixture.startsAtUtc === kick);
}

/**
 * Bezbedan status posle prolaska termina: bez pouzdanog live izvora nikad
 * „Uživo” ni izvedeno „Završeno” — samo „Počela prema rasporedu”.
 * Izričit `finished` organizatora ostaje „Završeno”; izričit `live` se
 * namerno spušta na istu bezbednu rečenicu.
 */
export function scheduleStatusLabel(fixture: Fixture, nowMs: number): string {
  if (fixture.status === 'finished') return 'Završeno';
  if (fixture.status === 'cancelled') return 'Otkazano';
  if (fixture.status === 'postponed') return 'Odloženo';
  if (fixture.status === 'abandoned') return 'Prekinuto';
  if (fixture.status === 'live') return 'Počela prema rasporedu';
  if (fixture.timeConfirmed && fixture.startsAtUtc !== null && Date.parse(fixture.startsAtUtc) < nowMs) {
    return 'Počela prema rasporedu';
  }
  return statusLabel(fixture.status);
}

/** Kompatibilnost: sledeća nad sirovim Fixture nizom (postoji od ranije, ostaje). */
export function nextAgendaFixturesFromFixtures(fixtures: readonly Fixture[], nowMs: number): Fixture[] {
  return nextConfirmedFixtures(fixtures, nowMs);
}

export function fixtureTitle(
  fixture: Pick<Fixture, 'homeTeamId' | 'awayTeamId'>,
  teams: readonly { id: string; name: string }[],
): string {
  const name = (id: string | null) => {
    if (id === null) return 'Protivnik nije određen';
    return teams.find((team) => team.id === id)?.name ?? 'Nepoznat tim';
  };
  return `${name(fixture.homeTeamId)} — ${name(fixture.awayTeamId)}`;
}

export function statusLabel(status: Fixture['status']): string {
  switch (status) {
    case 'scheduled':
      return 'Zakazano';
    case 'time_tbd':
      return 'Sat nije potvrđen';
    case 'postponed':
      return 'Odloženo';
    case 'cancelled':
      return 'Otkazano';
    case 'live':
      return 'Uživo';
    case 'finished':
      return 'Završeno';
    case 'abandoned':
      return 'Prekinuto';
    default:
      return status;
  }
}
