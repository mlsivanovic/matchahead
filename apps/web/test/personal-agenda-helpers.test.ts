import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_FILTER_VALUE,
  applyAgendaFilters,
  catalogRowState,
  clubOptionsForAgenda,
  competitionOptionsForAgenda,
  reasonLabel,
  teamDisplayName,
} from '../src/ui/PersonalAgendaHelpers.ts';
import { buildUserAgenda } from '../src/logic/agenda.ts';
import type { Fixture } from '../../../packages/domain/src/types.ts';

const TEAMS = [
  { id: 'football:rs:partizan', name: 'FK Partizan' },
  { id: 'football:rs:crvena-zvezda', name: 'FK Crvena zvezda' },
  { id: 'football:xx:demo-rival-sever', name: 'DEMO Rival Sever' },
];

const COMPETITIONS = [{ id: 'football:demo:demo-liga', name: 'DEMO liga' }];

function fx(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    sport: 'football',
    competitionId: 'football:demo:demo-liga',
    seasonId: 'demo-sezona',
    homeTeamId: 'football:rs:partizan',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-30T17:00:00Z',
    scheduledLocalDate: '2026-09-30',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: 'DEMO kolo',
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

test('razlozi razlikuju praćeni klub i ručni izbor; omiljeno se ne pominje', () => {
  const followed = reasonLabel({ kind: 'followed_team', teamId: 'football:rs:partizan' }, TEAMS);
  assert.equal(followed, 'Pratim u aplikaciji: FK Partizan');
  assert.equal(reasonLabel({ kind: 'manual_selection', fixtureId: 'x' }, TEAMS), 'Ručni izbor');
  assert.doesNotMatch(followed, /milj|avorit/i);
});

test('nepoznat tim i neodređen protivnik imaju bezbedan tekst', () => {
  assert.equal(teamDisplayName(null, TEAMS), 'Protivnik nije određen');
  assert.equal(teamDisplayName('nepostojeci', TEAMS), 'Nepoznat tim');
});

test('uklanjanje ručnog izbora ne skida utakmicu koju pokriva praćenje', () => {
  const derby = fx({ id: 'derby', homeTeamId: 'football:rs:crvena-zvezda', awayTeamId: 'football:rs:partizan' });
  const both = catalogRowState(derby, ['football:rs:partizan'], ['derby']);
  assert.equal(both.manuallySelected, true);
  assert.equal(both.staysAfterManualRemoval, true);
  assert.equal(both.toggleLabel, 'Ukloni ručni izbor');
  assert.match(both.toggleNote ?? '', /ostaje jer pratiš klub/);
  // Posle uklanjanja ručnog izbora agenda i dalje sadrži utakmicu.
  const after = buildUserAgenda([derby], ['football:rs:partizan'], []);
  assert.equal(after.length, 1);
  const removed = catalogRowState(derby, ['football:rs:partizan'], []);
  assert.equal(removed.manuallySelected, false);
  assert.equal(removed.toggleLabel, 'Dodaj ručno');
});

test('ručni red van praćenih klubova ne tvrdi pokriće praćenjem', () => {
  const neutral = fx({
    id: 'neutral',
    homeTeamId: 'football:xx:demo-rival-sever',
    awayTeamId: 'football:rs:crvena-zvezda',
  });
  const state = catalogRowState(neutral, ['football:rs:partizan'], ['neutral']);
  assert.equal(state.manuallySelected, true);
  assert.deepEqual(state.followedTeamIds, []);
  assert.equal(state.staysAfterManualRemoval, false);
  assert.equal(state.toggleNote, null);
});

test('filteri: sport, klub i takmičenje', () => {
  const entries = buildUserAgenda(
    [
      fx({ id: 'a', sport: 'football', competitionId: 'football:demo:demo-liga' }),
      fx({
        id: 'b',
        sport: 'basketball',
        competitionId: 'basketball:demo:demo-liga',
        homeTeamId: 'basketball:rs:crvena-zvezda',
        awayTeamId: null,
      }),
    ],
    ['football:rs:partizan', 'basketball:rs:crvena-zvezda'],
    [],
  );
  assert.equal(entries.length, 2);
  assert.deepEqual(
    applyAgendaFilters(entries, { sport: 'football', clubId: ALL_FILTER_VALUE, competitionId: ALL_FILTER_VALUE }).map(
      (entry) => entry.fixture.id,
    ),
    ['a'],
  );
  assert.deepEqual(
    applyAgendaFilters(entries, { sport: ALL_FILTER_VALUE, clubId: 'basketball:rs:crvena-zvezda', competitionId: ALL_FILTER_VALUE }).map(
      (entry) => entry.fixture.id,
    ),
    ['b'],
  );
  assert.deepEqual(
    applyAgendaFilters(entries, { sport: ALL_FILTER_VALUE, clubId: ALL_FILTER_VALUE, competitionId: 'nepostojeci' }),
    [],
  );
});

test('opcije klubova i takmičenja dolaze iz agende', () => {
  const entries = buildUserAgenda([fx({ id: 'a' })], ['football:rs:partizan'], []);
  assert.deepEqual(clubOptionsForAgenda(entries, TEAMS), [
    { id: 'football:xx:demo-rival-sever', name: 'DEMO Rival Sever' },
    { id: 'football:rs:partizan', name: 'FK Partizan' },
  ]);
  assert.deepEqual(competitionOptionsForAgenda(entries, COMPETITIONS), [
    { id: 'football:demo:demo-liga', name: 'DEMO liga' },
  ]);
  assert.deepEqual(clubOptionsForAgenda([], TEAMS), []);
});
