import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCalendarEvent, calendarEligible, insertCalendarEvent, localClockUtc } from '../src/logic/calendar.ts';
import type { Fixture } from '../../../packages/domain/src/types.ts';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return { id: 'fss:derby-2026', sport: 'football', competitionId: 'superliga', seasonId: '2026-27', homeTeamId: 'zvezda', awayTeamId: 'partizan', startsAtUtc: null, scheduledLocalDate: '2026-10-06', sourceTimeZone: 'Europe/Belgrade', timeConfirmed: false, previousStartsAtUtc: null, previousScheduledLocalDate: null, status: 'time_tbd', venue: 'Stadion', round: '12', sourceUrl: 'https://example.com/fixtures', provider: 'fss', providerFixtureId: '12', fetchedAt: '2026-10-06T10:00:00Z', sourceUpdatedAt: null, contentHash: 'hash', revision: 1, ...overrides };
}

test('unknown kickoff is 17h in source zone, not viewer zone, with explicit note', async () => {
  const event = await buildCalendarEvent(fixture(), 'Zvezda — Partizan', 'Superliga', 'America/New_York', 'Moja beleška');
  assert.equal(event.start.dateTime, '2026-10-06T15:00:00.000Z');
  assert.equal(event.end.dateTime, '2026-10-06T17:00:00.000Z');
  assert.equal(event.start.timeZone, 'Europe/Belgrade');
  assert.match(event.description, /Vreme nije poznato/);
  assert.match(event.description, /Moja beleška/);
});
test('17h honors winter, summer and DST transition dates', () => {
  for (const [date, utc] of [['2026-01-10', '16'], ['2026-07-10', '15'], ['2026-03-29', '15'], ['2026-10-25', '16']]) {
    assert.equal(new Date(localClockUtc(date!, 17, 'Europe/Belgrade')).toISOString(), `${date}T${utc}:00:00.000Z`);
  }
  assert.throws(() => localClockUtc('2026-02-30', 17, 'Europe/Belgrade'), /Datum/);
});
test('confirmed kickoff keeps exact UTC, event ID stays stable after schedule change', async () => {
  const first = await buildCalendarEvent(fixture(), 'Derbi', 'Liga', 'Europe/Belgrade');
  const known = await buildCalendarEvent(fixture({ timeConfirmed: true, startsAtUtc: '2026-10-06T19:30:00Z' }), 'Derbi', 'Liga', 'Europe/Belgrade');
  assert.equal(known.start.dateTime, '2026-10-06T19:30:00.000Z');
  assert.doesNotMatch(known.description, /Vreme nije poznato/);
  assert.equal(first.id, known.id);
  assert.match(first.id, /^[0-9a-v]{5,1024}$/);
});
test('unconfirmed clock is ignored; source without zone uses user zone', async () => {
  const event = await buildCalendarEvent(fixture({ startsAtUtc: '2026-10-06T21:00:00Z', sourceTimeZone: null }), 'Derbi', 'Liga', 'Europe/Belgrade');
  assert.equal(event.start.dateTime, '2026-10-06T15:00:00.000Z');
});
test('unknown date and disrupted matches cannot be exported', async () => {
  for (const overrides of [{ scheduledLocalDate: null }, { status: 'cancelled' as const }, { status: 'postponed' as const }, { status: 'finished' as const }]) {
    assert.equal(calendarEligible(fixture(overrides)), false);
    await assert.rejects(buildCalendarEvent(fixture(overrides), 'Derbi', 'Liga', 'Europe/Belgrade'));
  }
});
test('insertion uses bearer header and network-only POST without attendee notifications', async () => {
  const event = await buildCalendarEvent(fixture(), 'Derbi', 'Liga', 'Europe/Belgrade');
  const request: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.cache, 'no-store');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-token');
    return new Response('{}', { status: 200 });
  };
  assert.equal(await insertCalendarEvent(event, 'test-token', new AbortController().signal, request), 'created');
});
test('retry after ambiguous POST confirms matching existing event, rejects unrelated or deleted event', async () => {
  const event = await buildCalendarEvent(fixture(), 'Derbi', 'Liga', 'Europe/Belgrade');
  for (const [existing, expected] of [[{ extendedProperties: event.extendedProperties }, true], [{ status: 'cancelled', extendedProperties: event.extendedProperties }, false], [{ extendedProperties: { private: { matchaheadFixtureId: 'different' } } }, false]] as const) {
    let calls = 0;
    const request: typeof fetch = async () => ++calls === 1 ? new Response('{}', { status: 409 }) : new Response(JSON.stringify(existing), { status: 200 });
    const promise = insertCalendarEvent(event, 'test-token', new AbortController().signal, request);
    if (expected) assert.equal(await promise, 'existing'); else await assert.rejects(promise, /nije potvrđen/);
    assert.equal(calls, 2);
  }
});
test('expired token, denied permission and rate limit remain explicit failures', async () => {
  const event = await buildCalendarEvent(fixture(), 'Derbi', 'Liga', 'Europe/Belgrade');
  for (const [status, pattern] of [[401, /istekla/], [403, /odbio/], [429, /ograničava/], [500, /nije potvrđen/]] as const) {
    await assert.rejects(insertCalendarEvent(event, 'test-token', new AbortController().signal, async () => new Response('{}', { status })), pattern);
  }
  await assert.rejects(
    insertCalendarEvent(event, 'test-token', new AbortController().signal, async () => new Response('{}', { status: 403 })),
    (error: unknown) => error instanceof Error && !/OAuth|test nalog/.test(error.message),
  );
});
