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

/** Potvrđen budući termin. Prošli početak ne postaje uživo. Nepotvrđen sat nema odbrojavanje. */
export function countdownLabel(fixture: Fixture, nowMs: number): string | null {
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
