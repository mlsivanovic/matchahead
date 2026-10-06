import { DEFAULT_ON_DEMAND_POLICY } from '../../../packages/domain/src/find-fixtures.ts';
import { fixtureIdFromProvider } from '../../../packages/domain/src/identity.ts';
import { isUntrustedKickoffClock, timeErrors } from '../../../packages/domain/src/time.ts';
import type { CompetitionFeed, FetchFailureKind, ObservedFixtureDraft } from '../../../packages/domain/src/index.ts';
import type { FeedLoad } from './sources/types.ts';

/**
 * Zajednička strana lige, ključ takmičenje + sezona + provajder.
 * Klupski sajt ostaje vezan za jedan klub i ne sme da posluži drugi.
 * Nepotpuna ili prazna strana ne postaje dobar snimak.
 */
export interface SharedSourcePage {
  key: string;
  competitionId: string;
  seasonId: string;
  provider: string;
  scope: 'league' | 'club';
  ownerTeamId: string | null;
  good: CompetitionFeed | null;
  goodAt: string | null;
  lastAttemptAt: string;
  lastFailure: FetchFailureKind;
}

export interface SharePlan {
  fetchProviders: string[];
  touchProviders: string[];
  revoke: Array<{ competitionId: string; seasonId: string; provider: string }>;
  /** null kad odgovor ide kroz klupski keš ili kroz pravo preuzimanje. */
  serve: 'reused' | 'throttled' | null;
  clubCacheHit: boolean;
}

const CLUB_PROVIDERS = new Set(['fk-partizan', 'fk-crvena-zvezda', 'kk-partizan', 'kk-crvena-zvezda']);

export function sourceScope(
  provider: string,
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined,
): 'league' | 'club' {
  if (CLUB_PROVIDERS.has(provider)) return 'club';
  const declared = shares?.[provider];
  if (declared === 'league' || declared === 'club') return declared;
  return 'club';
}

export function sourceKey(
  scope: 'league' | 'club',
  teamId: string,
  feed: { competitionId: string; seasonId: string; provider: string },
): string {
  if (scope === 'league') return `league\t${feed.competitionId}\t${feed.seasonId}\t${feed.provider}`;
  return `club\t${teamId}\t${feed.competitionId}\t${feed.seasonId}\t${feed.provider}`;
}

export function hasLeagueFeed(
  feeds: readonly CompetitionFeed[],
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined,
): boolean {
  return feeds.some((feed) => feed.provider !== 'listed-gap' && sourceScope(feed.provider, shares) === 'league');
}

/** Potpuna dozvoljena strana sa bar jednom utakmicom. Prazno i nepotpuno nisu to. */
export function pageIsShareable(feed: CompetitionFeed): boolean {
  if (feed.publication !== 'allowed' || feed.failure !== 'none') return false;
  if (!Number.isInteger(feed.totalPages) || feed.totalPages < 1) return false;
  const seen = new Set<number>();
  let drafts = 0;
  for (const page of feed.pages) {
    if (!Number.isInteger(page.page) || page.page < 1 || page.page > feed.totalPages) return false;
    if (seen.has(page.page)) return false;
    seen.add(page.page);
    drafts += page.fixtures.length;
  }
  return seen.size === feed.totalPages && drafts > 0;
}

