import type { CompetitionFeed, FetchFailureKind, FixtureStatus, Sport } from '../../../../packages/domain/src/index.ts';
import { competitionId } from '../../../../packages/domain/src/index.ts';
import { catalogCompetitions } from '../catalog.ts';
import { observedDraft } from './draft.ts';
import type { FeedLoad, FeedSource } from './types.ts';

const LAB_HOST = 'lab.schedule.test';

interface LabPolicy {
  publication: 'allowed' | 'forbidden' | 'unknown';
  failure: FetchFailureKind;
}

interface LabFixture {
  providerFixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledLocalDate: string;
  printedLocalTime: string;
  startsAtUtc: string;
  status: FixtureStatus;
  venue: string | null;
}

/**
 * Sintetički izvor samo za workerd test. Domaćin je fiksiran na lab.schedule.test.
 * Nije sportski sajt i nije u produkcijskom paketu ponašanja: produkcija zove createGateSource.
 */
export function createLabSource(fixturesUrl: string, timeoutMs = 5000): FeedSource {
  const fixtures = new URL(fixturesUrl);
  if (fixtures.protocol !== 'https:' || fixtures.hostname !== LAB_HOST) {
    throw new Error('Sintetička laboratorija sme samo na lab.schedule.test.');
  }
  const policyUrl = new URL('/policy', fixtures.origin).toString();
  return {
    async load(input): Promise<FeedLoad> {
      const policy = await readPolicy(policyUrl, timeoutMs);
      const competition = leagueCompetition(input.team.sport);
      const selected = !input.fetchProviders || input.fetchProviders.includes('lab');
      const includeFixtures = input.network && selected && (policy.failure === 'none' || policy.failure === 'incomplete_page');
      const rows = includeFixtures ? await readFixtures(fixtures.toString(), timeoutMs) : [];
      const drafts = rows
        .filter((row) => rowInSport(row, input.team.sport))
        .map((row) => observedDraft({
          sport: input.team.sport,
          competitionId: competition,
          seasonId: input.seasonId,
          homeTeamId: row.homeTeamId,
          awayTeamId: row.awayTeamId,
          scheduledLocalDate: row.scheduledLocalDate,
          printedLocalTime: row.printedLocalTime,
          startsAtUtc: row.startsAtUtc,
          sourceTimeZone: 'Europe/Belgrade',
          status: row.status,
          venue: row.venue,
          round: '1',
          sourceUrl: 'https://lab.schedule.test/fixtures',
          provider: 'lab',
          providerFixtureId: row.providerFixtureId,
          fetchedAt: input.now,
        }));
      const feed: CompetitionFeed = {
        competitionId: competition,
        seasonId: input.seasonId,
        provider: 'lab',
        providerCompetitionId: null,
        publication: policy.publication,
        organizerMarkedUnpublished: false,
        teamNotInCompetition: false,
        failure: policy.failure,
        totalPages: policy.failure === 'incomplete_page' ? 2 : 1,
        pages: policy.failure === 'none' || policy.failure === 'incomplete_page' ? [{ page: 1, fixtures: drafts }] : [],
        evidence: 'sintetička laboratorija testa, nije javni sportski izvor',
        sourceUrl: 'https://lab.schedule.test/fixtures',
        checkedAt: input.todayLocalDate,
      };
      return {
        feeds: [feed],
        teams: [input.team],
        competitions: catalogCompetitions(input.team.sport),
        upstreamPlan: 1,
        technicalSuccess: input.network && policy.failure === 'none' ? [`lab:${competition}`] : [],
        shares: { lab: 'league' },
      };
    },
  };
}

function leagueCompetition(sport: Sport): string {
  if (sport === 'basketball') return competitionId('basketball', 'regional', 'aba-liga');
  return competitionId('football', 'domestic', 'superliga-srbije');
}

function rowInSport(row: LabFixture, sport: Sport): boolean {
  return row.homeTeamId.startsWith(`${sport}:`) || row.awayTeamId.startsWith(`${sport}:`);
}

async function readPolicy(url: string, timeoutMs: number): Promise<LabPolicy> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { publication: 'unknown', failure: 'http_error' };
    const body = (await response.json()) as Partial<LabPolicy>;
    const publication = body.publication;
    const failure = body.failure;
    if (publication !== 'allowed' && publication !== 'forbidden' && publication !== 'unknown') {
      return { publication: 'unknown', failure: 'http_error' };
    }
    if (
      failure !== 'none' &&
      failure !== 'http_error' &&
      failure !== 'timeout' &&
      failure !== 'rate_limited' &&
      failure !== 'incomplete_page' &&
      failure !== 'unexpected_empty'
    ) {
      return { publication, failure: 'http_error' };
    }
    return { publication, failure };
  } catch {
    return { publication: 'unknown', failure: 'http_error' };
  }
}

async function readFixtures(url: string, timeoutMs: number): Promise<LabFixture[]> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return [];
    const body = (await response.json()) as { fixtures?: LabFixture[] };
    return Array.isArray(body.fixtures) ? body.fixtures : [];
  } catch {
    return [];
  }
}
