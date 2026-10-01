import assert from 'node:assert/strict';
import test from 'node:test';

import type { FindFixturesResult } from '../../../packages/domain/src/find-fixtures.ts';
import { INITIAL_SEASON_ID } from '../../../packages/domain/src/schedule-api.ts';
import type { CoverageStatus, Fixture } from '../../../packages/domain/src/types.ts';
import {
  FIND_TIMEOUT_MS,
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
  buildUnifiedServerAgenda,
  unifiedVerifiedFixtures,
} from '../src/logic/server-agenda.ts';
import {
  purgeRevokedSnapshots,
  readLastAttemptAt,
  readLastGood,
  refreshCooldown,
  writeLastAttemptAt,
  writeLastGood,
  type LastGoodSchedule,
} from '../src/logic/schedule-store.ts';
import { clearUserLocalContent, memoryStore } from '../src/logic/user-local.ts';

const TEAM = 'football:rs:crvena-zvezda';
const PARTIZAN = 'football:rs:partizan';
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
  const teamId = overrides.teamId !== undefined ? overrides.teamId : TEAM;
  const competitionId = overrides.competitionId ?? 'Kup';
  const seasonId = overrides.seasonId ?? SEASON;
  const provider = overrides.provider ?? 'demo-liga';
  return {
    id: teamId === null ? `null:${competitionId}:${seasonId}:${provider}` : `${teamId}:${competitionId}:${seasonId}:${provider}`,
    teamId,
    competitionId,
    seasonId,
    provider,
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
      {
        id: PARTIZAN, sport: 'football', name: 'FK Partizan', shortName: 'Partizan',
        country: 'RS', city: 'Beograd', aliases: ['Partizan'], providerIds: {},
      },
    ],
    competitions: [
      { id: 'Superliga', sport: 'football', name: 'Superliga', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
      { id: 'Kup', sport: 'football', name: 'Kup', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
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
  const tbd = fixture({ startsAtUtc: null, timeConfirmed: false, status: 'time_tbd', scheduledLocalDate: null });
  const parsed = parseFindResponse(envelope({
    result: result({
      futureFixtures: [tbd],
      nextFixture: tbd,
      nextConfirmedFixture: null,
      coverage: [allowedSuperligaRow(), coverage()],
    }),
  }));
  assert.equal(parsed.result.futureFixtures[0]!.startsAtUtc, null);
  assert.equal(parsed.result.futureFixtures[0]!.status, 'time_tbd');
  assert.equal(parsed.result.coverage[1]!.scheduleAvailability, 'unpublished');
  assert.equal(parsed.result.coverage[1]!.futureFixturesAvailable, null);
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

test('podrazumevani rok je 20 s do kraja čitanja tela', () => {
  assert.equal(FIND_TIMEOUT_MS, 20000);
});

test('zaglavlja 200 pa viseće telo daje timeout u kratkom roku', async () => {
  // Mock ignoriše signal i nikad ne razrešava telo: trka roka svejedno puca.
  const hanging = new Promise<unknown>(() => {});
  const stalledBody = (async () => ({
    status: 200,
    ok: true,
    headers: { get: (_name: string) => 'application/json' },
    json: () => hanging,
  })) as unknown as typeof fetch;
  const started = Date.now();
  await assert.rejects(
    () => postFindFixtures({
      baseUrl: BASE, idToken: null, sport: 'football', teamId: TEAM,
      seasonId: SEASON, refresh: false, fetchImpl: stalledBody, timeoutMs: 50,
    }),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'timeout',
  );
  assert.ok(Date.now() - started < 5000, 'timeout visećeg tela mora stići brzo, bez blokade UI');
});

test('prekid posle zaglavlja (odjava u letu) daje aborted, ne kasni upis', async () => {
  const external = new AbortController();
  // Mock poštuje signal: telo visi dok spoljni prekid ne stigne.
  const signalHonoring = (async (_url: unknown, init?: { signal?: AbortSignal }) => ({
    status: 200,
    ok: true,
    headers: { get: (_name: string) => 'application/json' },
    json: () => new Promise<unknown>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('prekinuto', 'AbortError')), { once: true });
    }),
  })) as unknown as typeof fetch;
  const pending = postFindFixtures({
    baseUrl: BASE, idToken: 'token-123', sport: 'football', teamId: TEAM,
    seasonId: SEASON, refresh: false, signal: external.signal, timeoutMs: 5000, fetchImpl: signalHonoring,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  external.abort();
  await assert.rejects(
    () => pending,
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'aborted',
  );
});

test('kasni odgovor posle odjave se nikad ne vraća kao uspeh', async () => {
  const external = new AbortController();
  const late = envelope();
  const lateBody = (async (_url: unknown, init?: { signal?: AbortSignal }) => ({
    status: 200,
    ok: true,
    headers: { get: (_name: string) => 'application/json' },
    json: () => new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => resolve(late), 80);
      init?.signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
    }),
  })) as unknown as typeof fetch;
  const pending = postFindFixtures({
    baseUrl: BASE, idToken: 'token-123', sport: 'football', teamId: TEAM,
    seasonId: SEASON, refresh: false, signal: external.signal, timeoutMs: 5000, fetchImpl: lateBody,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  external.abort();
  await assert.rejects(
    () => pending,
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'aborted',
  );
});

