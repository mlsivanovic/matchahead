import assert from 'node:assert/strict';
import test from 'node:test';

import type { FindFixturesResult } from '../../../packages/domain/src/find-fixtures.ts';
import { INITIAL_SEASON_ID } from '../../../packages/domain/src/schedule-api.ts';
import {
  isRealCalendarDate,
  isStrictInstant,
  normalizeApiBaseUrl,
  parseFindResponse,
  postFindFixtures,
  ScheduleApiError,
  validateFindRequest,
} from '../src/logic/schedule-api.ts';
import { currentScheduleIdToken } from '../src/logic/schedule-auth.ts';
import { readScheduleServerConfig } from '../src/logic/schedule-config.ts';
import {
  readLastAttemptAt,
  readLastGood,
  refreshCooldown,
  writeLastAttemptAt,
  writeLastGood,
  type LastGoodSchedule,
} from '../src/logic/schedule-store.ts';
import { clearUserLocalContent, memoryStore } from '../src/logic/user-local.ts';

const TEAM = 'football:rs:crvena-zvezda';
const SEASON = INITIAL_SEASON_ID;

function result(overrides: Partial<FindFixturesResult> = {}): FindFixturesResult {
  return {
    teamId: TEAM,
    sport: 'football',
    seasonId: SEASON,
    cacheStatus: 'fetched',
    upstreamRequests: 2,
    checkedAt: '2026-10-01T08:00:00.000Z',
    lastAttemptAt: '2026-10-01T08:00:00.000Z',
    lastSuccessAt: '2026-10-01T08:00:00.000Z',
    claimsNoMatches: false,
    futureFixtures: [],
    nextFixture: null,
    nextConfirmedFixture: null,
    coverage: [],
    ...overrides,
  };
}

function fixture(overrides: Partial<import('../../../packages/domain/src/types.ts').Fixture> = {}): import('../../../packages/domain/src/types.ts').Fixture {
  return {
    id: 'football:aba:Superliga:2026-2027:aba:fx-1',
    sport: 'football',
    competitionId: 'Superliga',
    seasonId: SEASON,
    homeTeamId: TEAM,
    awayTeamId: 'football:rs:partizan',
    startsAtUtc: '2026-10-05T17:00:00.000Z',
    scheduledLocalDate: '2026-10-05',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'Stadion Rajko Mitić',
    round: '12. kolo',
    sourceUrl: 'https://example-liga.rs/raspored/superliga-26-27',
    provider: 'demo-liga',
    providerFixtureId: 'fx-1',
    fetchedAt: '2026-10-01T08:00:00.000Z',
    sourceUpdatedAt: null,
    contentHash: 'abc',
    revision: 1,
    ...overrides,
  };
}

