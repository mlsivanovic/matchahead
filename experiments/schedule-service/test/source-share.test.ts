import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { competitionId } from '../../../packages/domain/src/index.ts';
import type { CompetitionFeed, FetchFailureKind, FindFixturesHttpSuccess, Sport } from '../../../packages/domain/src/index.ts';
import type { Clock } from '../src/clock.ts';
import { DEFAULT_QUOTA_LIMITS, QuotaBook, type QuotaLimits } from '../src/quota.ts';
import { ScheduleService, type ScheduleDeps } from '../src/service.ts';
import { observedDraft } from '../src/sources/draft.ts';
import type { FeedLoad, FeedRequest, FeedSource } from '../src/sources/types.ts';
import { pageIsShareable } from '../src/source-share.ts';
import { FileScheduleStore } from '../src/store.ts';

const ORIGIN = 'https://mlsivanovic.github.io';
const PARTIZAN = 'basketball:rs:partizan';
const ZVEZDA = 'basketball:rs:crvena-zvezda';
const COMPETITION = competitionId('basketball', 'regional', 'aba-liga');
const START = '2027-01-15T12:00:00.000Z';
const CUP = competitionId('basketball', 'domestic', 'kup');

test('prazna i nepotpuna strana nisu deljiv snimak', () => {
  const base = feed('none');
  assert.equal(pageIsShareable(base), true);
  assert.equal(pageIsShareable({ ...base, pages: [{ page: 1, fixtures: [] }] }), false);
  assert.equal(pageIsShareable({ ...base, failure: 'incomplete_page', totalPages: 2 }), false);
  assert.equal(pageIsShareable({ ...base, publication: 'unknown' }), false);
});

test('jedna ligaška strana služi oba kluba, novi proces čita istu datoteku, klubski sajt ne', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-share-'));
  const origin = harness(directory, 'league');
  const partizan = await origin.post(PARTIZAN, false, START);
  const zvezda = await origin.post(ZVEZDA, false, START);
  assert.equal(partizan.status, 200);
  assert.equal(zvezda.status, 200);
  assert.equal(origin.bodies, 1);
  assert.ok(origin.describes >= 2);
  const first = partizan.body as FindFixturesHttpSuccess;
  const second = zvezda.body as FindFixturesHttpSuccess;
  assert.equal(first.result.cacheStatus, 'fetched');
  assert.equal(second.result.cacheStatus, 'reused');
  assert.equal(second.result.upstreamRequests, 0);
  assert.equal(second.result.futureFixtures.length, 2);
  const derbyA = first.result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  const derbyB = second.result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  assert.ok(derbyA && derbyB);
  assert.equal(derbyA.id, derbyB.id);
  assert.equal(derbyA.revision, derbyB.revision);
  assert.equal(second.teams.some((item) => item.id === PARTIZAN && item.name === 'KK Partizan'), true);
  assert.equal(second.teams.some((item) => item.id === ZVEZDA && item.sport === 'basketball'), true);
  assert.equal(second.teams.some((item) => item.id === 'basketball:xx:gost' && item.city === ''), true);
  const coverage = second.result.coverage.find((row) => row.provider === 'league');
  assert.equal(coverage?.competitionId, COMPETITION);
  assert.equal(coverage?.scheduleAvailability, 'published');
  const stored = new FileScheduleStore(directory).listSources();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.scope, 'league');
  const ids = stored[0]?.good?.pages.flatMap((page) => page.fixtures.flatMap((draft) => [draft.homeTeamId, draft.awayTeamId])) ?? [];
  assert.equal(ids.includes(PARTIZAN), true);
  assert.equal(ids.includes(ZVEZDA), true);
  assert.equal(ids.includes('basketball:xx:gost'), true);

  const again = harness(directory, 'league');
  const repeated = await again.post(ZVEZDA, false, '2027-01-15T12:05:00.000Z');
  const repeatedBody = repeated.body as FindFixturesHttpSuccess;
  assert.equal(again.bodies, 0);
  assert.equal(repeatedBody.result.futureFixtures.length, 2);
  assert.equal(repeatedBody.result.cacheStatus, 'reused');
  assert.equal(repeatedBody.result.checkedAt, START);
  assert.equal(repeatedBody.result.lastSuccessAt, START);
  assert.equal(repeatedBody.result.upstreamRequests, 0);
  assert.equal(repeatedBody.result.coverage.every((row) => row.requestsPerRefresh === 0), true);
  const keptClock = new FileScheduleStore(directory).listSources();
  assert.equal(keptClock[0]?.goodAt, START);
  assert.equal(keptClock[0]?.lastAttemptAt, START);

  const clubDir = mkdtempSync(join(tmpdir(), 'ma-club-'));
  const club = harness(clubDir, 'club');
  await club.post(PARTIZAN, false, START);
  await club.post(ZVEZDA, false, START);
  assert.equal(club.bodies, 2);
  assert.equal(new FileScheduleStore(clubDir).listSources().every((page) => page.scope === 'club'), true);
});

