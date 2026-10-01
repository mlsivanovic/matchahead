import { isSelectableTeamId } from '../../../../packages/domain/src/selectable-teams.ts';
import type { FindFixturesResult } from '../../../../packages/domain/src/find-fixtures.ts';
import {
  FIND_FIXTURES_HTTP_PATH,
  INITIAL_SEASON_ID,
  type FindFixturesHttpSuccess,
  type FindFixturesResponseKind,
  type ScheduleChangeKind,
} from '../../../../packages/domain/src/schedule-api.ts';
import type {
  Competition,
  CompetitionScope,
  CoverageStatus,
  CoverageVerdict,
  Fixture,
  FixtureStatus,
  PublicationRights,
  ScheduleAvailability,
  SourceManifest,
  Sport,
  Team,
  TimePrecision,
} from '../../../../packages/domain/src/types.ts';

/**
 * Faza 05: tipizovani HTTP klijent za POST /api/find-fixtures.
 * HTTP omotač (FindFixturesHttpSuccess i srodnici) živi u
 * packages/domain/src/schedule-api.ts (Grok); ovaj modul nosi samo
 * transport, strogu validaciju odgovora i mapiranje grešaka.
 * Nijedan sportski host se ne zove iz browsera: jedini URL je
 * konfigurisani serverski base + /api/find-fixtures (kod, ne korisnik).
 */

export type { FindFixturesHttpSuccess, FindFixturesResponseKind };
export { FIND_FIXTURES_HTTP_PATH, INITIAL_SEASON_ID };

export const FIND_TIMEOUT_MS = 20000;

export type ScheduleApiFailureCode =
  | 'unconfigured'
  | 'bad-request'
  | 'offline'
  | 'timeout'
  | 'unauthorized'
  | 'throttled'
  | 'aborted'
  | 'server'
  | 'wrong-response';

export class ScheduleApiError extends Error {
  readonly code: ScheduleApiFailureCode;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(code: ScheduleApiFailureCode, message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ScheduleApiError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function validateFindRequest(input: { sport: Sport; teamId: string; seasonId: string }): void {
  if (input.sport !== 'football' && input.sport !== 'basketball') {
    throw new ScheduleApiError('bad-request', 'Sport mora biti football ili basketball.');
  }
  if (!isSelectableTeamId(input.teamId, input.sport)) {
    throw new ScheduleApiError('bad-request', 'U ovoj verziji mogu se izabrati samo Crvena zvezda i Partizan.');
  }
  if (input.seasonId !== INITIAL_SEASON_ID) {
    throw new ScheduleApiError('bad-request', 'Sezona za ovu verziju je 2026-2027.');
  }
}

/**
 * Jedini validator adrese servera: koriste ga i config i klijent.
 * HTTPS uvek; HTTP samo loopback za lokalnu proveru jer Bearer token
 * ne sme preko javnog HTTP-a. Bez kredencijala, upita i fragmenta.
 */
export function normalizeApiBaseUrl(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').trim().replace(/\/+$/, '');
  if (!cleaned) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.protocol === 'http:') {
    const host = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null;
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fail(path: string): never {
  throw new ScheduleApiError('wrong-response', `Server je vratio neispravan odgovor (${path}).`);
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path);
  return value as string;
}

function asNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return asString(value, path);
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path);
  return value as boolean;
}

function asNullableBoolean(value: unknown, path: string): boolean | null {
  if (value === null) return null;
  return asBoolean(value, path);
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path);
  return value as number;
}

/** Ceo broj >= 0: revizije, brojači zahteva, pragovi sati. Revizija 0 je početni snimak. */
function asNonNegativeInt(value: unknown, path: string): number {
  const candidate = asNumber(value, path);
  if (!Number.isInteger(candidate) || candidate < 0) fail(path);
  return candidate;
}

function asNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  return asNumber(value, path);
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** Stvaran kalendarski datum, ne samo oblik: 2026-02-30 i 13. mesec otpadaju. */
export function isRealCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Strog ISO trenutak sa zonom; datum mora biti stvaran, ne normalizovan.
 * Date.parse sam („sutra” odbija, ali preliv 25:00 ili 02-30 ćuti) nije dovoljan.
 */
export function isStrictInstant(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/.exec(text);
  if (!match) return false;
  if (!isRealCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 60) return false;
  return Number.isFinite(Date.parse(text));
}