function coverage(overrides: Partial<import('../../../packages/domain/src/types.ts').CoverageStatus> = {}): import('../../../packages/domain/src/types.ts').CoverageStatus {
  return {
    id: `${TEAM}:Kup:${SEASON}:demo-liga`,
    teamId: TEAM,
    competitionId: 'Kup',
    seasonId: SEASON,
    provider: 'demo-liga',
    providerCompetitionId: null,
    verdict: 'confirmed',
    scheduleAvailability: 'unpublished',
    freeAccessConfirmed: null,
    futureFixturesAvailable: null,
    timePrecision: null,
    postponementObserved: null,
    cancellationObserved: null,
    publication: 'unknown',
    requestsPerRefresh: 1,
    evidence: 'Žreb nije objavljen.',
    checkedAt: '2026-10-01',
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'verified-schedule',
    result: result(),
    teams: [
      {
        id: TEAM, sport: 'football', name: 'FK Crvena zvezda', shortName: 'Crvena zvezda',
        country: 'RS', city: 'Beograd', aliases: ['Zvezda'], providerIds: {},
      },
    ],
    competitions: [
      { id: 'Superliga', sport: 'football', name: 'Superliga', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
    ],
    manifests: [
      {
        provider: 'demo-liga', competitionId: 'Superliga', seasonId: SEASON,
        lastAttemptAt: '2026-10-01T08:00:00.000Z', lastSuccessAt: '2026-10-01T08:00:00.000Z',
        lastChangeAt: null, staleAfterHours: 24,
      },
    ],
    changes: [{ fixtureId: 'football:aba:Superliga:2026-2027:aba:fx-1', revision: 1, kind: 'new' }],
    ...overrides,
  };
}

interface SeenRequest {
  url: string;
  init: Record<string, unknown>;
}

function stubFetch(status: number, body: unknown, seen: SeenRequest[], headers: Record<string, string> = {}) {
  return (async (url: string, init: Record<string, unknown>) => {
    seen.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

const BASE = 'https://raspored.example';

test('pronalazak šalje tipizovan zahtev i čuva Authorization samo u zaglavlju', async () => {
  const seen: SeenRequest[] = [];
  const parsed = await postFindFixtures({
    baseUrl: BASE,
    idToken: 'token-123',
    sport: 'football',
    teamId: TEAM,
    seasonId: SEASON,
    refresh: false,
    fetchImpl: stubFetch(200, envelope(), seen),
  });
  assert.equal(parsed.kind, 'verified-schedule');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, `${BASE}/api/find-fixtures`);
  assert.ok(!seen[0]!.url.includes('token-123'), 'token ne sme u URL');
  const sentHeaders = seen[0]!.init.headers as Record<string, string>;
  assert.equal(sentHeaders.authorization, 'Bearer token-123');
  assert.deepEqual(JSON.parse(seen[0]!.init.body as string), {
    sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false,
  });
});

test('bez prijave nema Authorization zaglavlja, poziv i dalje ide na server', async () => {
  const seen: SeenRequest[] = [];
  await postFindFixtures({
    baseUrl: BASE,
    idToken: null,
    sport: 'basketball',
    teamId: 'basketball:rs:partizan',
    seasonId: SEASON,
    refresh: true,
    fetchImpl: stubFetch(200, envelope({ kind: 'source-blocked' }), seen),
  });
  const sentHeaders = seen[0]!.init.headers as Record<string, string>;
  assert.ok(!('authorization' in sentHeaders));
  assert.equal(JSON.parse(seen[0]!.init.body as string).refresh, true);
});

test('pogrešan sport, klub i sezona ne idu na mrežu', async () => {
  for (const bad of [
    { sport: 'tennis', teamId: TEAM, seasonId: SEASON },
    { sport: 'football', teamId: 'football:xx:neko-treci', seasonId: SEASON },
    { sport: 'football', teamId: TEAM, seasonId: 'sutra' },
    { sport: 'football', teamId: TEAM, seasonId: '2025-2026' },
  ]) {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      throw new Error('ne sme na mrežu');
    }) as unknown as typeof fetch;
    await assert.rejects(
      () => postFindFixtures({ baseUrl: BASE, idToken: null, refresh: false, fetchImpl: counting, ...bad } as never),
      (error: unknown) => error instanceof ScheduleApiError && error.code === 'bad-request',
    );
    assert.equal(calls, 0);
  }
  validateFindRequest({ sport: 'football', teamId: TEAM, seasonId: SEASON });
});

test('nekonfigurisan server je poštena greška bez mreže', async () => {
  let calls = 0;
  const counting = (async () => {
    calls += 1;
    throw new Error('ne sme na mrežu');
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => postFindFixtures({ baseUrl: '  ', idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false, fetchImpl: counting }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'unconfigured',
  );
  assert.equal(calls, 0);
});

test('401 traži prijavu, 429 nosi kuldaun, 500 čuva prethodno stanje', async () => {
  const store = memoryStore();
  const entry: LastGoodSchedule = {
    teamId: TEAM, sport: 'football', seasonId: SEASON,
    kind: 'verified-schedule', response: parseFindResponse(envelope()),
    checkedAt: '2026-10-01T08:00:00.000Z', storedAt: '2026-10-01T08:05:00.000Z',
  };
  writeLastGood(store, entry);
  const seen: SeenRequest[] = [];
  await assert.rejects(
    () => postFindFixtures({
      baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON,
      refresh: true, fetchImpl: stubFetch(401, { error: { code: 'neautorizovano', message: 'Prijava je obavezna.' } }, seen),
    }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'unauthorized',
  );
  const throttled = stubFetch(429, { error: { code: 'usporeno', message: 'Polako.' } }, seen, { 'retry-after': '90' });
  await assert.rejects(
    () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: true, fetchImpl: throttled }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'throttled'
      && (error as ScheduleApiError).retryAfterMs === 90000,
  );
  await assert.rejects(
    () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: true, fetchImpl: stubFetch(500, { error: { code: 'kvar', message: 'Pad.' } }, seen) }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'server',
  );
  const kept = readLastGood(store, TEAM, SEASON);
  assert.ok(kept, 'pad servera ne sme da obriše poslednje dobro stanje');
  assert.equal(kept!.checkedAt, '2026-10-01T08:00:00.000Z');
  assert.equal(kept!.response.result.futureFixtures.length, 0);
});

test('pogrešan odgovor servera je greška, ne prazan prikaz', async () => {
  const badBodies = [
    { kind: 'uspeh', result: result() },
    { kind: 'verified-schedule' },
    envelope({ result: { ...result(), claimsNoMatches: true } }),
    envelope({ changes: [{ fixtureId: 'x', revision: 1, kind: 'izmišljeno' }] }),
    envelope({ manifests: [{ provider: 'p', competitionId: 'c', seasonId: SEASON, lastAttemptAt: null, lastSuccessAt: 'nije-datum', lastChangeAt: null, staleAfterHours: 24 }] }),
    'samo string',
    null,
  ];
  for (const body of badBodies) {
    await assert.rejects(
      () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false, fetchImpl: stubFetch(200, body, []) }),
      (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
      `telo nije odbijeno: ${JSON.stringify(body)?.slice(0, 80)}`,
    );
  }
});

test('neobjavljeno takmičenje i nepoznat termin prolaze kao pokrivenost, ne kao utakmica', () => {
  const parsed = parseFindResponse(envelope({
    result: result({
      futureFixtures: [fixture({ startsAtUtc: null, timeConfirmed: false, status: 'time_tbd', scheduledLocalDate: null })],
      coverage: [coverage()],
    }),
  }));
  assert.equal(parsed.result.futureFixtures[0]!.startsAtUtc, null);
  assert.equal(parsed.result.futureFixtures[0]!.status, 'time_tbd');
  assert.equal(parsed.result.coverage[0]!.scheduleAvailability, 'unpublished');
  assert.equal(parsed.result.coverage[0]!.futureFixturesAvailable, null);
});

test('source-blocked sme da bude prazan, synthetic-demo ostaje označen', () => {
  const blocked = parseFindResponse(envelope({ kind: 'source-blocked', result: result({ coverage: [coverage({ scheduleAvailability: 'source_error' })] }) }));
  assert.equal(blocked.kind, 'source-blocked');
  assert.deepEqual(blocked.result.futureFixtures, []);
  const demo = parseFindResponse(envelope({ kind: 'synthetic-demo' }));
  assert.equal(demo.kind, 'synthetic-demo');
});

test('kuldaun: prvi klik prolazi, drugi čeka, prozor ističe', () => {
  const store = memoryStore();
  const minute = 60 * 1000;
  const start = Date.parse('2026-10-01T08:00:00.000Z');
  assert.equal(refreshCooldown(store, TEAM, SEASON, start).allowed, true);
  writeLastAttemptAt(store, TEAM, SEASON, new Date(start).toISOString());
  const blocked = refreshCooldown(store, TEAM, SEASON, start + 5 * minute);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.waitMs > 0 && blocked.waitMs <= 10 * minute);
  assert.equal(refreshCooldown(store, TEAM, SEASON, start + 16 * minute).allowed, true);
  assert.equal(readLastAttemptAt(store, TEAM, SEASON), new Date(start).toISOString());
  // Sat prikaza kasni za upravo upisanim pokušajem: kuldaun i dalje važi.
  assert.equal(refreshCooldown(store, TEAM, SEASON, start - 30 * 1000).allowed, false);
});

