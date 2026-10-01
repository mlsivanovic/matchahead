import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { selectableTeams } from '../../../packages/domain/src/index.ts';
import type { CompetitionFeed, ObservedFixtureDraft, Team } from '../../../packages/domain/src/index.ts';
import { TokenRejected } from '../src/auth.ts';
import type { Clock } from '../src/clock.ts';
import { createScheduleServer, listen } from '../src/http.ts';
import { DEFAULT_QUOTA_LIMITS, QuotaBook, type QuotaLimits } from '../src/quota.ts';
import { assertScheduleMode, type ScheduleDeps } from '../src/service.ts';
import { SOURCE_DOCUMENTS } from '../src/catalog.ts';
import { FileScheduleStore } from '../src/store.ts';
import type { FeedLoad, FeedSource } from '../src/sources/types.ts';
import type { FindFixturesHttpSuccess } from '../../../packages/domain/src/index.ts';

const ORIGIN = 'https://mlsivanovic.github.io';
const TEAM = 'football:rs:partizan';

test('sintetički režim ne sme u produkcioni NODE_ENV', () => {
  assert.equal(assertScheduleMode('production', 'production'), 'production');
  assert.throws(() => assertScheduleMode('synthetic', 'production'), /synthetic/);
});

test('katalog ne zove Euroleague Game Center', () => {
  const urls = [...SOURCE_DOCUMENTS.football, ...SOURCE_DOCUMENTS.basketball].map((item) => item.url);
  assert.equal(urls.some((url) => url.includes('api-live.euroleague.net')), false);
  assert.equal(urls.filter((url) => url.includes('ftpserver.euroleague.net')).length, 1);
});