const DERBY_ID = 'football:Superliga:2026-2027:demo-liga:fx-derby';

function derbyFixture(revision: number): Fixture {
  return fixture({
    id: DERBY_ID,
    homeTeamId: TEAM,
    awayTeamId: PARTIZAN,
    revision,
    contentHash: `derby-${revision}`,
    fetchedAt: '2026-10-01T08:00:00.000Z',
  });
}

function clubSnapshot(
  teamId: string,
  fixtures: Fixture[],
  coverageRows: CoverageStatus[] = [],
  kind: 'verified-schedule' | 'source-blocked' = 'verified-schedule',
): LastGoodSchedule {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  const name = teamId.includes('partizan') ? 'Partizan' : 'Crvena zvezda';
  const firstConfirmed = fixtures.find((entry) => entry.timeConfirmed) ?? null;
  const checkedAt = kind === 'verified-schedule' ? '2026-10-01T08:00:00.000Z' : null;
  // Imenik učesnika: traženi tim plus svaki drugi učesnik sa spiska.
  const participantIds = new Map<string, { id: string; sport: typeof sport; name: string }>();
  const displayName = (id: string): string => {
    if (id === teamId) return `FK ${name}`;
    if (id.includes('partizan')) return 'FK Partizan';
    if (id.includes('crvena-zvezda')) return 'FK Crvena zvezda';
    return id;
  };
  for (const entry of fixtures) {
    for (const participant of [entry.homeTeamId, entry.awayTeamId]) {
      if (participant !== null && !participantIds.has(participant)) {
        participantIds.set(participant, { id: participant, sport, name: displayName(participant) });
      }
    }
  }
  if (!participantIds.has(teamId)) {
    participantIds.set(teamId, { id: teamId, sport, name: `FK ${name}` });
  }
  // Ugovorna pokrivenost: svaki par izvor+takmičenje sa spiska nosi dozvolu,
  // osim parova koje pozivalac izričito opisuje svojim redovima.
  const describedPairs = new Set(coverageRows.map((row) => `${row.provider}␟${row.competitionId}␟${row.seasonId}`));
  const impliedCoverage: CoverageStatus[] = [];
  for (const entry of fixtures) {
    const pair = `${entry.provider}␟${entry.competitionId}␟${entry.seasonId}`;
    if (describedPairs.has(pair)) continue;
    describedPairs.add(pair);
    impliedCoverage.push(coverage({
      id: `${teamId}:${entry.competitionId}:${entry.seasonId}:${entry.provider}`,
      teamId,
      competitionId: entry.competitionId,
      seasonId: entry.seasonId,
      provider: entry.provider,
      verdict: 'confirmed',
      scheduleAvailability: 'published',
      futureFixturesAvailable: true,
      timePrecision: 'utc_confirmed',
      publication: 'allowed',
      evidence: 'Ugovorna pokrivenost za test.',
    }));
  }
  const response = parseFindResponse({
    kind,
    result: {
      teamId,
      sport,
      seasonId: SEASON,
      cacheStatus: 'fetched',
      upstreamRequests: 1,
      checkedAt,
      lastAttemptAt: '2026-10-01T08:00:00.000Z',
      lastSuccessAt: checkedAt,
      claimsNoMatches: false,
      futureFixtures: fixtures,
      nextFixture: fixtures[0] ?? null,
      nextConfirmedFixture: firstConfirmed,
      coverage: [...coverageRows, ...impliedCoverage],
    },
    teams: [...participantIds.values()].map((participant) => (
      {
        id: participant.id, sport: participant.sport, name: participant.name,
        shortName: participant.name.replace(/^FK /, ''), country: 'RS', city: 'Beograd',
        aliases: [participant.name], providerIds: {},
      }
    )),
    competitions: [
      { id: 'Superliga', sport, name: 'Superliga', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
    ],
    manifests: [
      {
        provider: 'demo-liga', competitionId: 'Superliga', seasonId: SEASON,
        lastAttemptAt: '2026-10-01T08:00:00.000Z', lastSuccessAt: '2026-10-01T08:00:00.000Z',
        lastChangeAt: null, staleAfterHours: 24,
      },
    ],
    changes: [],
  });
  return {
    teamId, sport, seasonId: SEASON,
    kind, response,
    checkedAt, storedAt: '2026-10-01T08:05:00.000Z',
  };
}

test('derbi iz dva snimka postoji jednom, sa najvišom revizijom bez obzira na redosled', () => {
  const zvezda = clubSnapshot(TEAM, [derbyFixture(2), fixture({})]);
  const partizan = clubSnapshot(PARTIZAN, [derbyFixture(3)]);
  for (const ordered of [[zvezda, partizan], [partizan, zvezda]]) {
    const unified = unifiedVerifiedFixtures(ordered);
    const derbies = unified.filter((entry) => entry.id === DERBY_ID);
    assert.equal(derbies.length, 1, 'derbi se ne sme duplirati po snimku');
    assert.equal(derbies[0]!.revision, 3, 'pobeđuje najviša konzistentna revizija');
  }
});

test('unificirana agenda spaja praćenja oba kluba bez duplikata', () => {
  const zvezda = clubSnapshot(TEAM, [derbyFixture(2), fixture({})]);
  const partizan = clubSnapshot(PARTIZAN, [derbyFixture(3)]);
  const entries = buildUnifiedServerAgenda([zvezda, partizan], [TEAM, PARTIZAN], []);
  const derbies = entries.filter((entry) => entry.fixture.id === DERBY_ID);
  assert.equal(derbies.length, 1);
  assert.equal(derbies[0]!.reasons.filter((reason) => reason.kind === 'followed_team').length, 2);
  assert.ok(entries.length >= 2, 'lični i derbi redovi ostaju u agendi');
});

test('forbidden opoziv briše izvor iz svih snimaka; unknown čuva prikaz', () => {
  const store = memoryStore();
  writeLastGood(store, clubSnapshot(TEAM, [fixture({})]));
  writeLastGood(store, clubSnapshot(PARTIZAN, [
    fixture({ id: 'football:Superliga:2026-2027:demo-liga:fx-p', homeTeamId: PARTIZAN, awayTeamId: TEAM }),
  ]));
  const revoked = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({
      checkedAt: null,
      lastSuccessAt: null,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [coverage({ competitionId: 'Superliga', publication: 'forbidden', scheduleAvailability: 'unknown' })],
    }),
  }));
  const purged = purgeRevokedSnapshots(store, revoked, SEASON);
  assert.equal(purged.prunedSnapshots, 2);
  assert.equal(purged.prunedFixtures, 2);
  assert.equal(readLastGood(store, TEAM, SEASON)!.response.result.futureFixtures.length, 0);
  assert.equal(readLastGood(store, TEAM, SEASON)!.checkedAt, null);
  assert.equal(readLastGood(store, PARTIZAN, SEASON)!.response.result.futureFixtures.length, 0);

  const kept = memoryStore();
  writeLastGood(kept, clubSnapshot(TEAM, [fixture({})]));
  // Prolazna nepoznanica za par koji nikad nije bio dozvoljen (Kup) čuva prikaz.
  const transient = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({
      checkedAt: null,
      lastSuccessAt: null,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [coverage({ scheduleAvailability: 'source_error' })],
    }),
  }));
  assert.deepEqual(purgeRevokedSnapshots(kept, transient, SEASON), { prunedSnapshots: 0, prunedFixtures: 0 });
  assert.equal(readLastGood(kept, TEAM, SEASON)!.response.result.futureFixtures.length, 1);
});

