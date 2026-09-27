import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countdownLabel,
  fixturesForFollowed,
  fixturesForLocalDates,
  fixtureTitle,
  kickoffText,
  localDateInZone,
  nextConfirmedFixtures,
  weekDatesAfter,
} from '../src/logic/agenda.ts';
import type { Fixture } from '../../../packages/domain/src/types.ts';

const now = Date.parse('2026-09-27T12:00:00Z');

test('sledeća utakmica je najraniji potvrđen termin, bez lažnog odbrojavanja', () => {
  const fixtures = [
    fixture({ id: 'later', startsAtUtc: '2026-09-30T15:00:00Z', timeConfirmed: true, status: 'scheduled' }),
    fixture({ id: 'next', startsAtUtc: '2026-09-27T17:00:00Z', timeConfirmed: true, status: 'scheduled' }),
    fixture({ id: 'tied', startsAtUtc: '2026-09-27T17:00:00Z', timeConfirmed: true, status: 'scheduled' }),
    fixture({ id: 'past', startsAtUtc: '2026-09-01T17:00:00Z', timeConfirmed: true, status: 'scheduled' }),
    fixture({ id: 'tbd', startsAtUtc: null, timeConfirmed: false, status: 'time_tbd', scheduledLocalDate: '2026-09-27' }),
    fixture({ id: 'postponed', startsAtUtc: null, timeConfirmed: false, status: 'postponed' }),
  ];
  const next = nextConfirmedFixtures(fixtures, now).map((item) => item.id).sort();
  assert.deepEqual(next, ['next', 'tied']);
  assert.equal(countdownLabel(fixtures[4]!, now), null);
  assert.equal(countdownLabel(fixtures[5]!, now), null);
  assert.equal(countdownLabel(fixtures[3]!, now), null);
  assert.match(countdownLabel(fixtures[1]!, now) ?? '', /^počinje za /);
});

test('danas i narednih sedam dana koriste zonu, a gostovanje ostaje vidljivo', () => {
  const home = fixture({
    id: 'home',
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-27T17:00:00Z',
    scheduledLocalDate: '2026-09-27',
  });
  const away = fixture({
    id: 'away',
    homeTeamId: 'football:xx:demo-rival-istok',
    awayTeamId: 'football:rs:partizan',
    startsAtUtc: '2026-09-30T15:00:00Z',
    scheduledLocalDate: '2026-09-30',
  });
  assert.equal(localDateInZone(Date.parse('2026-09-27T22:30:00Z'), 'Europe/Belgrade'), '2026-09-28');
  const today = fixturesForLocalDates([home, away], ['2026-09-27'], 'Europe/Belgrade').map((item) => item.id);
  assert.deepEqual(today, ['home']);
  const week = fixturesForLocalDates([home, away], weekDatesAfter('2026-09-27'), 'Europe/Belgrade').map((item) => item.id);
  assert.deepEqual(week, ['away']);
  const followed = fixturesForFollowed([home, away], ['football:rs:partizan']);
  assert.deepEqual(followed.map((item) => item.id), ['away']);
  assert.equal(
    kickoffText(fixture({
      id: 'tbd-date',
      startsAtUtc: null,
      timeConfirmed: false,
      status: 'time_tbd',
      scheduledLocalDate: '2026-10-03',
    }), 'Europe/Belgrade'),
    'Termin nije potvrđen. Datum u izvoru: 3. oktobar 2026.',
  );
  assert.equal(fixtureTitle(away, [
    { id: 'football:xx:demo-rival-istok', name: 'DEMO Rival Istok' },
    { id: 'football:rs:partizan', name: 'FK Partizan' },
  ]), 'DEMO Rival Istok — FK Partizan');
});

function fixture(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    sport: 'football',
    competitionId: 'football:demo:demo-liga',
    seasonId: 'demo-sezona',
    homeTeamId: 'football:rs:partizan',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-27T17:00:00Z',
    scheduledLocalDate: '2026-09-27',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: 'DEMO',
    sourceUrl: 'synthetic://demo/x',
    provider: 'demo',
    providerFixtureId: overrides.id,
    fetchedAt: '2026-09-20T08:00:00.000Z',
    sourceUpdatedAt: null,
    contentHash: 'abc',
    revision: 1,
    ...overrides,
  };
}