test('HTTP: trajnost, prazan diff, pomeranje, otkaz, kvarovi, kvote, CORS i prijava', async () => {
  const app = await startApp();
  try {
    const created = await app.post();
    assert.equal(created.status, 200);
    const createdBody = created.body as FindFixturesHttpSuccess;
    assert.equal(createdBody.kind, 'synthetic-demo');
    assert.equal(createdBody.changes.length, 1);
    assert.equal(createdBody.changes[0]?.kind, 'new');
    const fixtureId = createdBody.result.futureFixtures[0]?.id;
    assert.ok(fixtureId);
    const revision = createdBody.result.futureFixtures[0]?.revision;
    assert.equal(app.network, 1);

    app.clock.set('2027-01-15T12:01:00.000Z');
    const cached = await app.post();
    const cachedBody = cached.body as FindFixturesHttpSuccess;
    assert.equal(cachedBody.result.cacheStatus, 'reused');
    assert.equal(cachedBody.result.upstreamRequests, 0);
    assert.equal(app.network, 1);
    assert.equal(cachedBody.changes.length, 0);

    const other = new FileScheduleStore(app.directory);
    const persisted = other.get(`${TEAM}:2026-2027`);
    assert.equal(persisted?.fixtures[0]?.id, fixtureId);
    assert.equal(persisted?.fixtures[0]?.revision, revision);

    app.clock.set('2027-01-15T12:16:00.000Z');
    const same = await app.post({ refresh: true });
    const sameBody = same.body as FindFixturesHttpSuccess;
    assert.equal(sameBody.result.futureFixtures[0]?.revision, revision);
    assert.equal(sameBody.changes.length, 0);
    assert.equal(app.network, 2);

    app.mutate((draft) => {
      draft.startsAtUtc = '2027-03-03T18:00:00Z';
      draft.scheduledLocalDate = '2027-03-03';
      draft.printedLocalTime = '19:00';
    });
    app.clock.set('2027-01-15T12:32:00.000Z');
    const moved = await app.post({ refresh: true });
    const movedBody = moved.body as FindFixturesHttpSuccess;
    assert.equal(movedBody.result.futureFixtures[0]?.id, fixtureId);
    assert.equal(movedBody.result.futureFixtures[0]?.revision, (revision ?? 0) + 1);
    assert.equal(movedBody.changes[0]?.kind, 'rescheduled');

    app.mutate((draft) => {
      draft.venue = 'nova sala';
    });
    app.clock.set('2027-01-15T12:48:00.000Z');
    const venue = await app.post({ refresh: true });
    const venueBody = venue.body as FindFixturesHttpSuccess;
    assert.equal(venueBody.changes.length, 0);
    assert.equal(venueBody.result.futureFixtures[0]?.revision, (revision ?? 0) + 2);

    app.mutate((draft) => {
      draft.status = 'cancelled';
    });
    app.clock.set('2027-01-15T13:04:00.000Z');
    const cancelled = await app.post({ refresh: true });
    const cancelledBody = cancelled.body as FindFixturesHttpSuccess;
    assert.equal(
      new FileScheduleStore(app.directory).get(`${TEAM}:2026-2027`)?.fixtures.find((fixture) => fixture.id === fixtureId)?.status,
      'cancelled',
    );
    assert.equal(cancelledBody.changes.some((change) => change.kind === 'cancelled' && change.fixtureId === fixtureId), true);

    app.restorePrimary();
    app.clock.set('2027-01-15T13:20:00.000Z');
    await app.post({ refresh: true });
    let cursor = Date.parse('2027-01-15T13:20:00.000Z');
    for (const failure of ['timeout', 'rate_limited', 'unexpected_empty', 'incomplete_page'] as const) {
      app.failure = failure;
      cursor += 16 * 60_000;
      app.clock.set(new Date(cursor).toISOString());
      const held = await app.post({ refresh: true });
      const heldBody = held.body as FindFixturesHttpSuccess;
      assert.equal(held.status, 200, failure);
      assert.equal(heldBody.result.futureFixtures.some((fixture) => fixture.id === fixtureId), true, failure);
      assert.equal(heldBody.changes.some((change) => change.kind === 'cancelled'), false, failure);
    }
    app.failure = 'none';
    app.pages = [secondDraft()];
    app.totalPages = 1;
    cursor += 16 * 60_000;
    app.clock.set(new Date(cursor).toISOString());
    const omitted = await app.post({ refresh: true });
    const omittedBody = omitted.body as FindFixturesHttpSuccess;
    assert.equal(omittedBody.result.futureFixtures.some((fixture) => fixture.id === fixtureId), true);
    assert.equal(omittedBody.changes.some((change) => change.kind === 'cancelled'), false);

    const leaked = await app.postRaw('/api/find-fixtures?access_token=SUPER-SECRET-URL', {
      authorization: 'Bearer good',
    });
    assert.equal(leaked.status, 401);
    assert.equal(JSON.stringify(leaked.body).includes('SUPER-SECRET-URL'), false);
    assert.equal(JSON.stringify(app.logs).includes('SUPER-SECRET-URL'), false);

    const forbidden = await app.postRaw('/api/find-fixtures', { origin: 'https://evil.example' });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
    const allowed = await app.post();
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');

    const preflight = await fetch(app.url, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);

    const anonymous = await app.postRaw('/api/find-fixtures', { authorization: '' });
    assert.equal(anonymous.status, 401);
    const wrong = await app.postRaw('/nope');
    assert.equal(wrong.status, 404);
    const extra = await app.post({ now: '1999-01-01T00:00:00Z' });
    assert.equal(extra.status, 400);
    assert.equal((extra.body as { error: { code: string } }).error.code, 'invalid_body');
  } finally {
    await app.close();
  }
});

test('HTTP indeks beleži odlaganje i zadržava id', async () => {
  const app = await startApp();
  try {
    const created = await app.post();
    const createdBody = created.body as FindFixturesHttpSuccess;
    const fixtureId = createdBody.result.futureFixtures[0]?.id;
    app.mutate((draft) => {
      draft.status = 'postponed';
    });
    app.clock.set('2027-01-15T12:16:00.000Z');
    const postponed = await app.post({ refresh: true });
    const body = postponed.body as FindFixturesHttpSuccess;
    assert.equal(body.changes[0]?.kind, 'postponed');
    assert.equal(body.changes[0]?.fixtureId, fixtureId);
    assert.equal(body.result.futureFixtures[0]?.id, fixtureId);
    assert.equal(body.result.futureFixtures[0]?.status, 'postponed');
  } finally {
    await app.close();
  }
});

