import assert from 'node:assert/strict';
import test from 'node:test';

import { groupUserAgenda } from '../src/logic/agenda.ts';
import type { Fixture } from '../../../packages/domain/src/types.ts';
import { buildUserAgenda } from '../src/logic/agenda.ts';
import {
  AGENDA_PAGE_SIZE,
  activeAgendaFilterCount,
  agendaBucket,
  changeAgendaPage,
  changeAgendaQuery,
  clearPrivateAgendaState,
  DEFAULT_AGENDA_QUERY,
  fallbackSelectionCount,
  groupPageByDay,
  initialAgendaListState,
  matchesForQuery,
  nextFixtureIds,
  paginateItems,
  revalidateSelectedIds,
  selectAllEligible,
  usesUnknownTimeFallback,
} from '../src/ui/PersonalAgendaHelpers.ts';

const NOW = Date.parse('2026-09-30T10:00:00Z');
const ZONE = 'Europe/Belgrade';

function fx(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    sport: 'football',
    competitionId: 'football:demo:demo-liga',
    seasonId: '2026-2027',
    homeTeamId: 'football:rs:partizan',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-10-02T17:00:00Z',
    scheduledLocalDate: '2026-10-02',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: '1',
    sourceUrl: 'https://example.test/match',
    provider: 'demo',
    providerFixtureId: overrides.id,
    fetchedAt: '2026-09-20T08:00:00.000Z',
    sourceUpdatedAt: null,
    contentHash: 'abc',
    revision: 1,
    ...overrides,
  };
}

function entries(fixtures: Fixture[]) {
  return buildUserAgenda(fixtures, ['football:rs:partizan'], []);
}

test('kante prate groupUserAgenda', () => {
  const list = entries([
    fx({ id: 'soon' }),
    fx({ id: 'old', startsAtUtc: '2026-09-01T17:00:00Z', scheduledLocalDate: '2026-09-01', status: 'finished' }),
    fx({ id: 'late', status: 'postponed', timeConfirmed: false, startsAtUtc: null }),
    fx({ id: 'open', timeConfirmed: false, startsAtUtc: null, status: 'time_tbd' }),
    fx({ id: 'live', status: 'live' }),
  ]);
  const groups = groupUserAgenda(list, NOW);
  for (const entry of groups.upcoming) assert.equal(agendaBucket(entry.fixture, NOW), 'upcoming');
  for (const entry of groups.toBeAnnounced) assert.equal(agendaBucket(entry.fixture, NOW), 'unconfirmed');
  for (const entry of groups.disrupted) assert.equal(agendaBucket(entry.fixture, NOW), 'disrupted');
  for (const entry of groups.archive) assert.equal(agendaBucket(entry.fixture, NOW), 'archive');
});