export function planSharedReads(input: {
  feeds: readonly CompetitionFeed[];
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined;
  teamId: string;
  now: string;
  refresh: boolean;
  pages: readonly SharedSourcePage[];
  clubSkip: boolean;
}): SharePlan {
  const revoke: SharePlan['revoke'] = [];
  if (input.clubSkip) {
    for (const feed of input.feeds) {
      if (feed.provider === 'listed-gap') continue;
      if (feed.publication !== 'allowed') revoke.push(identity(feed));
    }
    return { fetchProviders: [], touchProviders: [], revoke, serve: null, clubCacheHit: true };
  }

  const fetchProviders: string[] = [];
  const touchProviders: string[] = [];
  let blocked = false;
  let servedShared = false;
  for (const feed of input.feeds) {
    if (feed.provider === 'listed-gap') continue;
    if (feed.publication !== 'allowed') {
      revoke.push(identity(feed));
      continue;
    }
    const page = findPage(input.pages, input.shares, input.teamId, feed);
    const attemptAge = page ? minutesBetween(page.lastAttemptAt, input.now) : null;
    const successAge = page?.goodAt ? minutesBetween(page.goodAt, input.now) : null;
    const freshGood = Boolean(
      page?.good && successAge !== null && successAge >= 0 && successAge < DEFAULT_ON_DEMAND_POLICY.reuseWithinMinutes,
    );
    if (!input.refresh && freshGood) {
      servedShared = true;
      continue;
    }
    const recentAttempt = Boolean(
      page && attemptAge !== null && attemptAge >= 0 && attemptAge < DEFAULT_ON_DEMAND_POLICY.minRefreshMinutes,
    );
    const refreshCooldown = Boolean(page && input.refresh && recentAttempt);
    const neverSucceededCooldown = Boolean(page && !page.good && recentAttempt);
    const failedWhileStale = Boolean(page?.good && page.lastFailure !== 'none' && recentAttempt && !freshGood);
    if (refreshCooldown || neverSucceededCooldown || failedWhileStale) {
      blocked = true;
      if (page?.good) servedShared = true;
      continue;
    }
    const bodyCandidate = feed.failure === 'none' || feed.failure === 'incomplete_page';
    if (bodyCandidate) {
      if (!fetchProviders.includes(feed.provider)) fetchProviders.push(feed.provider);
      continue;
    }
    if (!touchProviders.includes(feed.provider)) touchProviders.push(feed.provider);
    if (page?.good) servedShared = true;
  }

  let serve: SharePlan['serve'] = null;
  if (fetchProviders.length === 0) {
    if (blocked) serve = 'throttled';
    else if (servedShared) serve = 'reused';
  }
  return { fetchProviders, touchProviders, revoke, serve, clubCacheHit: false };
}

export function recordsAfterAttempt(input: {
  feeds: readonly CompetitionFeed[];
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined;
  providers: readonly string[];
  teamId: string;
  now: string;
  prior: readonly SharedSourcePage[];
  fetchedBody: boolean;
}): { write: SharedSourcePage[]; revoke: SharePlan['revoke'] } {
  const write: SharedSourcePage[] = [];
  const revoke: SharePlan['revoke'] = [];
  const selected = new Set(input.providers);
  for (const feed of input.feeds) {
    if (!selected.has(feed.provider) || feed.provider === 'listed-gap') continue;
    if (feed.publication !== 'allowed') {
      revoke.push(identity(feed));
      continue;
    }
    const scope = sourceScope(feed.provider, input.shares);
    const key = sourceKey(scope, input.teamId, feed);
    const previous = input.prior.find((page) => page.key === key) ?? null;
    const shareable = input.fetchedBody && pageIsShareable(feed) && feedIsCoherent(feed);
    write.push({
      key,
      competitionId: feed.competitionId,
      seasonId: feed.seasonId,
      provider: feed.provider,
      scope,
      ownerTeamId: scope === 'club' ? input.teamId : null,
      good: shareable ? feed : (previous?.good ?? null),
      goodAt: shareable ? input.now : (previous?.goodAt ?? null),
      lastAttemptAt: input.now,
      lastFailure: shareable ? 'none' : feed.failure === 'none' ? 'unexpected_empty' : feed.failure,
    });
  }
  return { write, revoke };
}

/** Sat deljenog snimka, da klupski zapis ne produži rok posle tuđeg pregleda. */
export function servedClock(
  pages: readonly SharedSourcePage[],
  feeds: readonly CompetitionFeed[],
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined,
  teamId: string,
): { goodAt: string | null; attemptAt: string | null } {
  let goodAt: string | null = null;
  let attemptAt: string | null = null;
  for (const feed of feeds) {
    const page = findPage(pages, shares, teamId, feed);
    if (!page) continue;
    if (page.goodAt && (goodAt === null || page.goodAt < goodAt)) goodAt = page.goodAt;
    if (attemptAt === null || page.lastAttemptAt > attemptAt) attemptAt = page.lastAttemptAt;
  }
  return { goodAt, attemptAt };
}

export function feedsToPublish(input: {
  described: readonly CompetitionFeed[];
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined;
  plan: SharePlan;
  pages: readonly SharedSourcePage[];
  teamId: string;
  clubFixtures: readonly { competitionId: string; provider: string }[];
  fetched: readonly CompetitionFeed[] | null;
}): CompetitionFeed[] {
  if (input.plan.clubCacheHit) return [...input.described];
  const fetched = new Map((input.fetched ?? []).map((feed) => [feedIdentity(feed), feed]));
  const takeFetched = new Set(input.plan.fetchProviders);
  return input.described.map((feed) => {
    if (takeFetched.has(feed.provider)) {
      return fetched.get(feedIdentity(feed)) ?? feed;
    }
    if (feed.provider === 'listed-gap' || feed.publication !== 'allowed') return feed;
    const page = findPage(input.pages, input.shares, input.teamId, feed);
    if (!page?.good) return feed;
    const keepFailure = feed.failure !== 'none' && input.clubFixtures.some(
      (fixture) => fixture.competitionId === feed.competitionId && fixture.provider === feed.provider,
    );
    if (keepFailure) return feed;
    return { ...page.good, publication: feed.publication, checkedAt: feed.checkedAt };
  });
}