test('opoziv unutar minuta briše i tuđi snimak, a produkcija ne objavljuje telo', async () => {
  const app = await startApp();
  try {
    await app.post();
    app.feedsForZvezda = true;
    app.clock.set('2027-01-15T12:00:30.000Z');
    const zvezda = await app.post({
      sport: 'football',
      teamId: 'football:rs:crvena-zvezda',
      seasonId: '2026-2027',
      refresh: false,
    });
    assert.equal(zvezda.status, 200);
    assert.ok((zvezda.body as FindFixturesHttpSuccess).result.futureFixtures.length > 0);

    app.publication = 'forbidden';
    app.clock.set('2027-01-15T12:01:00.000Z');
    const hidden = await app.post({ refresh: true });
    const hiddenBody = hidden.body as FindFixturesHttpSuccess;
    assert.equal(hiddenBody.result.futureFixtures.length, 0);
    assert.equal(hiddenBody.result.checkedAt, null);
    assert.equal(hiddenBody.changes.length, 0);
    assert.equal(app.network, 2);
    const other = new FileScheduleStore(app.directory).get('football:rs:crvena-zvezda:2026-2027');
    assert.equal(other?.fixtures.length, 0);
    assert.equal(other?.lastSuccessAt, null);
    assert.equal(new FileScheduleStore(app.directory).get('__matchahead_canonical__')?.fixtures.length, 0);
  } finally {
    await app.close();
  }

  const blocked = await startApp({ mode: 'production' });
  try {
    blocked.publication = 'allowed';
    const response = await blocked.post();
    const body = response.body as FindFixturesHttpSuccess;
    assert.equal(body.kind, 'source-blocked');
    assert.equal(body.result.futureFixtures.length, 0);
    assert.equal(body.result.checkedAt, null);
    assert.equal(body.changes.length, 0);
    assert.equal(new FileScheduleStore(blocked.directory).get(`${TEAM}:2026-2027`)?.fixtures.length ?? 0, 0);
  } finally {
    await blocked.close();
  }
});

test('kvote po nalogu, IP i globalno ne brišu raspored i ne zovu izvor', async () => {
  const limits: QuotaLimits = { ...DEFAULT_QUOTA_LIMITS, userRequests: 1, userFresh: 1, ipRequests: 10, ipFresh: 10, globalUpstream: 100, ipAuthFailures: 30 };
  const app = await startApp({ limits });
  try {
    assert.equal((await app.post()).status, 200);
    app.clock.set('2027-01-15T12:20:00.000Z');
    const again = await app.post({ refresh: true });
    assert.equal(again.status, 429);
    assert.equal((again.body as { error: { code: string } }).error.code, 'quota_user');
    assert.equal(app.network, 1);
    assert.ok((new FileScheduleStore(app.directory).get(`${TEAM}:2026-2027`)?.fixtures.length ?? 0) > 0);
  } finally {
    await app.close();
  }

  const sharedIp = await startApp({
    limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1, userRequests: 10 },
  });
  try {
    assert.equal((await sharedIp.post()).status, 200);
    const secondUser = await sharedIp.postRaw('/api/find-fixtures', { authorization: 'Bearer good:user-2' });
    assert.equal(secondUser.status, 429);
    assert.equal((secondUser.body as { error: { code: string } }).error.code, 'quota_ip');
    assert.equal(sharedIp.network, 1);
  } finally {
    await sharedIp.close();
  }

  const global = await startApp({
    limits: { ...DEFAULT_QUOTA_LIMITS, globalUpstream: 0 },
  });
  try {
    const denied = await global.post();
    assert.equal(denied.status, 429);
    assert.equal((denied.body as { error: { code: string } }).error.code, 'quota_global');
    assert.equal(global.network, 0);
  } finally {
    await global.close();
  }

  const auth = await startApp({
    limits: { ...DEFAULT_QUOTA_LIMITS, ipAuthFailures: 1 },
  });
  try {
    const first = await auth.postRaw('/api/find-fixtures', { authorization: 'Bearer nope' });
    assert.equal(first.status, 401);
    const verifyBefore = auth.verifications;
    const second = await auth.postRaw('/api/find-fixtures', { authorization: 'Bearer good' });
    assert.equal(second.status, 429);
    assert.equal(auth.verifications, verifyBefore);
    const file = readFileSync(join(auth.directory, 'quota.json'), 'utf8');
    assert.equal(file.includes('127.0.0.1'), false);
    assert.equal(file.includes('user-1'), false);
  } finally {
    await auth.close();
  }
});