test('osvežavanje 15 minuta i obična upotreba 6 sati dele se, pomeraj derbija je isti', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-window-'));
  const app = harness(directory, 'league');
  await app.post(PARTIZAN, false, START);
  const early = await app.post(ZVEZDA, true, '2027-01-15T12:10:00.000Z');
  assert.equal(app.bodies, 1);
  assert.equal((early.body as FindFixturesHttpSuccess).result.cacheStatus, 'throttled');
  const later = await app.post(ZVEZDA, true, '2027-01-15T12:16:00.000Z');
  assert.equal(app.bodies, 2);
  assert.equal((later.body as FindFixturesHttpSuccess).result.cacheStatus, 'fetched');
  const within = await app.post(PARTIZAN, false, '2027-01-15T17:16:00.000Z');
  assert.equal(app.bodies, 2);
  assert.equal((within.body as FindFixturesHttpSuccess).result.cacheStatus, 'reused');
  const expired = await app.post(PARTIZAN, false, '2027-01-15T18:17:00.000Z');
  assert.equal(app.bodies, 3);
  assert.equal((expired.body as FindFixturesHttpSuccess).result.futureFixtures.length, 2);

  const moveDir = mkdtempSync(join(tmpdir(), 'ma-move-'));
  const move = harness(moveDir, 'league');
  const created = await move.post(PARTIZAN, false, START);
  const before = (created.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  await move.post(ZVEZDA, false, START);
  move.rows[0] = { ...move.rows[0], scheduledLocalDate: '2027-03-04', printedLocalTime: '20:00', startsAtUtc: '2027-03-04T19:00:00Z' };
  const moved = await move.post(PARTIZAN, true, '2027-01-15T12:16:00.000Z');
  const movedBody = moved.body as FindFixturesHttpSuccess;
  const after = movedBody.result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  assert.equal(movedBody.changes[0]?.kind, 'rescheduled');
  assert.ok(after && before);
  assert.equal(after.revision, (before.revision ?? 0) + 1);
  const other = await move.post(ZVEZDA, false, '2027-01-15T12:20:00.000Z');
  const otherDerby = (other.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  assert.equal(otherDerby?.revision, after.revision);
  assert.equal(otherDerby?.scheduledLocalDate, '2027-03-04');
  const same = await move.post(PARTIZAN, true, '2027-01-15T12:40:00.000Z');
  const sameDerby = (same.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  assert.equal(sameDerby?.revision, after.revision);
  assert.equal((same.body as FindFixturesHttpSuccess).changes.length, 0);
  assert.equal(move.bodies, 3);
});

test('kvar čuva poslednju dobru stranu, opoziv briše oba kluba, kvota broji jedno preuzimanje', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-fault-'));
  const app = harness(directory, 'league');
  await app.post(PARTIZAN, false, START);
  await app.post(ZVEZDA, false, START);
  app.failure = 'timeout';
  const held = await app.post(PARTIZAN, true, '2027-01-15T12:20:00.000Z');
  assert.equal(app.bodies, 1);
  assert.equal((held.body as FindFixturesHttpSuccess).result.futureFixtures.length, 2);
  const other = await app.post(ZVEZDA, true, '2027-01-15T12:25:00.000Z');
  assert.equal(app.bodies, 1);
  assert.equal((other.body as FindFixturesHttpSuccess).result.cacheStatus, 'throttled');
  assert.equal((other.body as FindFixturesHttpSuccess).result.futureFixtures.length, 2);
  assert.equal(new FileScheduleStore(directory).listSources()[0]?.good?.pages.length, 1);

  app.failure = 'none';
  app.publication = 'forbidden';
  const hidden = await app.post(PARTIZAN, true, '2027-01-15T12:40:00.000Z');
  assert.equal((hidden.body as FindFixturesHttpSuccess).result.futureFixtures.length, 0);
  assert.equal((hidden.body as FindFixturesHttpSuccess).result.checkedAt, null);
  assert.equal(new FileScheduleStore(directory).listSources().length, 0);
  const leaked = await app.post(ZVEZDA, false, '2027-01-15T12:41:00.000Z');
  assert.equal((leaked.body as FindFixturesHttpSuccess).result.futureFixtures.length, 0);
  assert.equal(app.bodies, 1);

  const quotaDir = mkdtempSync(join(tmpdir(), 'ma-quota-'));
  const quota = harness(quotaDir, 'league', { ...DEFAULT_QUOTA_LIMITS, globalUpstream: 1 });
  assert.equal((await quota.post(PARTIZAN, false, START)).status, 200);
  assert.equal((await quota.post(ZVEZDA, false, START)).status, 200);
  assert.equal(quota.bodies, 1);
  quota.rows[0] = { ...quota.rows[0], providerFixtureId: 'drugi' };
  const denied = await quota.post(PARTIZAN, true, '2027-01-15T13:00:00.000Z');
  assert.equal(denied.status, 429);
  assert.equal(quota.bodies, 1);
});

test('mešani provajderi: novo preuzimanje ne briše već sačuvanu ligu', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-mixed-'));
  const app = mixedHarness(directory);
  const first = await app.post(PARTIZAN, false, START);
  assert.equal(first.status, 200);
  assert.equal(app.bodies.league, 1);
  assert.equal(app.bodies.cup, 0);
  app.cupListed = true;
  const secondAt = '2027-01-15T12:01:00.000Z';
  const second = await app.post(ZVEZDA, false, secondAt);
  const secondBody = second.body as FindFixturesHttpSuccess;
  assert.equal(second.status, 200);
  assert.equal(app.bodies.league, 1);
  assert.equal(app.bodies.cup, 1);
  assert.equal(secondBody.result.upstreamRequests, 1);
  assert.equal(secondBody.result.cacheStatus, 'fetched');
  assert.equal(secondBody.result.futureFixtures.some((item) => item.providerFixtureId === 'derbi'), true);
  assert.equal(secondBody.result.futureFixtures.some((item) => item.providerFixtureId === 'kup-z'), true);
  assert.equal(secondBody.result.futureFixtures.some((item) => item.providerFixtureId === 'kup-p'), false);
  const leagueCoverage = secondBody.result.coverage.find((row) => row.provider === 'league');
  const cupCoverage = secondBody.result.coverage.find((row) => row.provider === 'cup');
  assert.equal(leagueCoverage?.requestsPerRefresh, 0);
  assert.equal(leagueCoverage?.scheduleAvailability, 'published');
  assert.equal(cupCoverage?.requestsPerRefresh, 1);
  assert.equal(cupCoverage?.scheduleAvailability, 'published');
  assert.equal(secondBody.competitions.some((item) => item.id === COMPETITION), true);
  assert.equal(secondBody.competitions.some((item) => item.id === CUP), true);
  const leagueManifest = secondBody.manifests.find((item) => item.provider === 'league');
  assert.equal(leagueManifest?.lastSuccessAt, START);
  assert.equal(leagueManifest?.lastAttemptAt, START);
  const pages = new FileScheduleStore(directory).listSources();
  assert.equal(pages.find((page) => page.provider === 'league')?.goodAt, START);
  assert.equal(pages.find((page) => page.provider === 'cup')?.goodAt, secondAt);
  const cupIds = pages.find((page) => page.provider === 'cup')?.good?.pages.flatMap((page) => page.fixtures.map((draft) => draft.providerFixtureId)) ?? [];
  assert.equal(cupIds.includes('kup-p'), true);
  assert.equal(cupIds.includes('kup-z'), true);
  const later = await app.post(PARTIZAN, false, '2027-01-15T12:02:00.000Z');
  const laterBody = later.body as FindFixturesHttpSuccess;
  assert.equal(app.bodies.league, 1);
  assert.equal(app.bodies.cup, 1);
  assert.equal(laterBody.result.cacheStatus, 'reused');
  assert.equal(laterBody.result.upstreamRequests, 0);
  assert.equal(laterBody.result.checkedAt, START);
  assert.equal(laterBody.result.coverage.every((row) => row.requestsPerRefresh === 0), true);
});