function asInstant(value: unknown, path: string): string {
  const text = asString(value, path);
  if (!isStrictInstant(text)) fail(path);
  return text;
}

function asNullableInstant(value: unknown, path: string): string | null {
  if (value === null) return null;
  return asInstant(value, path);
}

function asLocalDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  const text = asString(value, path);
  if (!isRealCalendarDate(text)) fail(path);
  return text;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(path);
  return value as T;
}

const SPORTS: readonly Sport[] = ['football', 'basketball'];
const STATUSES: readonly FixtureStatus[] = [
  'scheduled', 'time_tbd', 'postponed', 'cancelled', 'live', 'finished', 'abandoned',
];
const VERDICTS: readonly CoverageVerdict[] = ['confirmed', 'uncovered', 'unverified'];
const AVAILABILITY: readonly ScheduleAvailability[] = [
  'published', 'unpublished', 'source_error', 'not_participant', 'unknown',
];
const PRECISION: readonly TimePrecision[] = ['utc_confirmed', 'date_only', 'unconfirmed_clock', 'unknown'];
const PUBLICATION: readonly PublicationRights[] = ['allowed', 'restricted', 'forbidden', 'unknown'];
const SCOPES: readonly CompetitionScope[] = ['domestic', 'regional', 'european', 'friendly', 'other'];
const CHANGE_KINDS: readonly ScheduleChangeKind[] = ['new', 'rescheduled', 'postponed', 'cancelled'];
const RESPONSE_KINDS: readonly FindFixturesResponseKind[] = ['verified-schedule', 'source-blocked', 'synthetic-demo'];

/**
 * Izvorni URL: proverene utakmice traže javni HTTPS bez kredencijala.
 * Sintetički režim sme sintetičku shemu, ali nikad javascript:.
 */
function asFixtureSourceUrl(value: unknown, path: string, kind: FindFixturesResponseKind): string {
  const text = asString(value, path);
  if (/^\s*javascript:/i.test(text)) fail(path);
  if (kind === 'synthetic-demo') {
    if (/\s/.test(text)) fail(path);
    return text;
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    fail(path);
    throw new Error('nedostižno');
  }
  if (parsed.protocol !== 'https:') fail(path);
  if (parsed.username || parsed.password) fail(path);
  return text;
}

/** Vremenska konzistentnost jedne utakmice: nikad ponoć kao zamena za nepoznat sat. */
function assertFixtureTimeConsistency(fixture: Pick<Fixture, 'startsAtUtc' | 'timeConfirmed' | 'status' | 'scheduledLocalDate'>, path: string): void {
  if (fixture.timeConfirmed) {
    if (fixture.startsAtUtc === null) fail(`${path}.startsAtUtc`);
    if (fixture.status === 'time_tbd') fail(`${path}.status`);
  } else if (fixture.startsAtUtc !== null) {
    fail(`${path}.startsAtUtc`);
  }
  if (fixture.status === 'time_tbd' && fixture.startsAtUtc !== null) fail(`${path}.startsAtUtc`);
  if (fixture.startsAtUtc !== null && /T00:00:00(?:\.000)?Z$/.test(fixture.startsAtUtc) && fixture.status === 'time_tbd') {
    fail(`${path}.startsAtUtc`);
  }
}

