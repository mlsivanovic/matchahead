import { fixtureIdFromProvider } from './identity.ts';
import { applyObservedFixture, assessFetch } from './normalize.ts';
import { isSelectableTeamId } from './selectable-teams.ts';
import { isUntrustedKickoffClock, timeErrors } from './time.ts';
import type {
  CoverageStatus,
  FetchFailureKind,
  Fixture,
  FixtureStatus,
  PublicationRights,
  ScheduleAvailability,
  Sport,
  Team,
  TimePrecision,
} from './types.ts';

/**
 * Jedan klik „Pronađi utakmice”. Nema mreže: ulaz su već prikupljeni,
 * jasno označeni odgovori. Prava izvora proverava pozivalac pre nego što
 * feed označi sa publication `allowed`.
 */

export interface ObservedFixtureDraft {
  sport: Sport;
  competitionId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  scheduledLocalDate: string | null;
  /** Sat kako je odštampan, HH:MM ili HH:MM:SS, ili null. */
  printedLocalTime: string | null;
  startsAtUtc: string | null;
  sourceTimeZone: string | null;
  sourceClaimsTimeConfirmed: boolean;
  status: FixtureStatus;
  venue: string | null;
  round: string | null;
  sourceUrl: string;
  provider: string;
  providerFixtureId: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  previousStartsAtUtc: string | null;
  previousScheduledLocalDate: string | null;
}

