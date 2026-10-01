import { DEFAULT_ON_DEMAND_POLICY } from '../../../packages/domain/src/find-fixtures.ts';
import {
  FIND_FIXTURES_HTTP_PATH,
  findFixtures,
  findFixturesHttpStatus,
  readFindFixturesHttpRequest,
} from '../../../packages/domain/src/index.ts';
import {
  isSelectableTeamId,
  type CompetitionFeed,
  type FindCacheRecord,
  type FindFixturesHttpError,
  type FindFixturesHttpSuccess,
  type FindFixturesResponseKind,
  type FindFixturesResult,
  type ScheduleChange,
  type SourceManifest,
  type Sport,
  type Team,
} from '../../../packages/domain/src/index.ts';
import type { TokenVerifier } from './auth-claims.ts';
import { diffFixtures } from './changes.ts';
import { teamById } from './catalog.ts';
import type { Clock } from './clock.ts';
import { todayLocalDate } from './clock.ts';
import { PRODUCTION_ID_MAPPINGS, applyIdMapping, type IdMapping } from './names.ts';
import type { SchedulePersistence } from './persistence.ts';
import type { QuotaDeny, QuotaGate } from './quota-logic.ts';
import type { FeedLoad, FeedSource } from './sources/types.ts';

export const MAX_BODY_BYTES = 4096;
const SECRET_QUERY = new Set(['token', 'key', 'secret', 'access_token', 'id_token', 'refresh_token']);

export interface ScheduleLog {
  status: number;
  code: string | null;
  teamId: string | null;
}

export interface IncomingRequest {
  method: string;
  path: string;
  origin: string | null;
  authorization: string | null;
  queryKeys: string[];
  bodyText: string;
  remoteAddress: string;
}

export interface OutgoingResponse {
  status: number;
  body: FindFixturesHttpSuccess | FindFixturesHttpError | null;
  headers: Record<string, string>;
}

export interface ScheduleDeps {
  clock: Clock;
  verifier: TokenVerifier;
  store: SchedulePersistence;
  quota: QuotaGate;
  source: FeedSource;
  origins: readonly string[];
  mode: 'production' | 'synthetic';
  logger: (event: ScheduleLog) => void;
  idMappings?: readonly IdMapping[];
  trustProxy?: boolean;
}

/** Odbija poznat loš metod, putanju, poreklo ili token u URL-u pre čitanja tela. */
export function ingressDecision(input: {
  method: string;
  path: string;
  origin: string | null;
  queryKeys: readonly string[];
  origins: readonly string[];
}): OutgoingResponse | null {
  const cors = corsHeaders(input.origin, input.origins);
  if (input.origin !== null && !input.origins.includes(input.origin)) {
    return finishEarly(403, 'forbidden_origin', 'Poreklo nije na listi.', cors);
  }
  if (input.method === 'OPTIONS') {
    return { status: 204, body: null, headers: { ...cors, allow: 'POST' } };
  }
  if (input.method !== 'POST') {
    return finishEarly(405, 'method_not_allowed', 'Dozvoljen je samo POST.', cors);
  }
  if (input.path !== FIND_FIXTURES_HTTP_PATH) {
    return finishEarly(404, 'not_found', 'Nepoznata putanja.', cors);
  }
  if (input.queryKeys.some((key) => SECRET_QUERY.has(key.toLowerCase()))) {
    return finishEarly(401, 'unauthorized', 'Token ne sme biti u URL-u.', cors);
  }
  return null;
}

function finishEarly(
  status: number,
  code: FindFixturesHttpError['error']['code'],
  message: string,
  cors: Record<string, string>,
): OutgoingResponse {
  return {
    status,
    body: { error: { code, message } },
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors,
    },
  };
}

export function assertScheduleMode(mode: string, nodeEnv: string | undefined): 'production' | 'synthetic' {
  if (mode !== 'production' && mode !== 'synthetic') {
    throw new Error('SCHEDULE_MODE mora biti production ili synthetic.');
  }
  if (mode === 'synthetic' && nodeEnv === 'production') {
    throw new Error('SCHEDULE_MODE=synthetic nije dozvoljen kada je NODE_ENV=production.');
  }
  return mode;
}

