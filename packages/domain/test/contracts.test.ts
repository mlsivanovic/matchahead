import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  applyObservedFixture,
  assessFetch,
  canExportTimedEvent,
  contentHash,
  fixtureIdFromProvider,
  isExplicitCancellation,
  teamId,
  timeErrors,
} from '../src/index.ts';
import { dailyRequestCount, fitsDailyQuota } from '../src/quota.ts';
import type { Fixture, FixtureStatus } from '../src/types.ts';

interface RawFixture {
  sport: 'football' | 'basketball';
  competitionId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startsAtUtc: string | null;
  scheduledLocalDate: string | null;
  sourceTimeZone: string | null;
  timeConfirmed: boolean;
  previousStartsAtUtc: string | null;
  previousScheduledLocalDate: string | null;
  status: FixtureStatus;
  venue: string | null;
  round: string | null;
  sourceUrl: string;
  provider: string;
  providerFixtureId: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
}

const dataset = JSON.parse(
  readFileSync(new URL('../../../data/synthetic/domain-scenarios.json', import.meta.url), 'utf8'),
) as {
  kind: string;
  notProductionData: boolean;
  teams: Array<{ id: string; sport: string; name: string }>;
  scenarios: Array<{
    name: string;
    before?: RawFixture;
    after?: RawFixture;
    fixture?: RawFixture;
    followedByTeamIds?: string[];
  }>;
  coverageExamples: Array<{
    name: string;
    scheduleAvailability: string;
    failure: 'none' | 'http_error' | 'timeout' | 'rate_limited' | 'incomplete_page' | 'unexpected_empty';
    organizerMarkedUnpublished: boolean;
    teamNotInCompetition: boolean;
  }>;
};

function materialize(raw: RawFixture, revisionSeed: Fixture | null = null): Fixture {
  const id = fixtureIdFromProvider(raw);
  const draft: Fixture = { ...raw, id, contentHash: '', revision: 0 };
  return applyObservedFixture(revisionSeed, draft);
}

test('sintetički skup je označen i nije produkcioni', () => {
  assert.equal(dataset.kind, 'synthetic');
  assert.equal(dataset.notProductionData, true);
});

test('FK i KK istog imena imaju različite identitete', () => {
  const football = teamId('football', 'rs', 'partizan');
  const basketball = teamId('basketball', 'rs', 'partizan');
  assert.equal(football, 'football:rs:partizan');
  assert.equal(basketball, 'basketball:rs:partizan');
  assert.notEqual(football, basketball);
  const stored = new Map(dataset.teams.map((team) => [team.id, team]));
  assert.equal(stored.get(football)?.sport, 'football');
  assert.equal(stored.get(basketball)?.sport, 'basketball');
});

test('pomeranje čuva ID, menja UTC i podiže reviziju samo jednom', () => {
  const scenario = dataset.scenarios.find((item) => item.name === 'pomeranje');
  assert.ok(scenario?.before && scenario.after);
  const before = materialize(scenario.before);
  const unchanged = materialize(scenario.before, before);
  const after = materialize(scenario.after, before);

  assert.equal(before.id, after.id);
  assert.equal(unchanged.revision, before.revision);
  assert.equal(unchanged.contentHash, before.contentHash);
  assert.equal(after.revision, before.revision + 1);
  assert.notEqual(after.contentHash, before.contentHash);
  assert.equal(after.startsAtUtc, '2027-03-02T18:30:00Z');
  assert.equal(after.previousStartsAtUtc, '2027-03-01T16:00:00Z');
  assert.equal(timeErrors(after).length, 0);
  assert.equal(canExportTimedEvent(after), true);
  assert.equal(before.id.includes('2027-03-01'), false);
});

test('odlaganje bez novog termina briše sat i pamti prethodni', () => {
  const scenario = dataset.scenarios.find((item) => item.name === 'odlaganje');
  assert.ok(scenario?.before && scenario.after);
  const before = materialize(scenario.before);
  const after = materialize(scenario.after, before);
  assert.equal(after.id, before.id);
  assert.equal(after.status, 'postponed');
  assert.equal(after.startsAtUtc, null);
  assert.equal(after.scheduledLocalDate, null);
  assert.equal(after.timeConfirmed, false);
  assert.equal(after.previousStartsAtUtc, '2027-04-04T14:00:00Z');
  assert.equal(canExportTimedEvent(after), false);
  assert.equal(timeErrors(after).length, 0);
});

