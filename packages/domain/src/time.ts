import type { Fixture, FixtureStatus } from './types.ts';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MIDNIGHT_UTC = /T00:00:00(?:\.000)?Z$/;
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
    if (input.startsAtUtc === null || !UTC_INSTANT.test(input.startsAtUtc)) {
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

  if (input.scheduledLocalDate !== null && !LOCAL_DATE.test(input.scheduledLocalDate)) {
    errors.push('scheduledLocalDate mora biti YYYY-MM-DD.');
  }
  if (
    input.previousScheduledLocalDate !== null &&
    !LOCAL_DATE.test(input.previousScheduledLocalDate)
  ) {
    errors.push('previousScheduledLocalDate mora biti YYYY-MM-DD.');
  }
  if (input.previousStartsAtUtc !== null && !UTC_INSTANT.test(input.previousStartsAtUtc)) {
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
