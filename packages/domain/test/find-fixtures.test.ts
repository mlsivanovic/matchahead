import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  canExportTimedEvent,
  findFixtures,
  fitsDailyQuota,
  isUntrustedKickoffClock,
  maxFreshFindsPerDay,
  minSpacingSeconds,
  requestsForFreshFind,
  selectableTeams,
  isSelectableTeamId,
  upstreamRequestsForClicks,
} from '../src/index.ts';
import type {
  CompetitionFeed,
  FindCacheRecord,
  FindCacheStore,
  FindFixturesQuery,
  Team,
} from '../src/index.ts';

const dataset = JSON.parse(
  readFileSync(new URL('../../../data/synthetic/find-fixtures-scenarios.json', import.meta.url), 'utf8'),
) as {
  kind: string;
  notProductionData: boolean;
  policy: { reuseWithinMinutes: number; minRefreshMinutes: number };
  query: { seasonId: string; now: string; todayLocalDate: string };
  teams: Team[];
  footballFeeds: CompetitionFeed[];
  basketballFeeds: CompetitionFeed[];
};

function team(id: string): Team {
  const found = dataset.teams.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

function memoryCache(): FindCacheStore & { reads: number } {
  const records = new Map<string, FindCacheRecord>();
  return {
    reads: 0,
    get(key) {
      this.reads += 1;
      const found = records.get(key);
      return found ? structuredClone(found) : null;
    },
    set(key, record) {
      records.set(key, structuredClone(record));
    },
  };
}

function footballQuery(overrides: Partial<FindFixturesQuery> = {}): FindFixturesQuery {
  return {
    sport: 'football',
    teamId: 'football:rs:partizan',
    seasonId: dataset.query.seasonId,
    now: dataset.query.now,
    todayLocalDate: dataset.query.todayLocalDate,
    refresh: false,
    ...overrides,
  };
}

function feeds(): CompetitionFeed[] {
  return structuredClone(dataset.footballFeeds);
}

test('izbor je ograničen na FK i KK Crvenu zvezdu i Partizan', () => {
  assert.deepEqual(
    selectableTeams('football').map((item) => item.id),
    ['football:rs:crvena-zvezda', 'football:rs:partizan'],
  );
  assert.deepEqual(
    selectableTeams('basketball').map((item) => item.id),
    ['basketball:rs:crvena-zvezda', 'basketball:rs:partizan'],
  );
  assert.equal(isSelectableTeamId('football:rs:vojvodina'), false);
  assert.equal(isSelectableTeamId('basketball:rs:partizan', 'football'), false);
  assert.throws(
    () => findFixtures({
      team: team('football:rs:synthetic-gost'),
      query: footballQuery({ teamId: 'football:rs:synthetic-gost' }),
      feeds: [],
      cache: memoryCache(),
    }),
    /samo Crvena zvezda i Partizan/,
  );
});

test('sintetički skup pretrage je označen i nije produkcioni', () => {
  assert.equal(dataset.kind, 'synthetic');
  assert.equal(dataset.notProductionData, true);
  assert.equal(JSON.stringify(dataset).includes('thesportsdb'), false);
});

test('jedan klik spaja takmičenja, baca tuđe mečeve i duplikat istog ID-ja', () => {
  const result = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache: memoryCache(),
    policy: dataset.policy,
  });

  assert.equal(result.claimsNoMatches, false);
  assert.equal(result.cacheStatus, 'fetched');
  assert.equal(result.upstreamRequests, 7);
  assert.equal(result.futureFixtures.some((fixture) => fixture.providerFixtureId === 'syn-other'), false);
  assert.equal(result.futureFixtures.some((fixture) => fixture.providerFixtureId === 'syn-blocked'), false);
  assert.equal(result.futureFixtures.some((fixture) => fixture.providerFixtureId === 'syn-finished'), false);

  const confirmed = result.futureFixtures.filter((fixture) => fixture.providerFixtureId === 'syn-confirmed');
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]?.revision, 1);

  const ids = result.futureFixtures.map((fixture) => fixture.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    result.futureFixtures.map((fixture) => fixture.scheduledLocalDate ?? fixture.providerFixtureId),
    [
      '2027-02-02',
      '2027-03-02',
      '2027-03-02',
      '2027-03-20',
      '2027-04-01',
      '2027-04-02',
      'syn-postponed',
    ],
  );
  assert.equal(result.nextFixture?.providerFixtureId, 'syn-clock-02');
  assert.equal(result.nextConfirmedFixture?.startsAtUtc, '2027-03-02T16:00:00Z');
  assert.equal(result.nextConfirmedFixture?.timeConfirmed, true);
  assert.equal(canExportTimedEvent(result.nextFixture!), false);
  assert.equal(canExportTimedEvent(result.nextConfirmedFixture!), true);

  const byState = new Map(result.coverage.map((item) => [item.competitionId, item.scheduleAvailability]));
  assert.equal(byState.get('football:domestic:synthetic-league'), 'published');
  assert.equal(byState.get('football:european:synthetic-knockout'), 'unpublished');
  assert.equal(byState.get('football:other:synthetic-friendly'), 'source_error');
  assert.equal(byState.get('football:european:synthetic-other-cup'), 'not_participant');
  assert.equal(byState.get('football:domestic:synthetic-blocked'), 'unknown');
  assert.notEqual(
    byState.get('football:european:synthetic-knockout'),
    byState.get('football:other:synthetic-friendly'),
  );
});