test('opozvani izvor ne ulazi u unificiranu agendu', () => {
  // Opoziv važi globalno: provereni snimak nosi derbi (demo-liga), ali drugi
  // klub javlja forbidden za taj izvor — derbi ispada svuda, a utakmica
  // drugog dozvoljenog izvora ostaje.
  const clean = clubSnapshot(TEAM, [
    derbyFixture(2),
    fixture({ provider: 'druga-liga', sourceUrl: 'https://druga-liga.example/raspored/superliga' }),
  ]);
  // Opozvani par ne nosi utakmice: server vraća prazan spisak uz zabranu.
  const revoked = clubSnapshot(PARTIZAN, [], [
    coverage({ teamId: PARTIZAN, competitionId: 'Superliga', provider: 'demo-liga', publication: 'forbidden', scheduleAvailability: 'unknown' }),
  ], 'source-blocked');
  const unified = unifiedVerifiedFixtures([clean, revoked]);
  assert.ok(!unified.some((entry) => entry.id === DERBY_ID), 'opozvani derbi ne sme da curi iz drugog snimka');
  assert.equal(unified.length, 1);
});

test('allowed pa unknown je opoziv u unificiranoj agendi i u trajnom stanju', () => {
  const allowedRow = (teamId: string) => coverage({
    teamId, competitionId: 'Superliga', provider: 'demo-liga',
    publication: 'allowed', scheduleAvailability: 'published',
  });
  const unknownRow = (teamId: string) => coverage({
    teamId, competitionId: 'Superliga', provider: 'demo-liga',
    publication: 'unknown', scheduleAvailability: 'unknown',
  });
  // Unificirana agenda: drugi klub spušta prethodno dozvoljeni par na unknown.
  const clean = clubSnapshot(TEAM, [derbyFixture(2)], [allowedRow(TEAM)]);
  // Spušteni par ne nosi utakmice: server vraća prazan spisak uz unknown.
  const downgraded = clubSnapshot(PARTIZAN, [], [unknownRow(PARTIZAN)], 'source-blocked');
  assert.deepEqual(unifiedVerifiedFixtures([clean, downgraded]), []);
  // Trajno stanje: isti prelaz briše par iz svih snimaka sezone.
  const store = memoryStore();
  writeLastGood(store, clubSnapshot(TEAM, [fixture({})], [allowedRow(TEAM)]));
  writeLastGood(store, clubSnapshot(PARTIZAN, [
    fixture({ id: 'football:Superliga:2026-2027:demo-liga:fx-p', homeTeamId: PARTIZAN, awayTeamId: TEAM }),
  ], [allowedRow(PARTIZAN)]));
  const downgradeResponse = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({
      checkedAt: null,
      lastSuccessAt: null,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [unknownRow(TEAM)],
    }),
  }));
  const purged = purgeRevokedSnapshots(store, downgradeResponse, SEASON);
  assert.equal(purged.prunedSnapshots, 2);
  assert.equal(readLastGood(store, TEAM, SEASON)!.response.result.futureFixtures.length, 0);
  assert.equal(readLastGood(store, PARTIZAN, SEASON)!.response.result.futureFixtures.length, 0);
});