test('zamena naloga briše sesiju, a javni raspored na uređaju ostaje bez privatnih tragova', () => {
  const local = memoryStore();
  const session = memoryStore({
    'matchahead.session.followedTeamIds': JSON.stringify([TEAM]),
    'matchahead.session.manualFixtureIds': JSON.stringify([]),
  });
  const device = memoryStore();
  writeLastGood(device, {
    teamId: TEAM, sport: 'football', seasonId: SEASON,
    kind: 'verified-schedule', response: parseFindResponse(envelope()),
    checkedAt: '2026-10-01T08:00:00.000Z', storedAt: '2026-10-01T08:05:00.000Z',
  });
  clearUserLocalContent(local, session, 'uid-ana');
  assert.deepEqual(session.keys(), []);
  const kept = readLastGood(device, TEAM, SEASON);
  assert.ok(kept, 'javni raspored preživljava zamenu naloga');
  const serialized = JSON.stringify(kept);
  for (const secret of ['uid-ana', 'ana@example', 'Bearer', 'token-123', 'id_token', 'access_token']) {
    assert.ok(!serialized.includes(secret), `trag privatnog podatka: ${secret}`);
  }
});

test('bez Firebase sesije nema tokena; adresa servera je javna konfiguracija', async () => {
  assert.equal(await currentScheduleIdToken(null), null);
  assert.equal(
    await currentScheduleIdToken({ auth: { currentUser: { getIdToken: async () => 'id-token-xyz' } } }),
    'id-token-xyz',
  );
  assert.equal(
    await currentScheduleIdToken({ auth: { currentUser: { getIdToken: async () => { throw new Error('isteklo'); } } } }),
    null,
  );
  assert.deepEqual(readScheduleServerConfig({}), { kind: 'unconfigured' });
  assert.deepEqual(readScheduleServerConfig({ VITE_SCHEDULE_API_URL: 'ftp://x' }), { kind: 'unconfigured' });
  assert.deepEqual(
    readScheduleServerConfig({ VITE_SCHEDULE_API_URL: 'https://raspored.example/ ' }),
    { kind: 'ready', baseUrl: 'https://raspored.example' },
  );
});