export interface CompetitionFeed {
  competitionId: string;
  seasonId: string;
  provider: string;
  providerCompetitionId: string | null;
  publication: PublicationRights;
  organizerMarkedUnpublished: boolean;
  teamNotInCompetition: boolean;
  failure: FetchFailureKind;
  totalPages: number;
  pages: Array<{ page: number; fixtures: ObservedFixtureDraft[] }>;
  evidence: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface FindFixturesQuery {
  sport: Sport;
  teamId: string;
  seasonId: string;
  /** Trenutak klika, ISO sa zonom. */
  now: string;
  /** Lokalni dan korisnika YYYY-MM-DD. Služi samo poređenju datuma bez sata. */
  todayLocalDate: string;
  /** „Osveži raspored”. I dalje važi najkraći razmak. */
  refresh: boolean;
}

export interface OnDemandCachePolicy {
  /** Ponovi isti odgovor dok je mlađi od ovoga, bez novog poziva. */
  reuseWithinMinutes: number;
  /** Ni ručno osvežavanje ne zove izvor češće od ovoga. */
  minRefreshMinutes: number;
}

export type FindCacheStatus = 'fetched' | 'reused' | 'throttled';

export interface FindCacheRecord {
  key: string;
  storedAt: string;
  fixtures: Fixture[];
  coverage: CoverageStatus[];
}

export interface FindCacheStore {
  get(key: string): FindCacheRecord | null;
  set(key: string, record: FindCacheRecord): void;
}

export interface FindFixturesResult {
  teamId: string;
  sport: Sport;
  seasonId: string;
  cacheStatus: FindCacheStatus;
  upstreamRequests: number;
  /** Trenutak poslednjeg stvarnog čitanja izvora, ne trenutak čitanja keša. */
  checkedAt: string;
  /** Prazan odgovor nikad ne postaje tvrdnja da utakmica nema. */
  claimsNoMatches: false;
  futureFixtures: Fixture[];
  /** Najranija buduća, i kada sat nije potvrđen. */
  nextFixture: Fixture | null;
  /** Najranija buduća sa potvrđenim UTC trenutkom. Samo ova sme u minutni push. */
  nextConfirmedFixture: Fixture | null;
  coverage: CoverageStatus[];
}

export const DEFAULT_ON_DEMAND_POLICY: OnDemandCachePolicy = {
  reuseWithinMinutes: 360,
  minRefreshMinutes: 15,
};

export function fixtureInvolvesTeam(fixture: { homeTeamId: string; awayTeamId: string | null }, teamId: string): boolean {
  return fixture.homeTeamId === teamId || fixture.awayTeamId === teamId;
}

export function findFixtures(input: {
  team: Team;
  query: FindFixturesQuery;
  feeds: readonly CompetitionFeed[];
  cache: FindCacheStore;
  policy?: OnDemandCachePolicy;
}): FindFixturesResult {
  const policy = input.policy ?? DEFAULT_ON_DEMAND_POLICY;
  assertPolicy(policy);
  const { team, query } = input;
  if (query.teamId !== team.id) {
    throw new Error('Upit i tim nemaju isti identitet.');
  }
  if (query.sport !== team.sport) {
    throw new Error('Sport upita i tim se ne poklapaju. FK i KK istog imena su različiti timovi.');
  }
  if (!isSelectableTeamId(team.id, team.sport)) {
    throw new Error('U ovoj verziji mogu se izabrati samo Crvena zvezda i Partizan.');
  }
  if (!Number.isFinite(Date.parse(query.now))) {
    throw new Error('now mora biti trenutak.');
  }

  const key = `${team.id}:${query.seasonId}`;
  const cached = input.cache.get(key);
  const ageMinutes = cached ? minutesBetween(cached.storedAt, query.now) : null;

  if (cached && ageMinutes !== null && ageMinutes >= 0) {
    const withinReuse = !query.refresh && ageMinutes < policy.reuseWithinMinutes;
    const throttled = query.refresh && ageMinutes < policy.minRefreshMinutes;
    if (withinReuse || throttled) {
      return present({
        team,
        query,
        fixtures: cached.fixtures,
        coverage: cached.coverage,
        cacheStatus: throttled ? 'throttled' : 'reused',
        upstreamRequests: 0,
        checkedAt: cached.storedAt,
      });
    }
  }

  const previous = cached?.fixtures ?? [];
  const merged: Fixture[] = [];
  const coverage: CoverageStatus[] = [];
  let upstreamRequests = 0;
  const seenFeed = new Set<string>();

  for (const feed of input.feeds) {
    if (feed.seasonId !== query.seasonId) {
      throw new Error(`Feed ${feed.competitionId} nije za sezonu ${query.seasonId}.`);
    }
    const feedKey = `${feed.competitionId}:${feed.provider}`;
    if (seenFeed.has(feedKey)) {
      throw new Error(`Feed ${feedKey} je naveden dvaput.`);
    }
    seenFeed.add(feedKey);

    const kept = previous.filter(
      (fixture) => fixture.competitionId === feed.competitionId && fixture.provider === feed.provider,
    );

    if (feed.publication !== 'allowed') {
      coverage.push(
        coverageRow(team, feed, {
          scheduleAvailability: 'unknown',
          verdict: 'unverified',
          futureFixturesAvailable: null,
          timePrecision: null,
          requests: 0,
          extra: 'Izvor nije označen kao dozvoljen za upis u MatchAhead. Odgovor nije učitan.',
        }),
      );
      merged.push(...kept);
      continue;
    }

    upstreamRequests += feed.failure === 'none' ? Math.max(feed.pages.length, 1) : 1;

    if (feed.teamNotInCompetition || feed.organizerMarkedUnpublished || feed.failure !== 'none') {
      const assessment = assessFetch({
        failure: feed.failure,
        organizerMarkedUnpublished: feed.organizerMarkedUnpublished,
        teamNotInCompetition: feed.teamNotInCompetition,
      });
      coverage.push(
        coverageRow(team, feed, {
          scheduleAvailability: assessment.scheduleAvailability,
          verdict: assessment.scheduleAvailability === 'source_error' ? 'unverified' : 'confirmed',
          futureFixturesAvailable: null,
          timePrecision: null,
          requests: feed.failure === 'none' ? Math.max(feed.pages.length, 1) : 1,
          extra: assessment.keepPreviousSchedule
            ? 'Prethodni raspored ovog takmičenja ostaje. Praznina nije odsustvo utakmica.'
            : '',
        }),
      );
      merged.push(...kept);
      continue;
    }

    if (!pagesComplete(feed)) {
      coverage.push(
        coverageRow(team, feed, {
          scheduleAvailability: 'source_error',
          verdict: 'unverified',
          futureFixturesAvailable: null,
          timePrecision: null,
          requests: feed.pages.length,
          extra: 'Nedostaje strana odgovora. Nepotpun spisak nije objavljen i nije obrisan prethodni.',
        }),
      );
      merged.push(...kept);
      continue;
    }

    const flattened = feed.pages
      .slice()
      .sort((left, right) => left.page - right.page)
      .flatMap((page) => page.fixtures);
    const teamDrafts = flattened.filter((draft) => fixtureInvolvesTeam(draft, team.id));
    if (teamDrafts.length === 0) {
      coverage.push(
        coverageRow(team, feed, {
          scheduleAvailability: 'unknown',
          verdict: 'unverified',
          futureFixturesAvailable: null,
          timePrecision: null,
          requests: feed.pages.length,
          extra: 'Potpun odgovor ne pominje ovaj tim. To nije dokaz da utakmica nema.',
        }),
      );
      merged.push(...kept);
      continue;
    }

    const { drafts, conflict } = dedupeDrafts(teamDrafts);
    const byId = new Map(kept.map((fixture) => [fixture.id, fixture]));
    for (const draft of drafts) {
      const next = materialize(team, draft, byId.get(fixtureIdFromProvider(draft)) ?? null);
      byId.set(next.id, next);
    }
    const fixtures = [...byId.values()];
    merged.push(...fixtures);
    coverage.push(
      coverageRow(team, feed, {
        scheduleAvailability: 'published',
        verdict: 'confirmed',
        futureFixturesAvailable: fixtures.some((fixture) => isFuture(fixture, query)),
        timePrecision: precisionOf(fixtures),
        requests: feed.pages.length,
        extra: conflict
          ? 'Isti ID u jednom odgovoru ima dve verzije; zadržana je poslednja strana.'
          : 'Utakmica koja nestane iz novog odgovora ostaje, dok je izvor izričito ne otkaže.',
        postponementObserved: fixtures.some((fixture) => fixture.status === 'postponed'),
        cancellationObserved: fixtures.some((fixture) => fixture.status === 'cancelled'),
      }),
    );
  }

  const record: FindCacheRecord = {
    key,
    storedAt: query.now,
    fixtures: merged,
    coverage,
  };
  input.cache.set(key, record);
  return present({
    team,
    query,
    fixtures: merged,
    coverage,
    cacheStatus: 'fetched',
    upstreamRequests,
    checkedAt: query.now,
  });
}

function present(input: {
  team: Team;
  query: FindFixturesQuery;
  fixtures: readonly Fixture[];
  coverage: readonly CoverageStatus[];
  cacheStatus: FindCacheStatus;
  upstreamRequests: number;
  checkedAt: string;
}): FindFixturesResult {
  const futureFixtures = input.fixtures
    .filter((fixture) => isFuture(fixture, input.query))
    .slice()
    .sort(compareFuture);
  return {
    teamId: input.team.id,
    sport: input.team.sport,
    seasonId: input.query.seasonId,
    cacheStatus: input.cacheStatus,
    upstreamRequests: input.upstreamRequests,
    checkedAt: input.checkedAt,
    claimsNoMatches: false,
    futureFixtures,
    nextFixture: futureFixtures[0] ?? null,
    nextConfirmedFixture: futureFixtures.find((fixture) => fixture.timeConfirmed) ?? null,
    coverage: [...input.coverage],
  };
}

function materialize(team: Team, draft: ObservedFixtureDraft, previous: Fixture | null): Fixture {
  if (draft.sport !== team.sport) {
    throw new Error('Sport utakmice i tima se ne poklapaju.');
  }
  if (draft.homeTeamId !== team.id && draft.awayTeamId !== team.id) {
    throw new Error('Utakmica ne pripada timu koji se traži.');
  }
  const untrusted = isUntrustedKickoffClock({
    printedLocalTime: draft.printedLocalTime,
    startsAtUtc: draft.startsAtUtc,
  });
  const timeConfirmed = draft.sourceClaimsTimeConfirmed && !untrusted && draft.startsAtUtc !== null;
  const startsAtUtc = timeConfirmed ? draft.startsAtUtc : null;
  let status = draft.status;
  if (!timeConfirmed && status === 'scheduled') status = 'time_tbd';

  let previousStartsAtUtc = draft.previousStartsAtUtc;
  let previousScheduledLocalDate = draft.previousScheduledLocalDate;
  if (previous && previousStartsAtUtc === null) {
    if (previous.startsAtUtc && previous.startsAtUtc !== startsAtUtc) {
      previousStartsAtUtc = previous.startsAtUtc;
      previousScheduledLocalDate = previous.scheduledLocalDate;
    } else {
      previousStartsAtUtc = previous.previousStartsAtUtc;
      previousScheduledLocalDate = previous.previousScheduledLocalDate;
    }
  }

  const next: Fixture = {
    id: fixtureIdFromProvider(draft),
    sport: draft.sport,
    competitionId: draft.competitionId,
    seasonId: draft.seasonId,
    homeTeamId: draft.homeTeamId,
    awayTeamId: draft.awayTeamId,
    startsAtUtc,
    scheduledLocalDate: draft.scheduledLocalDate,
    sourceTimeZone: draft.sourceTimeZone,
    timeConfirmed,
    previousStartsAtUtc,
    previousScheduledLocalDate,
    status,
    venue: draft.venue,
    round: draft.round,
    sourceUrl: draft.sourceUrl,
    provider: draft.provider,
    providerFixtureId: draft.providerFixtureId,
    fetchedAt: draft.fetchedAt,
    sourceUpdatedAt: draft.sourceUpdatedAt,
    contentHash: '',
    revision: 0,
  };
  const errors = timeErrors(next);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
  return applyObservedFixture(previous, next);
}

function dedupeDrafts(drafts: readonly ObservedFixtureDraft[]): {
  drafts: ObservedFixtureDraft[];
  conflict: boolean;
} {
  const byId = new Map<string, ObservedFixtureDraft>();
  let conflict = false;
  for (const draft of drafts) {
    const id = fixtureIdFromProvider(draft);
    const prior = byId.get(id);
    if (prior && !sameObservation(prior, draft)) conflict = true;
    byId.set(id, draft);
  }
  return { drafts: [...byId.values()], conflict };
}

function sameObservation(left: ObservedFixtureDraft, right: ObservedFixtureDraft): boolean {
  return (
    left.startsAtUtc === right.startsAtUtc &&
    left.printedLocalTime === right.printedLocalTime &&
    left.scheduledLocalDate === right.scheduledLocalDate &&
    left.status === right.status &&
    left.homeTeamId === right.homeTeamId &&
    left.awayTeamId === right.awayTeamId &&
    left.sourceClaimsTimeConfirmed === right.sourceClaimsTimeConfirmed
  );
}

function pagesComplete(feed: CompetitionFeed): boolean {
  if (!Number.isInteger(feed.totalPages) || feed.totalPages < 1) return false;
  const seen = new Set<number>();
  for (const page of feed.pages) {
    if (!Number.isInteger(page.page) || page.page < 1 || page.page > feed.totalPages) return false;
    if (seen.has(page.page)) return false;
    seen.add(page.page);
  }
  return seen.size === feed.totalPages;
}

function isFuture(fixture: Fixture, query: FindFixturesQuery): boolean {
  if (
    fixture.status === 'finished' ||
    fixture.status === 'cancelled' ||
    fixture.status === 'abandoned' ||
    fixture.status === 'live'
  ) {
    return false;
  }
  if (fixture.startsAtUtc !== null) {
    return Date.parse(fixture.startsAtUtc) >= Date.parse(query.now);
  }
  if (fixture.scheduledLocalDate !== null) {
    return fixture.scheduledLocalDate >= query.todayLocalDate;
  }
  return true;
}

function compareFuture(left: Fixture, right: Fixture): number {
  const day = (fixture: Fixture): string =>
    fixture.scheduledLocalDate ?? fixture.startsAtUtc?.slice(0, 10) ?? '9999-12-31';
  const byDay = day(left).localeCompare(day(right));
  if (byDay !== 0) return byDay;
  if (left.timeConfirmed !== right.timeConfirmed) return left.timeConfirmed ? -1 : 1;
  if (left.startsAtUtc && right.startsAtUtc && left.startsAtUtc !== right.startsAtUtc) {
    return left.startsAtUtc < right.startsAtUtc ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function precisionOf(fixtures: readonly Fixture[]): TimePrecision {
  if (fixtures.length === 0) return 'unknown';
  if (fixtures.every((fixture) => fixture.timeConfirmed)) return 'utc_confirmed';
  if (fixtures.some((fixture) => !fixture.timeConfirmed && fixture.scheduledLocalDate !== null)) {
    return 'unconfirmed_clock';
  }
  if (fixtures.some((fixture) => fixture.scheduledLocalDate !== null)) return 'date_only';
  return 'unknown';
}

function coverageRow(
  team: Team,
  feed: CompetitionFeed,
  input: {
    scheduleAvailability: ScheduleAvailability;
    verdict: CoverageStatus['verdict'];
    futureFixturesAvailable: boolean | null;
    timePrecision: TimePrecision | null;
    requests: number;
    extra: string;
    postponementObserved?: boolean;
    cancellationObserved?: boolean;
  },
): CoverageStatus {
  return {
    id: `${team.id}:${feed.competitionId}:${feed.seasonId}:${feed.provider}`,
    teamId: team.id,
    competitionId: feed.competitionId,
    seasonId: feed.seasonId,
    provider: feed.provider,
    providerCompetitionId: feed.providerCompetitionId,
    verdict: input.verdict,
    scheduleAvailability: input.scheduleAvailability,
    freeAccessConfirmed: null,
    futureFixturesAvailable: input.futureFixturesAvailable,
    timePrecision: input.timePrecision,
    postponementObserved: input.postponementObserved ?? null,
    cancellationObserved: input.cancellationObserved ?? null,
    publication: feed.publication,
    requestsPerRefresh: input.requests,
    evidence: [feed.evidence, input.extra].filter(Boolean).join(' '),
    checkedAt: feed.checkedAt,
  };
}

function assertPolicy(policy: OnDemandCachePolicy): void {
  if (!Number.isInteger(policy.reuseWithinMinutes) || policy.reuseWithinMinutes < 1) {
    throw new Error('Prozor keša mora biti pozitivan ceo broj minuta.');
  }
  if (!Number.isInteger(policy.minRefreshMinutes) || policy.minRefreshMinutes < 1) {
    throw new Error('Najkraći razmak mora biti pozitivan ceo broj minuta.');
  }
  if (policy.minRefreshMinutes > policy.reuseWithinMinutes) {
    throw new Error('Najkraći razmak ne može biti duži od prozora keša.');
  }
}

function minutesBetween(earlierIso: string, laterIso: string): number | null {
  const delta = Date.parse(laterIso) - Date.parse(earlierIso);
  if (Number.isNaN(delta)) return null;
  return delta / 60_000;
}