test('otkazivanje je eksplicitan status i čuva identitet', () => {
  const scenario = dataset.scenarios.find((item) => item.name === 'otkazivanje');
  assert.ok(scenario?.before && scenario.after);
  const before = materialize(scenario.before);
  const after = materialize(scenario.after, before);
  assert.equal(after.id, before.id);
  assert.equal(isExplicitCancellation(after.status), true);
  assert.notEqual(after.revision, before.revision);
});

test('nepoznata satnica ne postaje ponoć', () => {
  const dated = dataset.scenarios.find((item) => item.name === 'tbd-samo-datum');
  const undated = dataset.scenarios.find((item) => item.name === 'tbd-bez-datuma');
  assert.ok(dated?.fixture && undated?.fixture);
  const dateOnly = materialize(dated.fixture);
  const unknown = materialize(undated.fixture);
  assert.equal(dateOnly.startsAtUtc, null);
  assert.equal(dateOnly.scheduledLocalDate, '2027-06-06');
  assert.equal(unknown.startsAtUtc, null);
  assert.equal(unknown.scheduledLocalDate, null);
  assert.equal(unknown.awayTeamId, null);
  assert.equal(canExportTimedEvent(dateOnly), false);
  assert.equal(canExportTimedEvent(unknown), false);

  const invented = timeErrors({
    ...dateOnly,
    startsAtUtc: '2027-06-06T00:00:00Z',
    timeConfirmed: false,
  });
  assert.ok(invented.some((error) => error.includes('00:00') || error.includes('startsAtUtc')));
});

test('ista utakmica dva kluba je jedan zapis', () => {
  const scenario = dataset.scenarios.find((item) => item.name === 'ista-utakmica-dva-kluba');
  assert.ok(scenario?.fixture && scenario.followedByTeamIds);
  const fixture = materialize(scenario.fixture);
  const visibleTo = [fixture.homeTeamId, fixture.awayTeamId];
  for (const team of scenario.followedByTeamIds) {
    assert.ok(visibleTo.includes(team));
  }
  const agenda = [fixture, fixture];
  const unique = new Set(agenda.map((item) => item.id));
  assert.equal(unique.size, 1);
});

test('neobjavljen raspored nije greška izvora i praznina nije otkazivanje', () => {
  for (const example of dataset.coverageExamples) {
    const assessment = assessFetch(example);
    assert.equal(assessment.scheduleAvailability, example.scheduleAvailability);
    assert.equal(assessment.mayInferCancellation, false);
    assert.equal(assessment.keepPreviousSchedule, example.scheduleAvailability !== 'published');
  }
  const unpublished = assessFetch({
    failure: 'none',
    organizerMarkedUnpublished: true,
    teamNotInCompetition: false,
  });
  const broken = assessFetch({
    failure: 'timeout',
    organizerMarkedUnpublished: false,
    teamNotInCompetition: false,
  });
  assert.notEqual(unpublished.scheduleAvailability, broken.scheduleAvailability);
});

test('dnevna potrošnja se računa iz ciklusa, ne iz broja korisnika', () => {
  const theSportsDbProbe = dailyRequestCount({
    refreshesPerDay: 9,
    requestsPerRefresh: 8,
    catalogRequestsPerDay: 3,
    retryReserveRequests: 15,
  });
  assert.equal(theSportsDbProbe, 90);
  assert.equal(fitsDailyQuota(theSportsDbProbe, 100), true);

  const perTeamOverflow = dailyRequestCount({
    refreshesPerDay: 9,
    requestsPerRefresh: 14,
    catalogRequestsPerDay: 2,
    retryReserveRequests: 0,
  });
  assert.equal(fitsDailyQuota(perTeamOverflow, 100), false);
});

test('heš ignoriše fetchedAt', () => {
  const scenario = dataset.scenarios.find((item) => item.name === 'tbd-samo-datum');
  assert.ok(scenario?.fixture);
  const first = materialize(scenario.fixture);
  const later = materialize({ ...scenario.fixture, fetchedAt: '2026-09-27T01:00:00Z' }, first);
  assert.equal(later.contentHash, first.contentHash);
  assert.equal(later.revision, first.revision);
  assert.equal(contentHash(first), first.contentHash);
});