test('00:00, 01:00 i 02:00 ne postaju potvrđen sat', () => {
  assert.equal(isUntrustedKickoffClock({ printedLocalTime: '00:00', startsAtUtc: null }), true);
  assert.equal(isUntrustedKickoffClock({ printedLocalTime: '01:00', startsAtUtc: null }), true);
  assert.equal(isUntrustedKickoffClock({ printedLocalTime: '02:00:00', startsAtUtc: null }), true);
  assert.equal(
    isUntrustedKickoffClock({ printedLocalTime: null, startsAtUtc: '2027-02-02T00:00:00Z' }),
    true,
  );
  assert.equal(
    isUntrustedKickoffClock({ printedLocalTime: '17:00', startsAtUtc: '2027-03-02T16:00:00Z' }),
    false,
  );

  const result = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache: memoryCache(),
    policy: dataset.policy,
  });
  for (const providerFixtureId of ['syn-clock-00', 'syn-clock-01', 'syn-clock-02']) {
    const fixture = result.futureFixtures.find((item) => item.providerFixtureId === providerFixtureId);
    assert.ok(fixture, providerFixtureId);
    assert.equal(fixture.timeConfirmed, false);
    assert.equal(fixture.startsAtUtc, null);
    assert.equal(fixture.status, 'time_tbd');
    assert.equal(canExportTimedEvent(fixture), false);
  }
});

test('FK i KK istog imena ostaju razdvojeni', () => {
  const football = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache: memoryCache(),
    policy: dataset.policy,
  });
  const basketball = findFixtures({
    team: team('basketball:rs:partizan'),
    query: {
      sport: 'basketball',
      teamId: 'basketball:rs:partizan',
      seasonId: dataset.query.seasonId,
      now: dataset.query.now,
      todayLocalDate: dataset.query.todayLocalDate,
      refresh: false,
    },
    feeds: structuredClone(dataset.basketballFeeds),
    cache: memoryCache(),
    policy: dataset.policy,
  });

  assert.notEqual(football.teamId, basketball.teamId);
  assert.equal(football.nextConfirmedFixture?.sport, 'football');
  assert.equal(basketball.nextConfirmedFixture?.sport, 'basketball');
  const footballIds = new Set(football.futureFixtures.map((fixture) => fixture.id));
  for (const fixture of basketball.futureFixtures) {
    assert.equal(footballIds.has(fixture.id), false);
  }
  assert.throws(
    () =>
      findFixtures({
        team: team('basketball:rs:partizan'),
        query: footballQuery({ teamId: 'basketball:rs:partizan' }),
        feeds: structuredClone(dataset.basketballFeeds),
        cache: memoryCache(),
        policy: dataset.policy,
      }),
    /FK i KK/,
  );
});

test('promena termina čuva ID, a nestanak iz odgovora nije otkazivanje', () => {
  const cache = memoryCache();
  const first = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache,
    policy: dataset.policy,
  });
  const original = first.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-confirmed');
  const omittedId = first.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-clock-01')?.id;
  assert.ok(original && omittedId);

  const moved = feeds();
  const league = moved[0];
  assert.ok(league);
  for (const page of league.pages) {
    page.fixtures = page.fixtures.filter((fixture) => fixture.providerFixtureId !== 'syn-clock-01');
    for (const fixture of page.fixtures) {
      if (fixture.providerFixtureId === 'syn-confirmed') {
        fixture.scheduledLocalDate = '2027-03-03';
        fixture.printedLocalTime = '19:30';
        fixture.startsAtUtc = '2027-03-03T18:30:00Z';
        fixture.fetchedAt = '2027-01-15T12:20:00Z';
      }
    }
  }

  const second = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T12:20:00Z', refresh: true }),
    feeds: moved,
    cache,
    policy: dataset.policy,
  });
  const updated = second.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-confirmed');
  assert.ok(updated);
  assert.equal(updated.id, original.id);
  assert.equal(updated.id.includes('2027-03-02'), false);
  assert.equal(updated.revision, original.revision + 1);
  assert.equal(updated.startsAtUtc, '2027-03-03T18:30:00Z');
  assert.equal(updated.previousStartsAtUtc, '2027-03-02T16:00:00Z');

  const stillThere = second.futureFixtures.find((fixture) => fixture.id === omittedId);
  assert.ok(stillThere);
  assert.notEqual(stillThere.status, 'cancelled');

  const third = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T12:40:00Z', refresh: true }),
    feeds: moved,
    cache,
    policy: dataset.policy,
  });
  const same = third.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-confirmed');
  assert.equal(same?.revision, updated.revision);
  assert.equal(same?.contentHash, updated.contentHash);
});