test('adresa servera: HTTPS uvek, HTTP samo loopback, bez tajni u URL-u', () => {
  assert.equal(normalizeApiBaseUrl('https://raspored.example/api/'), 'https://raspored.example/api');
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(normalizeApiBaseUrl('http://localhost:8787/'), 'http://localhost:8787');
  for (const malicious of [
    'javascript:alert(1)',
    'http://raspored.example/api',
    'http://192.168.1.2/api',
    'https://korisnik:lozinka@raspored.example/api',
    'https://raspored.example/api?token=tajno',
    'https://raspored.example/api#frag',
    'ftp://raspored.example/api',
    '//raspored.example/api',
    'raspored.example/api',
    '',
    '   ',
  ]) {
    assert.equal(normalizeApiBaseUrl(malicious), null, `propustena adresa: ${malicious}`);
  }
});

test('datumi su stvarni kalendarski datumi, trenuci strogi ISO sa zonom', () => {
  assert.equal(isRealCalendarDate('2026-10-05'), true);
  assert.equal(isRealCalendarDate('2024-02-29'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', 'sutra', '05.10.2026', '2026-1-1', '']) {
    assert.equal(isRealCalendarDate(bad), false, `propusten datum: ${bad}`);
  }
  assert.equal(isStrictInstant('2026-10-05T17:00:00.000Z'), true);
  assert.equal(isStrictInstant('2026-10-05T19:00:00+02:00'), true);
  for (const bad of [
    'sutra',
    '2026-10-05',
    '2026-10-05T17:00:00',
    '2026-02-30T10:00:00Z',
    '2026-10-05T25:00:00Z',
    'ne datum',
    '',
  ]) {
    assert.equal(isStrictInstant(bad), false, `propusten trenutak: ${bad}`);
  }
  const withBadDate = envelope({
    result: result({ futureFixtures: [fixture({ scheduledLocalDate: '2026-02-30' })] }),
  });
  assert.throws(() => parseFindResponse(withBadDate), (error: unknown) => error instanceof ScheduleApiError);
  const withBadInstant = envelope({
    result: result({ checkedAt: '2026-02-30T10:00:00Z', lastAttemptAt: null, lastSuccessAt: null }),
  });
  assert.throws(() => parseFindResponse(withBadInstant), (error: unknown) => error instanceof ScheduleApiError);
});

test('prva blokada sa checkedAt null je validna i nije lažni uspeh', () => {
  const parsed = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({ checkedAt: null, lastSuccessAt: null, futureFixtures: [] }),
  }));
  assert.equal(parsed.result.checkedAt, null);
  const store = memoryStore();
  writeLastGood(store, {
    teamId: TEAM, sport: 'football', seasonId: SEASON,
    kind: 'source-blocked', response: parsed,
    checkedAt: null, storedAt: '2026-10-01T08:05:00.000Z',
  });
  const kept = readLastGood(store, TEAM, SEASON);
  assert.ok(kept);
  assert.equal(kept!.checkedAt, null);
});