function parseFixture(value: unknown, path: string, kind: FindFixturesResponseKind): Fixture {
  if (!isRecord(value)) fail(path);
  const startsAtUtc = asNullableInstant(value.startsAtUtc, `${path}.startsAtUtc`);
  const timeConfirmed = asBoolean(value.timeConfirmed, `${path}.timeConfirmed`);
  const status = asEnum(value.status, STATUSES, `${path}.status`);
  const parsed: Fixture = {
    id: asString(value.id, `${path}.id`),
    sport: asEnum(value.sport, SPORTS, `${path}.sport`),
    competitionId: asString(value.competitionId, `${path}.competitionId`),
    seasonId: asString(value.seasonId, `${path}.seasonId`),
    homeTeamId: asString(value.homeTeamId, `${path}.homeTeamId`),
    awayTeamId: asNullableString(value.awayTeamId, `${path}.awayTeamId`),
    startsAtUtc,
    scheduledLocalDate: asLocalDate(value.scheduledLocalDate, `${path}.scheduledLocalDate`),
    sourceTimeZone: asNullableString(value.sourceTimeZone, `${path}.sourceTimeZone`),
    timeConfirmed,
    previousStartsAtUtc: asNullableInstant(value.previousStartsAtUtc, `${path}.previousStartsAtUtc`),
    previousScheduledLocalDate: asLocalDate(value.previousScheduledLocalDate, `${path}.previousScheduledLocalDate`),
    status,
    venue: asNullableString(value.venue, `${path}.venue`),
    round: asNullableString(value.round, `${path}.round`),
    sourceUrl: asFixtureSourceUrl(value.sourceUrl, `${path}.sourceUrl`, kind),
    provider: asString(value.provider, `${path}.provider`),
    providerFixtureId: asNullableString(value.providerFixtureId, `${path}.providerFixtureId`),
    fetchedAt: asInstant(value.fetchedAt, `${path}.fetchedAt`),
    sourceUpdatedAt: asNullableInstant(value.sourceUpdatedAt, `${path}.sourceUpdatedAt`),
    contentHash: asString(value.contentHash, `${path}.contentHash`),
    revision: asNonNegativeInt(value.revision, `${path}.revision`),
  };
  assertFixtureTimeConsistency(parsed, path);
  return parsed;
}

function parseCoverage(value: unknown, path: string): CoverageStatus {
  if (!isRecord(value)) fail(path);
  return {
    id: asString(value.id, `${path}.id`),
    teamId: asNullableString(value.teamId, `${path}.teamId`),
    competitionId: asString(value.competitionId, `${path}.competitionId`),
    seasonId: asString(value.seasonId, `${path}.seasonId`),
    provider: asString(value.provider, `${path}.provider`),
    providerCompetitionId: asNullableString(value.providerCompetitionId, `${path}.providerCompetitionId`),
    verdict: asEnum(value.verdict, VERDICTS, `${path}.verdict`),
    scheduleAvailability: asEnum(value.scheduleAvailability, AVAILABILITY, `${path}.scheduleAvailability`),
    freeAccessConfirmed: asNullableBoolean(value.freeAccessConfirmed, `${path}.freeAccessConfirmed`),
    futureFixturesAvailable: asNullableBoolean(value.futureFixturesAvailable, `${path}.futureFixturesAvailable`),
    timePrecision: value.timePrecision === null
      ? null
      : asEnum(value.timePrecision, PRECISION, `${path}.timePrecision`),
    postponementObserved: asNullableBoolean(value.postponementObserved, `${path}.postponementObserved`),
    cancellationObserved: asNullableBoolean(value.cancellationObserved, `${path}.cancellationObserved`),
    publication: asEnum(value.publication, PUBLICATION, `${path}.publication`),
    requestsPerRefresh: value.requestsPerRefresh === null
      ? null
      : asNonNegativeInt(value.requestsPerRefresh, `${path}.requestsPerRefresh`),
    evidence: asString(value.evidence, `${path}.evidence`),
    checkedAt: asNullableString(value.checkedAt, `${path}.checkedAt`),
  };
}

function parseTeam(value: unknown, path: string): Team {
  if (!isRecord(value)) fail(path);
  if (!Array.isArray(value.aliases)) fail(`${path}.aliases`);
  if (!isRecord(value.providerIds)) fail(`${path}.providerIds`);
  return {
    id: asString(value.id, `${path}.id`),
    sport: asEnum(value.sport, SPORTS, `${path}.sport`),
    name: asString(value.name, `${path}.name`),
    shortName: asString(value.shortName, `${path}.shortName`),
    country: asString(value.country, `${path}.country`),
    city: asString(value.city, `${path}.city`),
    aliases: (value.aliases as unknown[]).map((alias, index) => asString(alias, `${path}.aliases[${index}]`)),
    providerIds: value.providerIds as Record<string, string>,
  };
}

function parseCompetition(value: unknown, path: string): Competition {
  if (!isRecord(value)) fail(path);
  if (!Array.isArray(value.aliases)) fail(`${path}.aliases`);
  if (!isRecord(value.providerIds)) fail(`${path}.providerIds`);
  return {
    id: asString(value.id, `${path}.id`),
    sport: asEnum(value.sport, SPORTS, `${path}.sport`),
    name: asString(value.name, `${path}.name`),
    scope: asEnum(value.scope, SCOPES, `${path}.scope`),
    country: asNullableString(value.country, `${path}.country`),
    aliases: (value.aliases as unknown[]).map((alias, index) => asString(alias, `${path}.aliases[${index}]`)),
    providerIds: value.providerIds as Record<string, string>,
  };
}