test('ista revizija sa različitim sadržajem se ne objavljuje', () => {
  const zvezda = clubSnapshot(TEAM, [derbyFixture(2)]);
  const conflict = {
    ...derbyFixture(2),
    contentHash: 'derby-2-druga-verzija',
    startsAtUtc: '2026-10-06T17:00:00.000Z',
    scheduledLocalDate: '2026-10-06',
  };
  const partizan = clubSnapshot(PARTIZAN, [conflict]);
  const unified = unifiedVerifiedFixtures([zvezda, partizan]);
  assert.ok(!unified.some((entry) => entry.id === DERBY_ID), 'konflikt se ne sme objaviti proizvoljnim izborom');
  assert.deepEqual(buildUnifiedServerAgenda([zvezda, partizan], [TEAM, PARTIZAN], []), []);
});

function allowedSuperligaRow(): CoverageStatus {
  return coverage({
    id: `${TEAM}:Superliga:${SEASON}:demo-liga`,
    competitionId: 'Superliga',
    provider: 'demo-liga',
    verdict: 'confirmed',
    scheduleAvailability: 'published',
    futureFixturesAvailable: true,
    timePrecision: 'utc_confirmed',
    publication: 'allowed',
    evidence: 'Liga objavila raspored uz dozvolu.',
  });
}