test('istekli dobar snimak ne zove izvor dok traje cooldown posle kvara', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-stale-fail-'));
  const app = harness(directory, 'league');
  await app.post(PARTIZAN, false, START);
  app.failure = 'timeout';
  const failed = await app.post(PARTIZAN, true, '2027-01-15T18:01:00.000Z');
  assert.equal(app.bodies, 1);
  assert.equal((failed.body as FindFixturesHttpSuccess).result.futureFixtures.length, 2);
  const afterFail = new FileScheduleStore(directory).listSources()[0];
  assert.equal(afterFail?.goodAt, START);
  assert.equal(afterFail?.lastFailure, 'timeout');
  app.failure = 'none';
  const cooled = await app.post(ZVEZDA, false, '2027-01-15T18:10:00.000Z');
  const cooledBody = cooled.body as FindFixturesHttpSuccess;
  assert.equal(app.bodies, 1);
  assert.equal(cooledBody.result.cacheStatus, 'throttled');
  assert.equal(cooledBody.result.upstreamRequests, 0);
  assert.equal(cooledBody.result.futureFixtures.length, 2);
  assert.equal(cooledBody.result.checkedAt, START);
  assert.equal(cooledBody.result.lastSuccessAt, START);
  assert.equal(new FileScheduleStore(directory).listSources()[0]?.goodAt, START);
  const released = await app.post(PARTIZAN, false, '2027-01-15T18:16:00.000Z');
  assert.equal(app.bodies, 2);
  assert.equal((released.body as FindFixturesHttpSuccess).result.cacheStatus, 'fetched');
  assert.equal(new FileScheduleStore(directory).listSources()[0]?.goodAt, '2027-01-15T18:16:00.000Z');
});