function parseManifest(value: unknown, path: string): SourceManifest {
  if (!isRecord(value)) fail(path);
  return {
    provider: asString(value.provider, `${path}.provider`),
    competitionId: asString(value.competitionId, `${path}.competitionId`),
    seasonId: asString(value.seasonId, `${path}.seasonId`),
    lastAttemptAt: asNullableInstant(value.lastAttemptAt, `${path}.lastAttemptAt`),
    lastSuccessAt: asNullableInstant(value.lastSuccessAt, `${path}.lastSuccessAt`),
    lastChangeAt: asNullableInstant(value.lastChangeAt, `${path}.lastChangeAt`),
    staleAfterHours: asNumber(value.staleAfterHours, `${path}.staleAfterHours`),
  };
}

function parseArray<T>(value: unknown, path: string, item: (entry: unknown, entryPath: string) => T): T[] {
  if (!Array.isArray(value)) fail(path);
  return (value as unknown[]).map((entry, index) => item(entry, `${path}[${index}]`));
}

function parseResult(value: unknown, kind: FindFixturesResponseKind): FindFixturesResult {
  if (!isRecord(value)) fail('result');
  const cacheStatus = asEnum(
    value.cacheStatus, ['fetched', 'reused', 'throttled'] as const, 'result.cacheStatus',
  );
  return {
    teamId: asString(value.teamId, 'result.teamId'),
    sport: asEnum(value.sport, SPORTS, 'result.sport'),
    seasonId: asString(value.seasonId, 'result.seasonId'),
    cacheStatus,
    upstreamRequests: asNonNegativeInt(value.upstreamRequests, 'result.upstreamRequests'),
    // null dok nijedan dozvoljen feed nije objavio snimak: nije „pre sat vremena”.
    checkedAt: asNullableInstant(value.checkedAt, 'result.checkedAt'),
    lastAttemptAt: asNullableInstant(value.lastAttemptAt, 'result.lastAttemptAt'),
    lastSuccessAt: asNullableInstant(value.lastSuccessAt, 'result.lastSuccessAt'),
    claimsNoMatches: value.claimsNoMatches === false ? false : fail('result.claimsNoMatches'),
    futureFixtures: parseArray(value.futureFixtures, 'result.futureFixtures', (entry, entryPath) => parseFixture(entry, entryPath, kind)),
    nextFixture: value.nextFixture === null ? null : parseFixture(value.nextFixture, 'result.nextFixture', kind),
    nextConfirmedFixture: value.nextConfirmedFixture === null
      ? null
      : parseFixture(value.nextConfirmedFixture, 'result.nextConfirmedFixture', kind),
    coverage: parseArray(value.coverage, 'result.coverage', parseCoverage),
  };
}

/**
 * Semantički odnosi preko celog odgovora: sport/tim/sezona moraju da se
 * poklapaju, takmičenja i učesnici moraju da postoje u imenicima, next
 * pokazivači moraju da pokazuju na uređeni vraćeni spisak, a provereni
 * režim ne sme da nosi zabranjenu objavu ni sintetičke tragove.
 */