function validVerifiedBody() {
  const confirmed = fixture({});
  return envelope({
    result: result({
      futureFixtures: [confirmed],
      nextFixture: confirmed,
      nextConfirmedFixture: confirmed,
      coverage: [allowedSuperligaRow()],
    }),
  });
}

test('semantika odgovora odbija nedosledne revizije, izvore, odnose i next pokazivače', () => {
  const mutateResult = (change: (draft: FindFixturesResult) => void) => {
    const body = validVerifiedBody() as { result: FindFixturesResult };
    change(body.result);
    return body;
  };
  const cases: Array<{ name: string; body: unknown }> = [
    { name: 'negativna revizija', body: mutateResult((draft) => { draft.futureFixtures[0]!.revision = -1; }) },
    { name: 'razlomljena revizija', body: mutateResult((draft) => { draft.futureFixtures[0]!.revision = 1.5; }) },
    { name: 'http izvor', body: mutateResult((draft) => { draft.futureFixtures[0]!.sourceUrl = 'http://primer-liga.example/raspored'; }) },
    { name: 'javascript izvor', body: mutateResult((draft) => { draft.futureFixtures[0]!.sourceUrl = 'javascript:alert(1)'; }) },
    {
      name: 'kredencijali u izvoru',
      body: mutateResult((draft) => { draft.futureFixtures[0]!.sourceUrl = 'https://korisnik:lozinka@primer-liga.example/raspored'; }),
    },
    { name: 'pogrešan sport utakmice', body: mutateResult((draft) => { draft.futureFixtures[0]!.sport = 'basketball'; }) },
    { name: 'pogrešna sezona utakmice', body: mutateResult((draft) => { draft.futureFixtures[0]!.seasonId = '2025-2026'; }) },
    { name: 'nepoznato takmičenje utakmice', body: mutateResult((draft) => { draft.futureFixtures[0]!.competitionId = 'Nepostojeća'; }) },
    {
      name: 'utakmica tuđih klubova',
      body: mutateResult((draft) => {
        draft.futureFixtures[0]!.homeTeamId = 'football:rs:neko-treci';
        draft.futureFixtures[0]!.awayTeamId = 'football:rs:neko-cetvrti';
      }),
    },
    {
      name: 'potvrđen termin bez trenutka',
      body: mutateResult((draft) => { draft.futureFixtures[0]!.startsAtUtc = null; }),
    },
    {
      name: 'nepotvrđen termin sa trenutkom',
      body: mutateResult((draft) => {
        draft.futureFixtures[0]!.timeConfirmed = false;
        draft.futureFixtures[0]!.status = 'time_tbd';
      }),
    },
    {
      name: 'next pokazuje van spiska',
      body: mutateResult((draft) => { draft.nextFixture = fixture({ id: 'izmišljen-id' }); }),
    },
    {
      name: 'nextConfirmed izmišljen uz postojeći potvrđeni',
      body: mutateResult((draft) => { draft.nextConfirmedFixture = null; }),
    },
    {
      name: 'pokrivenost tuđeg tima',
      body: mutateResult((draft) => { draft.coverage.push(coverage({ teamId: PARTIZAN })); }),
    },
    { name: 'negativan brojač', body: mutateResult((draft) => { draft.upstreamRequests = -1; }) },
    { name: 'nulta revizija utakmice', body: mutateResult((draft) => { draft.futureFixtures[0]!.revision = 0; }) },
  ];
  for (const entry of cases) {
    assert.throws(
      () => parseFindResponse(entry.body),
      (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
      `propust: ${entry.name}`,
    );
  }
  const forbiddenPair = validVerifiedBody() as { result: FindFixturesResult };
  forbiddenPair.result.coverage = [coverage({
    id: `${TEAM}:Superliga:${SEASON}:demo-liga`,
    competitionId: 'Superliga',
    provider: 'demo-liga',
    publication: 'forbidden',
    scheduleAvailability: 'unknown',
  })];
  assert.throws(
    () => parseFindResponse(forbiddenPair),
    (error: unknown) => error instanceof ScheduleApiError,
    'utakmica para uz forbidden publication',
  );
  const unknownPair = validVerifiedBody() as { result: FindFixturesResult };
  unknownPair.result.coverage = [coverage({
    id: `${TEAM}:Superliga:${SEASON}:demo-liga`,
    competitionId: 'Superliga',
    provider: 'demo-liga',
    publication: 'unknown',
    scheduleAvailability: 'unknown',
  })];
  assert.throws(
    () => parseFindResponse(unknownPair),
    (error: unknown) => error instanceof ScheduleApiError,
    'utakmica para uz unknown publication bez dozvole',
  );
  const syntheticLeak = validVerifiedBody() as { result: FindFixturesResult };
  syntheticLeak.result.futureFixtures[0]!.provider = 'demo';
  syntheticLeak.result.coverage.push(coverage({
    id: `${TEAM}:Superliga:${SEASON}:demo`,
    competitionId: 'Superliga',
    provider: 'demo',
    publication: 'allowed',
    scheduleAvailability: 'published',
  }));
  assert.throws(
    () => parseFindResponse(syntheticLeak),
    (error: unknown) => error instanceof ScheduleApiError,
    'verified uz sintetički trag',
  );
  const zeroChange = validVerifiedBody() as { changes: Array<{ fixtureId: string; revision: number; kind: string }> };
  zeroChange.changes = [{ fixtureId: 'football:aba:Superliga:2026-2027:aba:fx-1', revision: 0, kind: 'new' }];
  assert.throws(
    () => parseFindResponse(zeroChange),
    (error: unknown) => error instanceof ScheduleApiError,
    'nulta revizija promene',
  );
  const fractionalChange = validVerifiedBody() as { changes: Array<{ fixtureId: string; revision: number; kind: string }> };
  fractionalChange.changes = [{ fixtureId: 'football:aba:Superliga:2026-2027:aba:fx-1', revision: 1.5, kind: 'new' }];
  assert.throws(
    () => parseFindResponse(fractionalChange),
    (error: unknown) => error instanceof ScheduleApiError,
    'razlomljena revizija promene',
  );
});

test('sintetički režim sme sintetički izvor, ali nikad javascript', () => {
  const demoFixture = fixture({ provider: 'demo', sourceUrl: 'synthetic://demo/1' });
  const demoCoverage = coverage({
    id: `${TEAM}:Superliga:${SEASON}:demo`,
    competitionId: 'Superliga',
    provider: 'demo',
    publication: 'allowed',
    scheduleAvailability: 'published',
  });
  const parsed = parseFindResponse(envelope({
    kind: 'synthetic-demo',
    result: result({
      futureFixtures: [demoFixture],
      nextFixture: demoFixture,
      nextConfirmedFixture: demoFixture,
      coverage: [demoCoverage],
    }),
  }));
  assert.equal(parsed.kind, 'synthetic-demo');
  const badFixture = fixture({ sourceUrl: 'javascript:alert(1)' });
  const bad = envelope({
    kind: 'synthetic-demo',
    result: result({
      futureFixtures: [badFixture],
      nextFixture: badFixture,
      nextConfirmedFixture: badFixture,
      coverage: [allowedSuperligaRow()],
    }),
  });
  assert.throws(() => parseFindResponse(bad), (error: unknown) => error instanceof ScheduleApiError);
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

test('utakmica učesnika koga nema u imeniku se odbija', () => {
  const stranger = fixture({ homeTeamId: TEAM, awayTeamId: 'football:rs:nepoznat-klub' });
  assert.throws(
    () => parseFindResponse(envelope({
      result: result({
        futureFixtures: [stranger],
        nextFixture: stranger,
        nextConfirmedFixture: stranger,
        coverage: [allowedSuperligaRow()],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'nepoznat učesnik prošao imenik',
  );
});

test('next pokazivači moraju biti jednaki vraćenim podacima, ne samo isti id', () => {
  const confirmed = fixture({});
  const staleCopy = { ...confirmed, revision: confirmed.revision + 1, contentHash: 'zastareo-sadržaj' };
  assert.throws(
    () => parseFindResponse(envelope({
      result: result({
        futureFixtures: [confirmed],
        nextFixture: staleCopy,
        nextConfirmedFixture: confirmed,
        coverage: [allowedSuperligaRow()],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'zastarela kopija next pokazivača prošla',
  );
  const droppedConfirmed = fixture({});
  assert.throws(
    () => parseFindResponse(envelope({
      result: result({
        futureFixtures: [droppedConfirmed],
        nextFixture: droppedConfirmed,
        nextConfirmedFixture: null,
        coverage: [allowedSuperligaRow()],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'ispušten nextConfirmed prošao uz potvrđeni termin',
  );
});

test('budući spisak mora biti kanonski uređen po danu, terminu i id-u', () => {
  const earlier = fixture({
    id: 'football:aba:Superliga:2026-2027:aba:fx-raniji',
    startsAtUtc: '2026-10-04T17:00:00.000Z',
    scheduledLocalDate: '2026-10-04',
    providerFixtureId: 'fx-raniji',
  });
  const later = fixture({});
  assert.throws(
    () => parseFindResponse(envelope({
      result: result({
        futureFixtures: [later, earlier],
        nextFixture: later,
        nextConfirmedFixture: later,
        coverage: [allowedSuperligaRow()],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'neuređen budući spisak prošao',
  );
  const parsed = parseFindResponse(envelope({
    result: result({
      futureFixtures: [earlier, later],
      nextFixture: earlier,
      nextConfirmedFixture: earlier,
      coverage: [allowedSuperligaRow()],
    }),
  }));
  assert.equal(parsed.result.nextFixture!.id, earlier.id);
});

test('dozvoljeni delimični uspeh uz zabranu drugog takmičenja prolazi', () => {
  // Nepoznat protivnik posle žreba (awayTeamId null) nije razlog za odbijanje.
  const drawNull = fixture({ awayTeamId: null });
  const parsed = parseFindResponse(envelope({
    kind: 'verified-schedule',
    result: result({
      futureFixtures: [drawNull],
      nextFixture: drawNull,
      nextConfirmedFixture: drawNull,
      coverage: [
        allowedSuperligaRow(),
        coverage({ publication: 'forbidden', scheduleAvailability: 'unknown' }),
      ],
    }),
  }));
  assert.equal(parsed.result.futureFixtures.length, 1);
  assert.equal(parsed.result.futureFixtures[0]!.awayTeamId, null);
});

test('dozvoljena zastarela source_error pokrivenost čuva poslednji snimak', () => {
  const kept = fixture({});
  const parsed = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({
      futureFixtures: [kept],
      nextFixture: kept,
      nextConfirmedFixture: kept,
      coverage: [coverage({
        id: `${TEAM}:Superliga:${SEASON}:demo-liga`,
        competitionId: 'Superliga',
        provider: 'demo-liga',
        publication: 'allowed',
        scheduleAvailability: 'source_error',
        evidence: 'Izvor vratio grešku; prethodni raspored ostaje.',
      })],
    }),
  }));
  assert.equal(parsed.result.futureFixtures.length, 1);
  assert.equal(parsed.result.checkedAt, '2026-10-01T08:00:00.000Z');
});

test('blokada bez dokaza ne sme nositi utakmice; prazna je validna', () => {
  const invented = fixture({});
  assert.throws(
    () => parseFindResponse(envelope({
      kind: 'source-blocked',
      result: result({
        checkedAt: null,
        lastSuccessAt: null,
        futureFixtures: [invented],
        nextFixture: invented,
        nextConfirmedFixture: invented,
        coverage: [coverage({ scheduleAvailability: 'source_error' })],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'izmišljene utakmice bez dokaza prošle',
  );
  const empty = parseFindResponse(envelope({
    kind: 'source-blocked',
    result: result({
      checkedAt: null,
      lastSuccessAt: null,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [coverage({ scheduleAvailability: 'source_error' })],
    }),
  }));
  assert.equal(empty.result.checkedAt, null);
  assert.deepEqual(empty.result.futureFixtures, []);
});

test('traženi izborni tim važi i uz prazne imenike; neizborni se odbija', () => {
  const emptyDirs = parseFindResponse(envelope({
    kind: 'source-blocked',
    teams: [],
    competitions: [],
    manifests: [],
    result: result({
      checkedAt: null,
      lastSuccessAt: null,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [],
    }),
  }));
  assert.equal(emptyDirs.result.teamId, TEAM);
  assert.throws(
    () => parseFindResponse(envelope({
      teams: [],
      competitions: [],
      manifests: [],
      result: result({
        teamId: 'football:rs:neko-treci',
        futureFixtures: [],
        nextFixture: null,
        nextConfirmedFixture: null,
        coverage: [],
      }),
    })),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'neizborni tim prošao uz prazne imenike',
  );
});

test('duplirani ključevi imenika se odbijaju', () => {
  const dupe = envelope({
    teams: [
      {
        id: TEAM, sport: 'football', name: 'FK Crvena zvezda', shortName: 'Crvena zvezda',
        country: 'RS', city: 'Beograd', aliases: ['Zvezda'], providerIds: {},
      },
      {
        id: TEAM, sport: 'football', name: 'FK Crvena zvezda', shortName: 'Crvena zvezda',
        country: 'RS', city: 'Beograd', aliases: ['Zvezda'], providerIds: {},
      },
    ],
  });
  assert.throws(
    () => parseFindResponse(dupe),
    (error: unknown) => error instanceof ScheduleApiError && error.code === 'wrong-response',
    'dupliran tim prošao',
  );
});
