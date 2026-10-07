import type { Fixture } from '../../../../packages/domain/src/types.ts';

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: { private: { matchaheadFixtureId: string } };
}

export function calendarEligible(fixture: Fixture): boolean {
  return !['cancelled', 'postponed', 'abandoned', 'finished'].includes(fixture.status)
    && ((fixture.timeConfirmed && !!fixture.startsAtUtc && Number.isFinite(Date.parse(fixture.startsAtUtc)))
      || validCalendarDate(fixture.scheduledLocalDate));
}

function validCalendarDate(date: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

/** Resolve an IANA local wall clock using the zone's actual offset, including DST. */
export function localClockUtc(date: string, hour: number, timeZone: string): number {
  const target = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date) throw new Error('Datum nije validan.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((p) => [p.type, p.value]));
    const represented = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const delta = target - represented;
    if (delta === 0) return candidate;
    candidate += delta;
  }
  throw new Error('Termin nije moguće odrediti u izabranoj vremenskoj zoni.');
}

export async function buildCalendarEvent(fixture: Fixture, title: string, competition: string, userTimeZone: string, note = ''): Promise<CalendarEvent> {
  if (!calendarEligible(fixture)) throw new Error('Utakmica nema datum ili nije dostupna za dodavanje.');
  const known = fixture.timeConfirmed && !!fixture.startsAtUtc && Number.isFinite(Date.parse(fixture.startsAtUtc));
  const timeZone = fixture.sourceTimeZone ?? userTimeZone;
  const start = known ? Date.parse(fixture.startsAtUtc!) : localClockUtc(fixture.scheduledLocalDate!, 17, timeZone);
  // A stable event ID makes an ambiguous network failure safe to retry, across devices.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`matchahead:${fixture.id}`));
  const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return {
    id,
    summary: title,
    description: [competition, !known ? 'Vreme nije poznato. Privremeni termin je 17:00; proveri zvaničan raspored.' : '', `Izvor: ${fixture.sourceUrl}`, note.trim(), 'Dodato iz MatchAhead. Jednokratni upis; kasnije promene rasporeda ne ažuriraju se automatski.'].filter(Boolean).join('\n\n'),
    ...(fixture.venue ? { location: fixture.venue } : {}),
    start: { dateTime: new Date(start).toISOString(), timeZone },
    end: { dateTime: new Date(start + 2 * 60 * 60 * 1000).toISOString(), timeZone },
    extendedProperties: { private: { matchaheadFixtureId: fixture.id } },
  };
}

export type CalendarWriteResult = 'created' | 'existing';
export async function insertCalendarEvent(event: CalendarEvent, token: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<CalendarWriteResult> {
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const response = await request(`${base}?sendUpdates=none`, { method: 'POST', headers, body: JSON.stringify(event), signal: requestSignal, cache: 'no-store' });
  if (response.ok) return 'created';
  if (response.status === 409) {
    const existing = await request(`${base}/${event.id}`, { headers, signal: requestSignal, cache: 'no-store' });
    if (existing.ok) {
      const data = await existing.json() as { status?: string; extendedProperties?: { private?: { matchaheadFixtureId?: string } } };
      if (data.status !== 'cancelled' && data.extendedProperties?.private?.matchaheadFixtureId === event.extendedProperties.private.matchaheadFixtureId) return 'existing';
    }
    throw new Error('Događaj sa ovim ID-jem postoji, ali upis nije potvrđen. Proveri Google kalendar.');
  }
  if (response.status === 401) throw new Error('Google dozvola je istekla. Pokreni dodavanje ponovo.');
  if (response.status === 403) throw new Error('Google je odbio upis. Proveri dozvolu za kalendar.');
  if (response.status === 429) throw new Error('Google trenutno ograničava upise. Pokušaj kasnije.');
  throw new Error('Upis nije potvrđen. Pokušaj ponovo; ista utakmica neće napraviti duplikat.');
}