export function responseKind(mode: 'production' | 'synthetic', result: FindFixturesResult): FindFixturesResponseKind {
  if (mode === 'synthetic') return 'synthetic-demo';
  const published = result.coverage.some((row) => row.publication === 'allowed' && row.scheduleAvailability === 'published');
  return published ? 'verified-schedule' : 'source-blocked';
}

export function policyFingerprint(feeds: readonly Pick<CompetitionFeed, 'competitionId' | 'provider' | 'publication'>[]): string {
  return feeds
    .map((feed) => `${feed.competitionId}\t${feed.provider}\t${feed.publication}`)
    .sort()
    .join('\n');
}

export function shouldSkipNetwork(cached: FindCacheRecord | null, now: string, refresh: boolean): boolean {
  if (!cached) return false;
  const successAt = cached.lastSuccessAt ?? null;
  const successAge = successAt === null ? null : minutesBetween(successAt, now);
  const attemptAt = cached.lastAttemptAt ?? cached.storedAt;
  const attemptAge = minutesBetween(attemptAt, now);
  const withinReuse =
    !refresh && successAge !== null && successAge >= 0 && successAge < DEFAULT_ON_DEMAND_POLICY.reuseWithinMinutes;
  const throttled =
    attemptAge !== null &&
    attemptAge >= 0 &&
    attemptAge < DEFAULT_ON_DEMAND_POLICY.minRefreshMinutes &&
    (refresh || successAt === null);
  return withinReuse || throttled;
}

export class ScheduleService {
  deps: ScheduleDeps;

  constructor(deps: ScheduleDeps) {
    this.deps = deps;
  }

  async handle(input: IncomingRequest): Promise<OutgoingResponse> {
    const cors = corsHeaders(input.origin, this.deps.origins);
    const finish = (status: number, body: OutgoingResponse['body'], code: string | null, teamId: string | null): OutgoingResponse => {
      this.deps.logger({ status, code, teamId });
      return {
        status,
        body,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          ...cors,
        },
      };
    };
    if (input.origin !== null && !this.deps.origins.includes(input.origin)) {
      return finish(403, errorBody('forbidden_origin', 'Poreklo nije na listi.'), 'forbidden_origin', null);
    }
    if (input.method === 'OPTIONS') {
      return { status: 204, body: null, headers: { ...cors, allow: 'POST' } };
    }
    if (input.method !== 'POST') {
      return finish(405, errorBody('method_not_allowed', 'Dozvoljen je samo POST.'), 'method_not_allowed', null);
    }
    if (input.path !== FIND_FIXTURES_HTTP_PATH) {
      return finish(404, errorBody('not_found', 'Nepoznata putanja.'), 'not_found', null);
    }
    if (input.queryKeys.some((key) => SECRET_QUERY.has(key.toLowerCase()))) {
      return finish(401, errorBody('unauthorized', 'Token ne sme biti u URL-u.'), 'unauthorized', null);
    }
    if (utf8Size(input.bodyText) > MAX_BODY_BYTES) {
      return finish(400, errorBody('payload_too_large', 'Telo zahteva je preveliko.'), 'payload_too_large', null);
    }