test('podrazumevani prikaz drži nepotvrđen sat, odlaganje i otkazivanje, bez arhive', () => {
  const list = entries([
    fx({ id: 'soon' }),
    fx({ id: 'done', status: 'finished', startsAtUtc: '2026-09-01T17:00:00Z', scheduledLocalDate: '2026-09-01' }),
    fx({ id: 'moved', status: 'postponed', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-03' }),
    fx({ id: 'off', status: 'cancelled', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-04' }),
    fx({ id: 'tbd', status: 'time_tbd', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-05' }),
  ]);
  const upcoming = matchesForQuery(list, DEFAULT_AGENDA_QUERY, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.deepEqual(upcoming.sort(), ['moved', 'off', 'soon', 'tbd'].sort());
  const changes = matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, view: 'changes' }, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.deepEqual(changes.sort(), ['moved', 'off', 'tbd'].sort());
  const archive = matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, view: 'archive' }, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.deepEqual(archive, ['done']);
});

test('period Danas i 7 dana, bez datuma ostaje samo u Sve', () => {
  const list = entries([
    fx({ id: 'today', startsAtUtc: '2026-09-30T18:00:00Z', scheduledLocalDate: '2026-09-30' }),
    fx({ id: 'edge', startsAtUtc: '2026-10-06T18:00:00Z', scheduledLocalDate: '2026-10-06' }),
    fx({ id: 'later', startsAtUtc: '2026-10-07T18:00:00Z', scheduledLocalDate: '2026-10-07' }),
    fx({ id: 'nodate', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: null, status: 'time_tbd' }),
  ]);
  assert.deepEqual(matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, period: 'today' }, NOW, ZONE).map((entry) => entry.fixture.id), ['today']);
  assert.deepEqual(
    matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, period: 'week' }, NOW, ZONE).map((entry) => entry.fixture.id),
    ['today', 'edge'],
  );
  assert.ok(matchesForQuery(list, DEFAULT_AGENDA_QUERY, NOW, ZONE).some((entry) => entry.fixture.id === 'nodate'));
});

test('strana ima 20, izbor svih obuhvata svaku podobnu, promena filtera ga briše', () => {
  const fixtures = Array.from({ length: 25 }, (_, index) => {
    const day = String((index % 27) + 1).padStart(2, '0');
    return fx({
      id: `m${index}`,
      startsAtUtc: index === 4 ? null : `2026-10-${day}T17:00:00Z`,
      scheduledLocalDate: `2026-10-${day}`,
      status: index === 3 ? 'cancelled' : 'scheduled',
      timeConfirmed: index !== 4,
    });
  });
  const list = entries(fixtures);
  const visible = matchesForQuery(list, DEFAULT_AGENDA_QUERY, NOW, ZONE);
  const page = paginateItems(visible, 1);
  assert.equal(page.items.length, AGENDA_PAGE_SIZE);
  assert.equal(paginateItems(visible, 2).items.length, visible.length - AGENDA_PAGE_SIZE);
  const selected = selectAllEligible(initialAgendaListState(), visible);
  assert.ok(selected.selectedIds.length > page.items.length);
  assert.equal(selected.selectedIds.includes('m3'), false);
  const kept = changeAgendaPage(selected, 2);
  assert.equal(kept.page, 2);
  assert.equal(kept.selectedIds.length, selected.selectedIds.length);
  const cleared = changeAgendaQuery(kept, { ...DEFAULT_AGENDA_QUERY, sport: 'basketball' });
  assert.equal(cleared.page, 1);
  assert.deepEqual(cleared.selectedIds, []);
  const swapped = clearPrivateAgendaState({ ...selected, page: 2 });
  assert.equal(swapped.page, 2);
  assert.deepEqual(swapped.selectedIds, []);
  assert.equal(swapped.query.sport, 'all');
});

test('Sledeća je najbliži potvrđeni meč, a 17:00 važi samo za nepoznat sat', () => {
  const list = entries([
    fx({ id: 'later', startsAtUtc: '2026-10-03T17:00:00Z' }),
    fx({ id: 'next', startsAtUtc: '2026-10-01T17:00:00Z', scheduledLocalDate: '2026-10-01' }),
    fx({ id: 'unknown', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-08', status: 'time_tbd' }),
    fx({ id: 'off', status: 'cancelled', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-09' }),
  ]);
  assert.deepEqual(nextFixtureIds(list, NOW), ['next']);
  assert.equal(usesUnknownTimeFallback(list.find((entry) => entry.fixture.id === 'unknown')!.fixture), true);
  assert.equal(usesUnknownTimeFallback(list.find((entry) => entry.fixture.id === 'next')!.fixture), false);
  assert.equal(usesUnknownTimeFallback(list.find((entry) => entry.fixture.id === 'off')!.fixture), false);
  assert.equal(fallbackSelectionCount(list, ['unknown', 'next', 'off']), 1);
  assert.deepEqual(revalidateSelectedIds(['unknown', 'next', 'off', 'gone'], list), ['unknown', 'next']);
});

test('Promene drže pomeraj potvrđenog meča, nepotvrđen sat i otkazivanje', () => {
  const list = entries([
    fx({
      id: 'shifted',
      startsAtUtc: '2026-10-04T17:00:00Z',
      scheduledLocalDate: '2026-10-04',
      previousStartsAtUtc: '2026-10-02T17:00:00Z',
      previousScheduledLocalDate: '2026-10-02',
    }),
    fx({
      id: 'date-only',
      previousScheduledLocalDate: '2026-10-01',
    }),
    fx({
      id: 'same-clock',
      previousStartsAtUtc: '2026-10-02T17:00:00Z',
      previousScheduledLocalDate: '2026-10-02',
    }),
    fx({ id: 'tbd', status: 'time_tbd', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-05' }),
    fx({ id: 'off', status: 'cancelled', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-06' }),
    fx({
      id: 'old-shift',
      status: 'finished',
      startsAtUtc: '2026-09-01T17:00:00Z',
      scheduledLocalDate: '2026-09-01',
      previousStartsAtUtc: '2026-08-20T17:00:00Z',
      previousScheduledLocalDate: '2026-08-20',
    }),
    fx({ id: 'plain', startsAtUtc: '2026-10-08T17:00:00Z', scheduledLocalDate: '2026-10-08' }),
  ]);
  const changes = matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, view: 'changes' }, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.deepEqual(changes.sort(), ['shifted', 'date-only', 'tbd', 'off'].sort());
  const upcoming = matchesForQuery(list, DEFAULT_AGENDA_QUERY, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.equal(upcoming.includes('shifted'), true);
  assert.equal(upcoming.includes('old-shift'), false);
  const archive = matchesForQuery(list, { ...DEFAULT_AGENDA_QUERY, view: 'archive' }, NOW, ZONE).map((entry) => entry.fixture.id);
  assert.deepEqual(archive, ['old-shift']);
});

test('Sledeća preskače odloženo i uživo i uzima razrešen termin', () => {
  const list = entries([
    fx({
      id: 'postponed-soon',
      status: 'postponed',
      startsAtUtc: '2026-10-01T12:00:00Z',
      scheduledLocalDate: '2026-10-01',
      timeConfirmed: true,
    }),
    fx({
      id: 'live-soon',
      status: 'live',
      startsAtUtc: '2026-10-01T11:00:00Z',
      scheduledLocalDate: '2026-10-01',
      timeConfirmed: true,
    }),
    fx({
      id: 'resolved',
      status: 'time_tbd',
      startsAtUtc: '2026-10-01T15:00:00Z',
      scheduledLocalDate: '2026-10-01',
      timeConfirmed: true,
    }),
    fx({ id: 'later', startsAtUtc: '2026-10-03T17:00:00Z' }),
  ]);
  assert.deepEqual(nextFixtureIds(list, NOW), ['resolved']);
});

test('isti dan drži potvrđen i nepoznat sat, a strane prate taj redosled', () => {
  const fixtures = [
    fx({ id: 'oct2', startsAtUtc: '2026-10-02T15:00:00Z', scheduledLocalDate: '2026-10-02' }),
    fx({ id: 'oct1-late', startsAtUtc: '2026-10-01T20:00:00Z', scheduledLocalDate: '2026-10-01' }),
    fx({ id: 'oct1-open', status: 'time_tbd', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: '2026-10-01' }),
    fx({ id: 'oct1-early', startsAtUtc: '2026-10-01T12:00:00Z', scheduledLocalDate: '2026-10-01' }),
    fx({ id: 'undated', status: 'time_tbd', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: null }),
  ];
  for (let index = 0; index < 20; index += 1) {
    const day = String(index + 3).padStart(2, '0');
    fixtures.push(fx({
      id: `d${day}`,
      startsAtUtc: `2026-10-${day}T15:00:00Z`,
      scheduledLocalDate: `2026-10-${day}`,
    }));
  }
  const visible = matchesForQuery(entries(fixtures), DEFAULT_AGENDA_QUERY, NOW, ZONE);
  const ids = visible.map((entry) => entry.fixture.id);
  assert.deepEqual(ids.slice(0, 4), ['oct1-early', 'oct1-late', 'oct1-open', 'oct2']);
  assert.equal(ids.at(-1), 'undated');
  const days = groupPageByDay(visible, ZONE, '2026-09-30');
  const keys = days.map((day) => day.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(
    days.find((day) => day.key === '2026-10-01')?.entries.map((entry) => entry.fixture.id),
    ['oct1-early', 'oct1-late', 'oct1-open'],
  );
  const page = paginateItems(visible, 1);
  const rest = paginateItems(visible, 2);
  assert.equal(page.items.length, AGENDA_PAGE_SIZE);
  assert.equal(page.items.length + rest.items.length, ids.length);
  assert.deepEqual([...page.items, ...rest.items].map((entry) => entry.fixture.id), ids);
  const firstPage = page.items.map((entry) => entry.fixture.id);
  assert.ok(firstPage.indexOf('oct1-open') < firstPage.indexOf('oct2'));
});

test('grupisanje po danu i broj aktivnih filtera', () => {
  const list = entries([
    fx({ id: 'a', startsAtUtc: '2026-09-30T18:00:00Z', scheduledLocalDate: '2026-09-30' }),
    fx({ id: 'b', startsAtUtc: '2026-09-30T20:00:00Z', scheduledLocalDate: '2026-09-30' }),
    fx({ id: 'c', timeConfirmed: false, startsAtUtc: null, scheduledLocalDate: null, status: 'time_tbd' }),
  ]);
  const visible = matchesForQuery(list, DEFAULT_AGENDA_QUERY, NOW, ZONE);
  const days = groupPageByDay(visible, ZONE, '2026-09-30');
  assert.equal(days[0]?.label, 'Danas');
  assert.equal(days[0]?.entries.length, 2);
  assert.equal(days.at(-1)?.label, 'Bez potvrđenog datuma');
  assert.equal(activeAgendaFilterCount(DEFAULT_AGENDA_QUERY), 0);
  assert.equal(activeAgendaFilterCount({ ...DEFAULT_AGENDA_QUERY, sport: 'football', view: 'archive' }), 2);
});