test('prazna ili nedostupna sezona ne znači da utakmica nema', () => {
  const cache = memoryCache();
  const first = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache,
    policy: dataset.policy,
  });
  assert.ok(first.futureFixtures.length > 0);

  const broken = feeds().map((feed) =>
    feed.competitionId === 'football:domestic:synthetic-league' && feed.provider === 'synthetic'
      ? { ...feed, failure: 'unexpected_empty' as const, pages: [] }
      : feed,
  );
  const second = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T12:20:00Z', refresh: true }),
    feeds: broken,
    cache,
    policy: dataset.policy,
  });
  assert.equal(second.claimsNoMatches, false);
  assert.ok(second.futureFixtures.some((fixture) => fixture.providerFixtureId === 'syn-confirmed'));
  const league = second.coverage.find(
    (item) => item.competitionId === 'football:domestic:synthetic-league' && item.provider === 'synthetic',
  );
  assert.equal(league?.scheduleAvailability, 'source_error');
  assert.match(league?.evidence ?? '', /nije odsustvo/);

  const leagueOnly = feeds()[0];
  assert.ok(leagueOnly);
  const incomplete = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T13:00:00Z' }),
    feeds: [{ ...leagueOnly, pages: [leagueOnly.pages[0]!] }],
    cache: memoryCache(),
    policy: dataset.policy,
  });
  assert.equal(incomplete.claimsNoMatches, false);
  assert.equal(incomplete.futureFixtures.length, 0);
  assert.equal(incomplete.coverage[0]?.scheduleAvailability, 'source_error');
});

test('keš deli korisnici, a prerano osvežavanje ne zove izvor', () => {
  const cache = memoryCache();
  const first = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache,
    policy: dataset.policy,
  });
  const again = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T13:00:00Z' }),
    feeds: [],
    cache,
    policy: dataset.policy,
  });
  assert.equal(again.cacheStatus, 'reused');
  assert.equal(again.upstreamRequests, 0);
  assert.equal(again.checkedAt, first.checkedAt);
  assert.equal(again.futureFixtures.length, first.futureFixtures.length);

  const tooSoon = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T12:10:00Z', refresh: true }),
    feeds: [],
    cache,
    policy: dataset.policy,
  });
  assert.equal(tooSoon.cacheStatus, 'throttled');
  assert.equal(tooSoon.upstreamRequests, 0);

  const later = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery({ now: '2027-01-15T12:16:00Z', refresh: true }),
    feeds: feeds(),
    cache,
    policy: dataset.policy,
  });
  assert.equal(later.cacheStatus, 'fetched');
  assert.ok(later.upstreamRequests > 0);
});

test('kvota na zahtev: keš štedi, razmak od 15 minuta ne staje u 100', () => {
  const perFind = requestsForFreshFind([2, 1, 1, 1]);
  assert.equal(perFind, 5);
  assert.equal(
    upstreamRequestsForClicks({ clicks: 100, clicksServedFromCache: 99, requestsPerFreshFind: perFind }),
    5,
  );
  assert.equal(
    upstreamRequestsForClicks({ clicks: 100, clicksServedFromCache: 0, requestsPerFreshFind: perFind }),
    500,
  );
  assert.equal(maxFreshFindsPerDay(15), 96);
  assert.equal(fitsDailyQuota(96 * perFind, 100), false);
  assert.equal(fitsDailyQuota(4 * perFind, 100), true);
  assert.equal(minSpacingSeconds(perFind, 6), 24);
  assert.equal(fitsDailyQuota(perFind, 50), true);
});

test('drugi provajder sa istim parom i datumom nije isti ID', () => {
  const result = findFixtures({
    team: team('football:rs:partizan'),
    query: footballQuery(),
    feeds: feeds(),
    cache: memoryCache(),
    policy: dataset.policy,
  });
  const primary = result.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-confirmed');
  const alternate = result.futureFixtures.find((fixture) => fixture.providerFixtureId === 'syn-alt-confirmed');
  assert.ok(primary && alternate);
  assert.notEqual(primary.id, alternate.id);
  assert.equal(primary.scheduledLocalDate, alternate.scheduledLocalDate);
});