    const nowDate = this.deps.clock.now();
    const ip = input.remoteAddress || 'unknown';
    if (this.deps.quota.authBlocked(ip, nowDate)) {
      return finish(429, errorBody('quota_ip', 'Previše neuspelih prijava sa ove adrese.'), 'quota_ip', null);
    }
    const bearer = /^Bearer (\S+)$/.exec(input.authorization ?? '');
    if (!bearer) {
      this.deps.quota.recordAuthFailure(ip, nowDate);
      return finish(401, errorBody('unauthorized', 'Potrebna je prijava.'), 'unauthorized', null);
    }
    let uid: string;
    try {
      uid = (await this.deps.verifier.verify(bearer[1] ?? '')).uid;
    } catch {
      this.deps.quota.recordAuthFailure(ip, nowDate);
      return finish(401, errorBody('unauthorized', 'Prijava nije prihvaćena.'), 'unauthorized', null);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.bodyText) as unknown;
    } catch {
      return finish(400, errorBody('invalid_json', 'Telo nije JSON.'), 'invalid_json', null);
    }
    const request = readFindFixturesHttpRequest(parsed);
    if (!request.ok) {
      return finish(findFixturesHttpStatus(request.error.code), { error: request.error }, request.error.code, null);
    }

    const team = teamById(request.request.teamId);
    const now = nowDate.toISOString();
    const today = todayLocalDate(nowDate);
    const cacheKey = `${team.id}:${request.request.seasonId}`;
    const described = await this.deps.source.load({
      team,
      seasonId: request.request.seasonId,
      now,
      todayLocalDate: today,
      network: false,
    });
    const skip = shouldSkipNetwork(this.deps.store.get(cacheKey), now, request.request.refresh);
    const taken = this.deps.quota.tryConsume({
      uid,
      ip,
      now: nowDate,
      fresh: !skip,
      upstream: skip ? 0 : described.upstreamPlan,
    });
    if (!taken.ok) {
      return finish(429, errorBody(taken.code, quotaMessage(taken.code)), taken.code, team.id);
    }

    const loaded = await this.loadForDecision(described, {
      team,
      seasonId: request.request.seasonId,
      now,
      todayLocalDate: today,
      skip,
    });
    const previous = this.deps.store.get(cacheKey)?.fixtures ?? [];
    let result: FindFixturesResult;
    try {
      result = findFixtures({
        team,
        query: {
          sport: request.request.sport,
          teamId: team.id,
          seasonId: request.request.seasonId,
          now,
          todayLocalDate: today,
          refresh: request.request.refresh,
        },
        feeds: loaded.feeds,
        cache: this.deps.store,
      });
    } catch {
      return finish(400, errorBody('invalid_body', 'Raspored nije mogao da se proveri.'), 'invalid_body', team.id);
    }

    const kind = responseKind(this.deps.mode, result);
    const stored = this.deps.store.get(cacheKey)?.fixtures ?? [];
    const changes = kind === 'source-blocked' ? [] : diffFixtures(previous, stored);
    this.deps.store.appendChanges(changes);
    this.deps.store.writePolicy(cacheKey, policyFingerprint(loaded.feeds));
    const storedManifests = skip ? this.deps.store.readManifests() : this.writeManifests(loaded, now, changes, stored);
    const manifests = manifestsForResponse(storedManifests, request.request.seasonId, loaded.competitions);
    const body: FindFixturesHttpSuccess = {
      kind,
      result,
      teams: teamsForResponse(team, loaded, result.futureFixtures),
      competitions: loaded.competitions,
      manifests,
      changes,
    };
    return finish(200, body, null, team.id);
  }

  async loadForDecision(
    described: FeedLoad,
    input: { team: FeedLoad['teams'][number]; seasonId: string; now: string; todayLocalDate: string; skip: boolean },
  ): Promise<FeedLoad> {
    const loaded = input.skip
      ? described
      : await this.deps.source.load({
          team: input.team,
          seasonId: input.seasonId,
          now: input.now,
          todayLocalDate: input.todayLocalDate,
          network: true,
        });
    const mappings = this.deps.idMappings ?? PRODUCTION_ID_MAPPINGS;
    const mapped = loaded.feeds.map((feed) => ({
      ...feed,
      pages: feed.pages.map((page) => ({
        ...page,
        fixtures: page.fixtures.map((draft) => applyIdMapping(draft, mappings)),
      })),
    }));
    if (this.deps.mode !== 'production') return { ...loaded, feeds: mapped };
    return {
      ...loaded,
      feeds: mapped.map((feed) => ({ ...feed, publication: 'unknown' as const, pages: [] })),
    };
  }

  writeManifests(
    loaded: FeedLoad,
    now: string,
    changes: readonly ScheduleChange[],
    fixtures: readonly { id: string; provider: string; competitionId: string }[],
  ): SourceManifest[] {
    const changed = new Set(
      changes.flatMap((change) => {
        const fixture = fixtures.find((item) => item.id === change.fixtureId);
        return fixture ? [`${fixture.provider}:${fixture.competitionId}`] : [];
      }),
    );
    const success = new Set(loaded.technicalSuccess);
    const prior = new Map(this.deps.store.readManifests().map((item) => [`${item.provider}:${item.competitionId}:${item.seasonId}`, item]));
    const next: SourceManifest[] = [];
    const seen = new Set<string>();
    for (const feed of loaded.feeds) {
      const key = `${feed.provider}:${feed.competitionId}:${feed.seasonId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = prior.get(key);
      const sourceKey = `${feed.provider}:${feed.competitionId}`;
      next.push({
        provider: feed.provider,
        competitionId: feed.competitionId,
        seasonId: feed.seasonId,
        lastAttemptAt: now,
        lastSuccessAt: success.has(sourceKey) ? now : (previous?.lastSuccessAt ?? null),
        lastChangeAt: changed.has(sourceKey) ? now : (previous?.lastChangeAt ?? null),
        staleAfterHours: 24,
      });
      prior.delete(key);
    }
    for (const rest of prior.values()) next.push(rest);
    this.deps.store.writeManifests(next);
    return next;
  }
}

function manifestsForResponse(
  manifests: readonly SourceManifest[],
  seasonId: string,
  competitions: readonly { id: string }[],
): SourceManifest[] {
  const catalog = new Set(competitions.map((item) => item.id));
  return manifests.filter((item) => item.seasonId === seasonId && catalog.has(item.competitionId));
}

function teamsForResponse(
  requested: Team,
  loaded: FeedLoad,
  fixtures: readonly { sport: Sport; homeTeamId: string; awayTeamId: string | null }[],
): Team[] {
  const byId = new Map<string, Team>();
  const add = (id: string, sport: Sport, preferred?: Team) => {
    if (byId.has(id)) return;
    byId.set(id, preferred?.id === id && preferred.sport === sport ? preferred : directoryTeam(id, sport));
  };
  add(requested.id, requested.sport, requested);
  for (const known of loaded.teams) add(known.id, known.sport, known);
  for (const fixture of fixtures) {
    add(fixture.homeTeamId, fixture.sport);
    if (fixture.awayTeamId) add(fixture.awayTeamId, fixture.sport);
  }
  for (const feed of loaded.feeds) {
    if (feed.publication !== 'allowed') continue;
    for (const page of feed.pages) {
      for (const draft of page.fixtures) {
        add(draft.homeTeamId, draft.sport);
        if (draft.awayTeamId) add(draft.awayTeamId, draft.sport);
      }
    }
  }
  return [...byId.values()];
}

function directoryTeam(id: string, sport: Sport): Team {
  if (isSelectableTeamId(id, sport)) return teamById(id);
  const parts = id.split(':');
  const country = parts.length === 3 && parts[0] === sport ? parts[1] ?? '' : '';
  const slug = parts.length === 3 && parts[0] === sport ? parts[2] ?? id : id;
  return {
    id,
    sport,
    name: slug,
    shortName: slug,
    country,
    city: '',
    aliases: [],
    providerIds: {},
  };
}

function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    vary: 'Origin',
  };
}

function errorBody(code: FindFixturesHttpError['error']['code'], message: string): FindFixturesHttpError {
  return { error: { code, message } };
}

function quotaMessage(code: QuotaDeny): string {
  if (code === 'quota_global') return 'Globalni dnevni plafon izvora je dostignut.';
  if (code === 'quota_ip') return 'Dnevni plafon za ovu adresu je dostignut.';
  return 'Dnevni plafon za ovaj nalog je dostignut.';
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function minutesBetween(earlierIso: string, laterIso: string): number | null {
  const delta = Date.parse(laterIso) - Date.parse(earlierIso);
  if (Number.isNaN(delta)) return null;
  return delta / 60_000;
}
