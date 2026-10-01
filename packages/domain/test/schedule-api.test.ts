import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FIND_FIXTURES_HTTP_PATH,
  INITIAL_SEASON_ID,
  findFixturesHttpStatus,
  readFindFixturesHttpRequest,
} from '../src/index.ts';
import type { FindFixturesHttpSuccess } from '../src/index.ts';

test('putanja i početna sezona su fiksne', () => {
  assert.equal(FIND_FIXTURES_HTTP_PATH, '/api/find-fixtures');
  assert.equal(INITIAL_SEASON_ID, '2026-2027');
});

test('zahtev prihvata samo sport, tim, sezonu i refresh', () => {
  const accepted = readFindFixturesHttpRequest({
    sport: 'basketball',
    teamId: 'basketball:rs:crvena-zvezda',
    seasonId: '2026-2027',
    refresh: false,
  });
  assert.equal(accepted.ok, true);

  const clock = readFindFixturesHttpRequest({
    sport: 'football',
    teamId: 'football:rs:partizan',
    seasonId: '2026-2027',
    refresh: true,
    now: '2026-10-01T12:00:00Z',
  });
  assert.equal(clock.ok, false);
  if (!clock.ok) assert.equal(clock.error.code, 'invalid_body');

  const team = readFindFixturesHttpRequest({
    sport: 'football',
    teamId: 'football:rs:vojvodina',
    seasonId: '2026-2027',
    refresh: false,
  });
  assert.equal(team.ok, false);
  if (!team.ok) {
    assert.equal(team.error.code, 'invalid_team');
    assert.equal(findFixturesHttpStatus(team.error.code), 400);
  }

  const season = readFindFixturesHttpRequest({
    sport: 'football',
    teamId: 'football:rs:partizan',
    seasonId: '2025-2026',
    refresh: false,
  });
  assert.equal(season.ok, false);
  if (!season.ok) assert.equal(season.error.code, 'invalid_season');
});

test('uspešan odgovor ima dogovorena polja, a checkedAt sme da bude null', () => {
  const sample: FindFixturesHttpSuccess = {
    kind: 'source-blocked',
    result: {
      teamId: 'football:rs:partizan',
      sport: 'football',
      seasonId: '2026-2027',
      cacheStatus: 'fetched',
      upstreamRequests: 0,
      checkedAt: null,
      lastAttemptAt: '2026-10-01T12:00:00Z',
      lastSuccessAt: null,
      claimsNoMatches: false,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [],
    },
    teams: [],
    competitions: [],
    manifests: [],
    changes: [],
  };
  assert.deepEqual(Object.keys(sample).sort(), [
    'changes',
    'competitions',
    'kind',
    'manifests',
    'result',
    'teams',
  ]);
  assert.equal(sample.result.checkedAt, null);
  assert.equal(findFixturesHttpStatus('unauthorized'), 401);
  assert.equal(findFixturesHttpStatus('forbidden_origin'), 403);
  assert.equal(findFixturesHttpStatus('quota_global'), 429);
});