test('X-Forwarded-For se ignoriše dok TRUST_PROXY nije uključen', async () => {
  const app = await startApp({
    limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1 },
    trustProxy: false,
  });
  try {
    assert.equal((await app.post()).status, 200);
    const forwarded = await app.postRaw('/api/find-fixtures', { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(forwarded.status, 429);
  } finally {
    await app.close();
  }
  const trusted = await startApp({
    limits: { ...DEFAULT_QUOTA_LIMITS, ipRequests: 1 },
    trustProxy: true,
  });
  try {
    const first = await trusted.postRaw('/api/find-fixtures', { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(first.status, 200);
    const second = await trusted.postRaw('/api/find-fixtures', { 'x-forwarded-for': '203.0.113.10' });
    assert.equal(second.status, 200);
  } finally {
    await trusted.close();
  }
});

interface App {
  url: string;
  directory: string;
  network: number;
  verifications: number;
  logs: unknown[];
  publication: 'allowed' | 'forbidden' | 'unknown';
  failure: CompetitionFeed['failure'];
  pages: ObservedFixtureDraft[];
  totalPages: number;
  feedsForZvezda: boolean;
  clock: { set(value: string): void };
  post(body?: Record<string, unknown>): Promise<Reply>;
  postRaw(path: string, headers?: Record<string, string>): Promise<Reply>;
  mutate(change: (draft: ObservedFixtureDraft) => void): void;
  restorePrimary(): void;
  primary(): ObservedFixtureDraft;
  close(): Promise<void>;
}

interface Reply {
  status: number;
  headers: Headers;
  body: unknown;
}

async function startApp(options: { limits?: QuotaLimits; mode?: 'synthetic' | 'production'; trustProxy?: boolean } = {}): Promise<App> {
  const directory = mkdtempSync(join(tmpdir(), 'ma-sched-'));
  let nowIso = '2027-01-15T12:00:00.000Z';
  const clock: Clock & { set(value: string): void } = {
    now: () => new Date(nowIso),
    set(value: string) {
      nowIso = value;
    },
  };
  const logs: unknown[] = [];
  let network = 0;
  let verifications = 0;
  const state = {
    publication: 'allowed' as 'allowed' | 'forbidden' | 'unknown',
    failure: 'none' as CompetitionFeed['failure'],
    totalPages: 1,
    feedsForZvezda: false,
    drafts: [primaryDraft()],
  };
  const source: FeedSource = {
    async load(input): Promise<FeedLoad> {
      if (input.network) network += 1;
      const teamDrafts = state.drafts.filter((draft) => draft.homeTeamId === input.team.id || draft.awayTeamId === input.team.id);
      const pages = state.failure === 'none' && state.totalPages === 1 ? [{ page: 1, fixtures: input.network || !input.network ? teamDrafts : teamDrafts }] : state.failure === 'incomplete_page' ? [{ page: 1, fixtures: teamDrafts }] : [];
      const feed: CompetitionFeed = {
        competitionId: 'football:domestic:synthetic-league',
        seasonId: '2026-2027',
        provider: 'synthetic',
        providerCompetitionId: null,
        publication: state.publication,
        organizerMarkedUnpublished: false,
        teamNotInCompetition: false,
        failure: state.failure,
        totalPages: state.failure === 'incomplete_page' ? 2 : state.totalPages,
        pages,
        evidence: 'sintetički izvor testa',
        sourceUrl: 'synthetic://schedule',
        checkedAt: '2027-01-15',
      };
      return {
        feeds: [feed],
        teams: [selectable(input.team.id)],
        competitions: [
          {
            id: feed.competitionId,
            sport: 'football',
            name: 'Sintetička liga',
            scope: 'domestic',
            country: 'RS',
            aliases: [],
            providerIds: {},
          },
        ],
        upstreamPlan: 1,
        technicalSuccess: state.failure === 'none' ? [`synthetic:${feed.competitionId}`] : [],
      };
    },
  };
  const deps: ScheduleDeps = {
    clock,
    verifier: {
      async verify(token: string) {
        verifications += 1;
        if (!token.startsWith('good')) throw new TokenRejected();
        return { uid: token.includes(':') ? token.split(':')[1] ?? 'user-1' : 'user-1' };
      },
    },
    store: new FileScheduleStore(directory),
    quota: new QuotaBook(directory, options.limits ?? DEFAULT_QUOTA_LIMITS),
    source,
    origins: [ORIGIN],
    mode: options.mode ?? 'synthetic',
    trustProxy: options.trustProxy ?? false,
    logger: (event) => logs.push(event),
    idMappings: [{ fromProvider: 'synthetic', fromId: 'raw-1', toProvider: 'synthetic', toId: 'stable-1' }],
  };
  const server = createScheduleServer(deps);
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/api/find-fixtures`;
  async function postRaw(path: string, headers: Record<string, string> = {}, body: Record<string, unknown> = {}): Promise<Reply> {
    const requestHeaders = new Headers({
      authorization: 'Bearer good',
      'content-type': 'application/json',
      origin: ORIGIN,
      ...headers,
    });
    if (headers.authorization === '') requestHeaders.delete('authorization');
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        sport: 'football',
        teamId: TEAM,
        seasonId: '2026-2027',
        refresh: false,
        ...body,
      }),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text ? JSON.parse(text) as unknown : null,
    };
  }
  const app: App = {
    url,
    directory,
    get network() {
      return network;
    },
    get verifications() {
      return verifications;
    },
    logs,
    get publication() {
      return state.publication;
    },
    set publication(value) {
      state.publication = value;
    },
    get failure() {
      return state.failure;
    },
    set failure(value) {
      state.failure = value;
    },
    get pages() {
      return state.drafts;
    },
    set pages(value) {
      state.drafts = value;
    },
    get totalPages() {
      return state.totalPages;
    },
    set totalPages(value) {
      state.totalPages = value;
    },
    get feedsForZvezda() {
      return state.feedsForZvezda;
    },
    set feedsForZvezda(value) {
      state.feedsForZvezda = value;
      if (value) state.drafts = [primaryDraft(), zvezdaOnlyDraft()];
    },
    clock,
    post(body = {}) {
      return postRaw('/api/find-fixtures', {}, body);
    },
    postRaw,
    mutate(change) {
      const draft = state.drafts[0];
      if (!draft) throw new Error('nema nacrta');
      change(draft);
    },
    restorePrimary() {
      state.failure = 'none';
      state.totalPages = 1;
      state.publication = 'allowed';
      state.drafts = [primaryDraft()];
    },
    primary: primaryDraft,
    close: () => closeServer(server),
  };
  return app;
}

function selectable(id: string): Team {
  const team = [...selectableTeams('football'), ...selectableTeams('basketball')].find((item) => item.id === id);
  if (!team) throw new Error(id);
  return team;
}

function primaryDraft(): ObservedFixtureDraft {
  return {
    sport: 'football',
    competitionId: 'football:domestic:synthetic-league',
    seasonId: '2026-2027',
    homeTeamId: TEAM,
    awayTeamId: 'football:xx:gost',
    scheduledLocalDate: '2027-03-02',
    printedLocalTime: '17:00',
    startsAtUtc: '2027-03-02T16:00:00Z',
    sourceTimeZone: 'Europe/Belgrade',
    sourceClaimsTimeConfirmed: true,
    status: 'scheduled',
    venue: 'stara sala',
    round: '1',
    sourceUrl: 'synthetic://schedule',
    provider: 'synthetic',
    providerFixtureId: 'raw-1',
    fetchedAt: '2027-01-15T12:00:00Z',
    sourceUpdatedAt: null,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
  };
}

function secondDraft(): ObservedFixtureDraft {
  return {
    ...primaryDraft(),
    providerFixtureId: 'raw-2',
    awayTeamId: 'football:xx:drugi-gost',
    startsAtUtc: '2027-03-04T16:00:00Z',
    scheduledLocalDate: '2027-03-04',
  };
}

function zvezdaOnlyDraft(): ObservedFixtureDraft {
  return {
    ...primaryDraft(),
    providerFixtureId: 'raw-zvezda',
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:xx:drugi-gost',
    startsAtUtc: '2027-03-05T16:00:00Z',
    scheduledLocalDate: '2027-03-05',
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