test('neispravna potpuna strana ne zamenjuje poslednji dobar snimak', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-incoherent-'));
  const app = harness(directory, 'league');
  await app.post(PARTIZAN, false, START);
  await app.post(ZVEZDA, false, START);
  app.duplicateDerby = true;
  const bad = await app.post(PARTIZAN, true, '2027-01-15T12:16:00.000Z');
  assert.equal(app.bodies, 2);
  assert.equal(
    (bad.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi')?.scheduledLocalDate,
    '2027-03-02',
  );
  const stored = new FileScheduleStore(directory).listSources()[0];
  const derbies = stored?.good?.pages.flatMap((page) => page.fixtures.filter((draft) => draft.providerFixtureId === 'derbi')) ?? [];
  assert.equal(derbies.length, 1);
  assert.equal(derbies[0]?.scheduledLocalDate, '2027-03-02');
  assert.equal(stored?.goodAt, START);
  assert.equal(stored?.lastFailure, 'unexpected_empty');
  const other = await app.post(ZVEZDA, false, '2027-01-15T12:20:00.000Z');
  assert.equal(app.bodies, 2);
  assert.equal(
    (other.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi')?.scheduledLocalDate,
    '2027-03-02',
  );
});

test('istovremeni zahtevi dele jedno preuzimanje', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ma-flight-'));
  const app = harness(directory, 'league');
  const [left, right] = await Promise.all([
    app.post(PARTIZAN, false, START),
    app.post(ZVEZDA, false, START),
  ]);
  assert.equal(left.status, 200);
  assert.equal(right.status, 200);
  assert.equal(app.bodies, 1);
  const leftDerby = (left.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  const rightDerby = (right.body as FindFixturesHttpSuccess).result.futureFixtures.find((item) => item.providerFixtureId === 'derbi');
  assert.equal(leftDerby?.revision, rightDerby?.revision);
  assert.equal(leftDerby?.id, rightDerby?.id);
});

test('klupski i neoznačeni opseg ne dele stranu između klubova', async () => {
  for (const scope of ['club', 'default'] as const) {
    const directory = mkdtempSync(join(tmpdir(), 'ma-club-flight-'));
    const app = harness(directory, scope);
    const [left, right] = await Promise.all([
      app.post(PARTIZAN, false, START),
      app.post(ZVEZDA, false, START),
    ]);
    assert.equal(left.status, 200, scope);
    assert.equal(right.status, 200, scope);
    assert.equal(app.bodies, 2, scope);
    const partizan = (left.body as FindFixturesHttpSuccess).result.futureFixtures;
    const zvezda = (right.body as FindFixturesHttpSuccess).result.futureFixtures;
    assert.equal(partizan.some((item) => item.providerFixtureId === 'gost-p'), true, scope);
    assert.equal(partizan.some((item) => item.providerFixtureId === 'gost-z'), false, scope);
    assert.equal(zvezda.some((item) => item.providerFixtureId === 'gost-z'), true, scope);
    assert.equal(zvezda.some((item) => item.providerFixtureId === 'gost-p'), false, scope);
    const pages = new FileScheduleStore(directory).listSources();
    assert.equal(pages.length, 2, scope);
    assert.equal(pages.every((page) => page.scope === 'club'), true, scope);
    assert.equal(new Set(pages.map((page) => page.ownerTeamId)).size, 2, scope);
  }
});

interface Row {
  providerFixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledLocalDate: string;
  printedLocalTime: string;
  startsAtUtc: string;
}

interface Harness {
  bodies: number;
  describes: number;
  rows: Row[];
  failure: FetchFailureKind;
  publication: 'allowed' | 'forbidden' | 'unknown';
  duplicateDerby: boolean;
  post(teamId: string, refresh: boolean, now: string): Promise<{ status: number; body: unknown }>;
}

function harness(directory: string, scope: 'league' | 'club' | 'default', limits?: QuotaLimits): Harness {
  let nowIso = START;
  const clock: Clock = { now: () => new Date(nowIso) };
  const state = {
    bodies: 0,
    describes: 0,
    failure: 'none' as FetchFailureKind,
    publication: 'allowed' as 'allowed' | 'forbidden' | 'unknown',
    duplicateDerby: false,
    rows: [
      row('derbi', PARTIZAN, ZVEZDA, '2027-03-02', '19:00', '2027-03-02T18:00:00Z'),
      row('gost-p', PARTIZAN, 'basketball:xx:gost', '2027-03-09', '18:00', '2027-03-09T17:00:00Z'),
      row('gost-z', ZVEZDA, 'basketball:xx:gost', '2027-03-10', '18:00', '2027-03-10T17:00:00Z'),
    ],
  };
  const source: FeedSource = {
    async load(input: FeedRequest): Promise<FeedLoad> {
      if (!input.network) state.describes += 1;
      const selected = !input.fetchProviders || input.fetchProviders.includes('league');
      const readBody = input.network && selected && (state.failure === 'none' || state.failure === 'incomplete_page');
      if (readBody) state.bodies += 1;
      const visible = scope === 'league' ? state.rows : state.rows.filter((item) => item.homeTeamId === input.team.id || item.awayTeamId === input.team.id);
      return loadFrom(input, visible, state.publication, state.failure, scope, readBody, state.duplicateDerby);
    },
  };
  const service = new ScheduleService({
    clock,
    verifier: { async verify() { return { uid: 'user-1' }; } },
    store: new FileScheduleStore(directory),
    quota: new QuotaBook(directory, limits ?? DEFAULT_QUOTA_LIMITS),
    source,
    origins: [ORIGIN],
    mode: 'synthetic',
    logger() {},
  } satisfies ScheduleDeps);
  return {
    get bodies() { return state.bodies; },
    get describes() { return state.describes; },
    get rows() { return state.rows; },
    set rows(value: Row[]) { state.rows = value; },
    get failure() { return state.failure; },
    set failure(value: FetchFailureKind) { state.failure = value; },
    get publication() { return state.publication; },
    set publication(value: 'allowed' | 'forbidden' | 'unknown') { state.publication = value; },
    get duplicateDerby() { return state.duplicateDerby; },
    set duplicateDerby(value: boolean) { state.duplicateDerby = value; },
    post(teamId: string, refresh: boolean, now: string) {
      nowIso = now;
      return service.handle({
        method: 'POST',
        path: '/api/find-fixtures',
        origin: ORIGIN,
        authorization: 'Bearer good',
        queryKeys: [],
        bodyText: JSON.stringify({ sport: 'basketball', teamId, seasonId: '2026-2027', refresh }),
        remoteAddress: '203.0.113.8',
      });
    },
  };
}

function loadFrom(
  input: FeedRequest,
  rows: readonly Row[],
  publication: 'allowed' | 'forbidden' | 'unknown',
  failure: FetchFailureKind,
  scope: 'league' | 'club' | 'default',
  readBody: boolean,
  duplicateDerby = false,
): FeedLoad {
  const drafts = readBody || failure === 'incomplete_page'
    ? rows.flatMap((item) => {
      const draft = observedDraft({
        sport: input.team.sport,
        competitionId: COMPETITION,
        seasonId: input.seasonId,
        homeTeamId: item.homeTeamId,
        awayTeamId: item.awayTeamId,
        scheduledLocalDate: item.scheduledLocalDate,
        printedLocalTime: item.printedLocalTime,
        startsAtUtc: item.startsAtUtc,
        sourceTimeZone: 'Europe/Belgrade',
        status: 'scheduled',
        venue: null,
        round: '1',
        sourceUrl: 'https://lab.schedule.test/fixtures',
        provider: 'league',
        providerFixtureId: item.providerFixtureId,
        fetchedAt: input.now,
      });
      if (!duplicateDerby || item.providerFixtureId !== 'derbi') return [draft];
      return [
        draft,
        observedDraft({
          sport: input.team.sport,
          competitionId: COMPETITION,
          seasonId: input.seasonId,
          homeTeamId: item.homeTeamId,
          awayTeamId: item.awayTeamId,
          scheduledLocalDate: '2027-04-01',
          printedLocalTime: '18:00',
          startsAtUtc: '2027-04-01T16:00:00Z',
          sourceTimeZone: 'Europe/Belgrade',
          status: 'scheduled',
          venue: null,
          round: '1',
          sourceUrl: 'https://lab.schedule.test/fixtures',
          provider: 'league',
          providerFixtureId: item.providerFixtureId,
          fetchedAt: input.now,
        }),
      ];
    })
    : [];
  const feed: CompetitionFeed = {
    competitionId: COMPETITION,
    seasonId: input.seasonId,
    provider: 'league',
    providerCompetitionId: null,
    publication,
    organizerMarkedUnpublished: false,
    teamNotInCompetition: false,
    failure,
    totalPages: failure === 'incomplete_page' ? 2 : 1,
    pages: failure === 'none' || failure === 'incomplete_page' ? [{ page: 1, fixtures: drafts }] : [],
    evidence: 'kontrolisana ligaška strana',
    sourceUrl: 'https://lab.schedule.test/fixtures',
    checkedAt: input.todayLocalDate,
  };
  return {
    feeds: [feed],
    teams: [input.team],
    competitions: [{
      id: COMPETITION,
      sport: input.team.sport,
      name: 'ABA liga',
      scope: 'regional',
      country: null,
      aliases: [],
      providerIds: {},
    }],
    upstreamPlan: 1,
    technicalSuccess: readBody && failure === 'none' ? [`league:${COMPETITION}`] : [],
    shares: scope === 'default' ? undefined : { league: scope },
  };
}

function mixedHarness(directory: string): {
  bodies: { league: number; cup: number };
  cupListed: boolean;
  post(teamId: string, refresh: boolean, now: string): Promise<{ status: number; body: unknown }>;
} {
  let nowIso = START;
  const clock: Clock = { now: () => new Date(nowIso) };
  const state = { league: 0, cup: 0, cupListed: false };
  const leagueRows = [
    row('derbi', PARTIZAN, ZVEZDA, '2027-03-02', '19:00', '2027-03-02T18:00:00Z'),
    row('gost-p', PARTIZAN, 'basketball:xx:gost', '2027-03-09', '18:00', '2027-03-09T17:00:00Z'),
    row('gost-z', ZVEZDA, 'basketball:xx:gost', '2027-03-10', '18:00', '2027-03-10T17:00:00Z'),
  ];
  const cupRows = [
    row('kup-p', PARTIZAN, 'basketball:xx:gost', '2027-03-18', '19:00', '2027-03-18T18:00:00Z'),
    row('kup-z', ZVEZDA, 'basketball:xx:gost', '2027-03-20', '19:00', '2027-03-20T18:00:00Z'),
  ];
  const source: FeedSource = {
    async load(input: FeedRequest): Promise<FeedLoad> {
      const providers = state.cupListed ? ['league', 'cup'] : ['league'];
      const selected = input.network ? input.fetchProviders : undefined;
      const visible = selected ? providers.filter((provider) => selected.includes(provider)) : providers;
      const feeds: CompetitionFeed[] = [];
      const technicalSuccess: string[] = [];
      for (const provider of visible) {
        const competition = provider === 'league' ? COMPETITION : CUP;
        const rows = provider === 'league' ? leagueRows : cupRows;
        const readBody = Boolean(input.network && (!input.fetchProviders || input.fetchProviders.includes(provider)));
        if (readBody) state[provider === 'league' ? 'league' : 'cup'] += 1;
        const drafts = readBody
          ? rows.map((item) => observedDraft({
            sport: input.team.sport,
            competitionId: competition,
            seasonId: input.seasonId,
            homeTeamId: item.homeTeamId,
            awayTeamId: item.awayTeamId,
            scheduledLocalDate: item.scheduledLocalDate,
            printedLocalTime: item.printedLocalTime,
            startsAtUtc: item.startsAtUtc,
            sourceTimeZone: 'Europe/Belgrade',
            status: 'scheduled',
            venue: null,
            round: '1',
            sourceUrl: 'https://lab.schedule.test/fixtures',
            provider,
            providerFixtureId: item.providerFixtureId,
            fetchedAt: input.now,
          }))
          : [];
        if (readBody) technicalSuccess.push(`${provider}:${competition}`);
        feeds.push({
          competitionId: competition,
          seasonId: input.seasonId,
          provider,
          providerCompetitionId: null,
          publication: 'allowed',
          organizerMarkedUnpublished: false,
          teamNotInCompetition: false,
          failure: 'none',
          totalPages: 1,
          pages: [{ page: 1, fixtures: drafts }],
          evidence: 'kontrolisana ligaška strana',
          sourceUrl: 'https://lab.schedule.test/fixtures',
          checkedAt: input.todayLocalDate,
        });
      }
      return {
        feeds,
        teams: [input.team],
        competitions: feeds.map((feed) => ({
          id: feed.competitionId,
          sport: input.team.sport,
          name: feed.provider === 'league' ? 'ABA liga' : 'Kup',
          scope: feed.provider === 'league' ? 'regional' as const : 'domestic' as const,
          country: feed.provider === 'league' ? null : 'RS',
          aliases: [],
          providerIds: {},
        })),
        upstreamPlan: feeds.length,
        technicalSuccess,
        shares: { league: 'league', cup: 'league' },
      };
    },
  };
  const service = new ScheduleService({
    clock,
    verifier: { async verify() { return { uid: 'user-1' }; } },
    store: new FileScheduleStore(directory),
    quota: new QuotaBook(directory, DEFAULT_QUOTA_LIMITS),
    source,
    origins: [ORIGIN],
    mode: 'synthetic',
    logger() {},
  } satisfies ScheduleDeps);
  return {
    get bodies() { return { league: state.league, cup: state.cup }; },
    get cupListed() { return state.cupListed; },
    set cupListed(value: boolean) { state.cupListed = value; },
    post(teamId: string, refresh: boolean, now: string) {
      nowIso = now;
      return service.handle({
        method: 'POST',
        path: '/api/find-fixtures',
        origin: ORIGIN,
        authorization: 'Bearer good',
        queryKeys: [],
        bodyText: JSON.stringify({ sport: 'basketball', teamId, seasonId: '2026-2027', refresh }),
        remoteAddress: '203.0.113.8',
      });
    },
  };
}

function feed(failure: FetchFailureKind): CompetitionFeed {
  const sport: Sport = 'basketball';
  return loadFrom({
    team: {
      id: PARTIZAN,
      sport,
      name: 'KK Partizan',
      shortName: 'Partizan',
      country: 'RS',
      city: 'Beograd',
      aliases: [],
      providerIds: {},
    },
    seasonId: '2026-2027',
    now: START,
    todayLocalDate: '2027-01-15',
    network: true,
  }, [row('derbi', PARTIZAN, ZVEZDA, '2027-03-02', '19:00', '2027-03-02T18:00:00Z')], 'allowed', failure, 'league', true).feeds[0] as CompetitionFeed;
}

function row(
  id: string,
  home: string,
  away: string,
  scheduledLocalDate: string,
  printedLocalTime: string,
  startsAtUtc: string,
): Row {
  return { providerFixtureId: id, homeTeamId: home, awayTeamId: away, scheduledLocalDate, printedLocalTime, startsAtUtc };
}