/** Strana koja domen ne bi objavio ne sme da postane zajednički dobar snimak. */
export function feedIsCoherent(feed: CompetitionFeed): boolean {
  const seen = new Map<string, ObservedFixtureDraft>();
  for (const page of feed.pages) {
    for (const draft of page.fixtures) {
      if (draft.competitionId !== feed.competitionId || draft.seasonId !== feed.seasonId || draft.provider !== feed.provider) {
        return false;
      }
      if (!feed.competitionId.startsWith(`${draft.sport}:`)) return false;
      let id: string;
      try {
        id = fixtureIdFromProvider(draft);
      } catch {
        return false;
      }
      const prior = seen.get(id);
      if (prior && !sameObservation(prior, draft)) return false;
      seen.set(id, draft);
      const untrusted = isUntrustedKickoffClock({
        printedLocalTime: draft.printedLocalTime,
        startsAtUtc: draft.startsAtUtc,
      });
      const timeConfirmed = draft.sourceClaimsTimeConfirmed && !untrusted && draft.startsAtUtc !== null;
      const startsAtUtc = timeConfirmed ? draft.startsAtUtc : null;
      const status = !timeConfirmed && draft.status === 'scheduled' ? 'time_tbd' : draft.status;
      if (timeErrors({
        status,
        timeConfirmed,
        startsAtUtc,
        scheduledLocalDate: draft.scheduledLocalDate,
        previousStartsAtUtc: draft.previousStartsAtUtc,
        previousScheduledLocalDate: draft.previousScheduledLocalDate,
      }).length > 0) {
        return false;
      }
    }
  }
  return seen.size > 0;
}

function sameObservation(left: ObservedFixtureDraft, right: ObservedFixtureDraft): boolean {
  return left.startsAtUtc === right.startsAtUtc
    && left.printedLocalTime === right.printedLocalTime
    && left.scheduledLocalDate === right.scheduledLocalDate
    && left.status === right.status
    && left.homeTeamId === right.homeTeamId
    && left.awayTeamId === right.awayTeamId
    && left.sourceClaimsTimeConfirmed === right.sourceClaimsTimeConfirmed;
}

export interface FlightClaim {
  leader: boolean;
  finish(load: FeedLoad): void;
  fail(error: unknown): void;
  join(): Promise<FeedLoad>;
}

/** Jedan let za isti ključ. Drugi poziv čeka prvi, ne otvara drugi zahtev. */
export class SourceFlight {
  pending: Map<string, Promise<FeedLoad>>;

  constructor() {
    this.pending = new Map();
  }

  claim(key: string): FlightClaim {
    const existing = this.pending.get(key);
    if (existing) {
      return {
        leader: false,
        finish() {},
        fail() {},
        join: () => existing,
      };
    }
    let settle: (value: FeedLoad) => void = () => undefined;
    let failSettle: (error: unknown) => void = () => undefined;
    const promise = new Promise<FeedLoad>((resolve, reject) => {
      settle = resolve;
      failSettle = reject;
    });
    promise.catch(() => undefined);
    this.pending.set(key, promise);
    const drop = (): void => {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    };
    return {
      leader: true,
      finish(load: FeedLoad) {
        settle(load);
        drop();
      },
      fail(error: unknown) {
        failSettle(error);
        drop();
      },
      join: () => promise,
    };
  }
}

function identity(feed: CompetitionFeed): { competitionId: string; seasonId: string; provider: string } {
  return { competitionId: feed.competitionId, seasonId: feed.seasonId, provider: feed.provider };
}

function feedIdentity(feed: CompetitionFeed): string {
  return `${feed.competitionId}\t${feed.seasonId}\t${feed.provider}`;
}

function findPage(
  pages: readonly SharedSourcePage[],
  shares: Readonly<Record<string, 'league' | 'club'>> | undefined,
  teamId: string,
  feed: CompetitionFeed,
): SharedSourcePage | null {
  const key = sourceKey(sourceScope(feed.provider, shares), teamId, feed);
  return pages.find((page) => page.key === key) ?? null;
}

function minutesBetween(earlierIso: string, laterIso: string): number | null {
  const delta = Date.parse(laterIso) - Date.parse(earlierIso);
  if (Number.isNaN(delta)) return null;
  return delta / 60_000;
}
