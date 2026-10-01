import type { Fixture, FixtureStatus } from './types.ts';

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-](\d{2}):(\d{2}))$/;
const MIDNIGHT_UTC = /T00:00:00(?:\.000)?Z$/;

/** Kalendarski datum, ne samo oblik YYYY-MM-DD. 2027-02-30 nije datum. */
export function isRealCalendarDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Trenutak sa stvarnim datumom i vremenom. 99:99 i 2027-02-30 ne prolaze. */
export function isRealUtcInstant(value: string): boolean {
  const match = UTC_INSTANT.exec(value);
  if (!match) return false;
  if (!isRealCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[8] !== 'Z') {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}
/** Štampani sat koji sam po sebi nije dokaz termina. 01:00/02:00 često je ponoć UTC u Beogradu. */
const UNTRUSTED_LOCAL_CLOCK = /^(?:00|01|02):00(?::00)?$/;

/**
 * 00:00, 01:00 i 02:00 kao odštampan sat, i goli 00:00Z, nisu potvrđen početak.
 * Pravi sat traži drugi oblik dokaza, ne sam prikaz izvora.
 */
export function isUntrustedKickoffClock(input: {
  printedLocalTime: string | null;
  startsAtUtc: string | null;
}): boolean {
  if (input.printedLocalTime !== null && UNTRUSTED_LOCAL_CLOCK.test(input.printedLocalTime.trim())) {
    return true;
  }
  return input.startsAtUtc !== null && MIDNIGHT_UTC.test(input.startsAtUtc);
}

export interface FixtureTimeInput {
  status: FixtureStatus;
  timeConfirmed: boolean;
  startsAtUtc: string | null;
  scheduledLocalDate: string | null;
  previousStartsAtUtc: string | null;
  previousScheduledLocalDate: string | null;
}

/** Greške ugovora o vremenu. Prazan niz znači da je zapis ispravan. */
export function timeErrors(input: FixtureTimeInput): string[] {
  const errors: string[] = [];

  if (input.timeConfirmed) {
    if (input.startsAtUtc === null || !isRealUtcInstant(input.startsAtUtc)) {
      errors.push('Potvrđen termin mora biti UTC trenutak sa Z ili brojčanim pomakom.');
    }
    if (input.status === 'time_tbd') {
      errors.push('Status time_tbd ne može imati potvrđen termin.');
    }
  } else if (input.startsAtUtc !== null) {
    errors.push('Nepotvrđena satnica ne sme imati startsAtUtc. Ne upisivati 00:00.');
  }

  if (input.status === 'time_tbd' && input.startsAtUtc !== null) {
    errors.push('time_tbd čuva samo datum, ne izmišljeni trenutak.');
  }

  if (
    input.startsAtUtc !== null &&
    MIDNIGHT_UTC.test(input.startsAtUtc) &&
    input.status === 'time_tbd'
  ) {
    errors.push('Ponoć UTC nije zamena za nepoznatu satnicu.');
  }

  if (input.scheduledLocalDate !== null && !isRealCalendarDate(input.scheduledLocalDate)) {
    errors.push('scheduledLocalDate mora biti YYYY-MM-DD.');
  }
  if (
    input.previousScheduledLocalDate !== null &&
    !isRealCalendarDate(input.previousScheduledLocalDate)
  ) {
    errors.push('previousScheduledLocalDate mora biti YYYY-MM-DD.');
  }
  if (input.previousStartsAtUtc !== null && !isRealUtcInstant(input.previousStartsAtUtc)) {
    errors.push('previousStartsAtUtc mora biti UTC trenutak.');
  }

  if (input.status === 'postponed' && !input.timeConfirmed && input.startsAtUtc !== null) {
    errors.push('Odlaganje bez novog termina nema startsAtUtc.');
  }

  if (
    (input.status === 'time_tbd' || input.status === 'postponed') &&
    !input.timeConfirmed &&
    input.scheduledLocalDate === null &&
    input.startsAtUtc !== null
  ) {
    errors.push('Nepoznat datum ne sme dobiti izmišljen trenutak.');
  }

  return errors;
}

export function assertFixtureTime(fixture: Fixture): void {
  const errors = timeErrors(fixture);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
}

/** Da li se utakmica sme izvesti kao vremenski ICS događaj. */
export function canExportTimedEvent(fixture: FixtureTimeInput): boolean {
  return fixture.timeConfirmed && fixture.startsAtUtc !== null && timeErrors(fixture).length === 0;
}

/** Da li je poznat bar kalendarski datum, bez tvrdnje o satu. */
export function hasKnownDate(fixture: FixtureTimeInput): boolean {
  return fixture.scheduledLocalDate !== null || fixture.startsAtUtc !== null;
}