test('DEMO se ne upisuje u trajno stanje; oštećen zapis se ne čita', () => {
  const store = memoryStore();
  const demo = parseFindResponse(envelope({ kind: 'synthetic-demo' }));
  assert.throws(
    () => writeLastGood(store, {
      teamId: TEAM, sport: 'football', seasonId: SEASON,
      kind: 'synthetic-demo', response: demo,
      checkedAt: '2026-10-01T08:00:00.000Z', storedAt: '2026-10-01T08:05:00.000Z',
    } as never),
    /DEMO/,
  );
  const corrupt = JSON.parse(JSON.stringify(envelope())) as { result: { futureFixtures: unknown[] } };
  corrupt.result.futureFixtures.push({ pokvareno: true });
  store.setItem(`matchahead.device.schedule.${TEAM}:${SEASON}`, JSON.stringify({
    teamId: TEAM, seasonId: SEASON, kind: 'verified-schedule',
    checkedAt: '2026-10-01T08:00:00.000Z', storedAt: '2026-10-01T08:05:00.000Z',
    response: corrupt,
  }));
  assert.equal(readLastGood(store, TEAM, SEASON), null);
});

test('prekinut zahtev pri zameni naloga se nikad ne upisuje', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => postFindFixtures({
      baseUrl: BASE, idToken: 'token-123', sport: 'football', teamId: TEAM,
      seasonId: SEASON, refresh: false, signal: controller.signal,
      fetchImpl: stubFetch(200, envelope(), []),
    }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'aborted',
  );
});

test('mrežni pad i tajmaut su server, ne izmišljen uspeh', async () => {
  const failing = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false, fetchImpl: failing }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'server',
  );
  const hanging = (((_url: unknown, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      reject(new DOMException('prekinuto', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', () => reject(new DOMException('prekinuto', 'AbortError')), { once: true });
  })) as unknown) as typeof fetch;
  await assert.rejects(
    () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false, fetchImpl: hanging, timeoutMs: 5 }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'timeout',
  );
  await assert.rejects(
    () => postFindFixtures({ baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM, seasonId: SEASON, refresh: false, online: false, fetchImpl: failing }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'offline',
  );
});