function assertSemanticRelations(parsed: FindFixturesHttpSuccess): void {
  const { result, teams, competitions, manifests } = parsed;
  const competitionById = new Map(competitions.map((competition) => [competition.id, competition]));
  for (const team of teams) {
    if (team.sport !== result.sport) fail(`teams (${team.id}: sport tima i odgovora se ne poklapaju)`);
  }
  for (const competition of competitions) {
    if (competition.sport !== result.sport) fail(`competitions (${competition.id}: sport takmičenja i odgovora se ne poklapaju)`);
  }
  const requested = teams.find((team) => team.id === result.teamId);
  if (teams.length > 0 && !requested) fail('teams (nedostaje traženi tim)');
  if (requested && requested.sport !== result.sport) fail('teams (sport traženog tima i odgovora se ne poklapaju)');
  for (let index = 0; index < result.futureFixtures.length; index += 1) {
    const fixture = result.futureFixtures[index]!;
    const path = `result.futureFixtures[${index}]`;
    if (fixture.sport !== result.sport) fail(`${path}.sport`);
    if (fixture.seasonId !== result.seasonId) fail(`${path}.seasonId`);
    if (fixture.homeTeamId !== result.teamId && fixture.awayTeamId !== result.teamId) {
      fail(`${path} (utakmica ne pripada traženom timu)`);
    }
    if (!competitionById.has(fixture.competitionId)) fail(`${path}.competitionId`);
  }
  for (let index = 0; index < result.coverage.length; index += 1) {
    const row = result.coverage[index]!;
    const path = `result.coverage[${index}]`;
    if (row.teamId !== null && row.teamId !== result.teamId) fail(`${path}.teamId`);
    if (row.seasonId !== result.seasonId) fail(`${path}.seasonId`);
    if (!row.competitionId) fail(`${path}.competitionId`);
  }
  for (let index = 0; index < manifests.length; index += 1) {
    const manifest = manifests[index]!;
    const path = `manifests[${index}]`;
    if (manifest.seasonId !== result.seasonId) fail(`${path}.seasonId`);
    if (!manifest.competitionId) fail(`${path}.competitionId`);
  }
  // Next pokazivači moraju da pokazuju na uređeni vraćeni spisak, ne na izmišljen red.
  const { futureFixtures, nextFixture, nextConfirmedFixture } = result;
  if (futureFixtures.length === 0) {
    if (nextFixture !== null) fail('result.nextFixture');
    if (nextConfirmedFixture !== null) fail('result.nextConfirmedFixture');
  } else {
    if (nextFixture === null || nextFixture.id !== futureFixtures[0]!.id) fail('result.nextFixture');
    const firstConfirmed = futureFixtures.find((fixture) => fixture.timeConfirmed) ?? null;
    if (firstConfirmed === null) {
      if (nextConfirmedFixture !== null) fail('result.nextConfirmedFixture');
    } else if (nextConfirmedFixture === null || nextConfirmedFixture.id !== firstConfirmed.id) {
      fail('result.nextConfirmedFixture');
    }
  }
  if (parsed.kind === 'verified-schedule') {
    for (const row of result.coverage) {
      if (row.publication === 'forbidden') fail('result.coverage (zabranjena objava uz provereni režim)');
    }
    for (const fixture of result.futureFixtures) {
      if (fixture.provider === 'demo') fail('result.futureFixtures (sintetički trag uz provereni režim)');
    }
  }
}

/** Stroga provera uspešnog tela; pogrešan oblik je greška, ne prazan prikaz. */
export function parseFindResponse(value: unknown): FindFixturesHttpSuccess {
  if (!isRecord(value)) fail('telo');
  const kind = asEnum(value.kind, RESPONSE_KINDS, 'kind');
  const result = parseResult(value.result, kind);
  const parsed: FindFixturesHttpSuccess = {
    kind,
    result,
    teams: parseArray(value.teams, 'teams', parseTeam),
    competitions: parseArray(value.competitions, 'competitions', parseCompetition),
    manifests: parseArray(value.manifests, 'manifests', parseManifest),
    changes: parseArray(value.changes, 'changes', (entry, entryPath) => {
      if (!isRecord(entry)) fail(entryPath);
      const fixtureId = asString(entry.fixtureId, `${entryPath}.fixtureId`);
      if (!fixtureId) fail(`${entryPath}.fixtureId`);
      return {
        fixtureId,
        revision: asNonNegativeInt(entry.revision, `${entryPath}.revision`),
        kind: asEnum(entry.kind, CHANGE_KINDS, `${entryPath}.kind`),
      };
    }),
  };
  assertSemanticRelations(parsed);
  return parsed;
}

function serverMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  if (typeof code !== 'string' || typeof message !== 'string' || !message) return null;
  return `${code}: ${message}`.slice(0, 300);
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds, 3600) * 1000;
}

export interface PostFindFixturesInput {
  sport: Sport;
  teamId: string;
  seasonId: string;
  refresh: boolean;
  baseUrl: string | null | undefined;
  /** Firebase ID token; null dok korisnik nije prijavljen. Nikad ne ide u URL ni log. */
  idToken: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  online?: boolean;
  /** Spoljni prekid (zamena naloga). Prekinut zahtev se nikad ne upisuje. */
  signal?: AbortSignal;
}

/**
 * Jedini mrežni poziv faze 05 iz browsera: POST na konfigurisani server.
 * Bez periodičnog pozivanja — zove ga isključivo klik.
 *
 * Rok (20 s) i spoljni prekid važe do kraja čitanja tela i validacije,
 * ne samo dok zaglavlja stignu: zaglavlja 200 pa viseće telo daju timeout,
 * a odjava posle zaglavlja daje abort koji se nikad ne upisuje. Trka
 * `Promise.race` štiti i kada mock/fetch ignoriše signal, pa UI nikad ne
 * čeka beskonačnu promise; tajmer i listener se čiste tek na samom kraju.
 */
export async function postFindFixtures(input: PostFindFixturesInput): Promise<FindFixturesHttpSuccess> {
  validateFindRequest(input);
  const base = normalizeApiBaseUrl(input.baseUrl);
  if (!base) {
    throw new ScheduleApiError('unconfigured', 'Server rasporeda nije podešen. Pronalaženje nije dostupno.');
  }
  if (input.online === false) {
    throw new ScheduleApiError('offline', 'Nema mreže. Prikaz je iz poslednjeg sačuvanog stanja.');
  }
  if (input.signal?.aborted) {
    throw new ScheduleApiError('aborted', 'Zahtev je prekinut pre slanja.');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? FIND_TIMEOUT_MS;
  const controller = new AbortController();
  const externallyAborted = () => input.signal?.aborted === true;
  let timedOut = false;
  let rejectDeadline: (reason: ScheduleApiError) => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const onExternalAbort = () => {
    try {
      controller.abort();
    } catch {
      // Prekid je signal, ne greška pozivaoca.
    }
    rejectDeadline(new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.'));
  };
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      controller.abort();
    } catch {
      // Tajmer je signal, ne greška pozivaoca.
    }
    rejectDeadline(new ScheduleApiError('timeout', 'Server nije odgovorio na vreme. Prikaz je iz poslednjeg sačuvanog stanja.'));
  }, timeoutMs);
  if (input.signal) {
    input.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const failureOf = (reason: unknown): ScheduleApiError => {
    if (reason instanceof ScheduleApiError) return reason;
    if (externallyAborted()) {
      return new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.');
    }
    if (timedOut || (reason instanceof DOMException && reason.name === 'AbortError')) {
      return new ScheduleApiError('timeout', 'Server nije odgovorio na vreme. Prikaz je iz poslednjeg sačuvanog stanja.');
    }
    return new ScheduleApiError(
      'server',
      'Server rasporeda nije dostupan. Prikaz je iz poslednjeg sačuvanog stanja.',
    );
  };
  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetchImpl(`${base}${FIND_FIXTURES_HTTP_PATH}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(input.idToken ? { authorization: `Bearer ${input.idToken}` } : {}),
          },
          body: JSON.stringify({
            sport: input.sport,
            teamId: input.teamId,
            seasonId: input.seasonId,
            refresh: input.refresh,
          }),
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch (reason) {
      throw failureOf(reason);
    }
    if (externallyAborted()) {
      throw new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ScheduleApiError('unauthorized', 'Prijava je potrebna za pronalaženje. Prijavi se pa pokušaj ponovo.', response.status);
    }
    if (response.status === 429) {
      const wait = retryAfterMs(response.headers.get('retry-after'));
      throw new ScheduleApiError(
        'throttled',
        wait !== null
          ? `Previše osvežavanja. Pokušaj ponovo za ${Math.ceil(wait / 1000)} s.`
          : 'Previše osvežavanja. Pokušaj ponovo kasnije.',
        response.status,
        wait,
      );
    }
    let body: unknown = null;
    try {
      body = await Promise.race([response.json(), deadline]);
    } catch (reason) {
      if (reason instanceof ScheduleApiError) throw reason;
      if (externallyAborted() || timedOut) throw failureOf(reason);
      // Nečitljivo telo nije mrežni pad: dalje odlučuju status i validator.
      body = null;
    }
    if (externallyAborted()) {
      throw new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.');
    }
    if (!response.ok) {
      throw new ScheduleApiError('server', serverMessage(body) ?? `Server je vratio status ${response.status}.`, response.status);
    }
    return parseFindResponse(body);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onExternalAbort);
  }
}
