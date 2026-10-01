import type { CompetitionFeed, FetchFailureKind, Sport } from '../../../../packages/domain/src/index.ts';
import { competitionId } from '../../../../packages/domain/src/index.ts';
import { catalogCompetitions } from '../catalog.ts';
import { parseAbaCalendar } from './aba.ts';
import { parseCzSchedule } from './cz-football.ts';
import { parseEuroleaguePdf } from './euroleague-pdf.ts';
import { parseFssSuperliga } from './fss.ts';
import { parsePartizanNuxt } from './partizan-football.ts';
import type { FeedLoad, FeedSource, ParsedSource } from './types.ts';
import { emptyParse } from './types.ts';

const LAB_HOST = 'lab.schedule.test';

interface LabPolicy {
  publication: 'allowed' | 'forbidden' | 'unknown';
  failure: FetchFailureKind;
}

interface DocumentParser {
  provider: string;
  sport: Sport;
  competitionId: string;
  sourceUrl: string;
  parse(body: Uint8Array, fetchedAt: string): Promise<ParsedSource>;
}

const PARSERS: Record<string, DocumentParser> = {
  fss: {
    provider: 'fss',
    sport: 'football',
    competitionId: competitionId('football', 'domestic', 'superliga-srbije'),
    sourceUrl: 'https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/',
    parse: (body, fetchedAt) => Promise.resolve(parseFssSuperliga(decode(body), fetchedAt)),
  },
  aba: {
    provider: 'aba-liga',
    sport: 'basketball',
    competitionId: competitionId('basketball', 'regional', 'aba-liga'),
    sourceUrl: 'https://www.aba-liga.com/calendar/26/1/',
    parse: (body, fetchedAt) => Promise.resolve(parseAbaCalendar(decode(body), fetchedAt)),
  },
  partizan: {
    provider: 'fk-partizan',
    sport: 'football',
    competitionId: competitionId('football', 'domestic', 'superliga-srbije'),
    sourceUrl: 'https://partizan.rs/utakmice',
    parse: (body, fetchedAt) => Promise.resolve(parsePartizanNuxt(decode(body), fetchedAt)),
  },
  cz: {
    provider: 'fk-crvena-zvezda',
    sport: 'football',
    competitionId: competitionId('football', 'domestic', 'superliga-srbije'),
    sourceUrl: 'https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati',
    parse: (body, fetchedAt) => Promise.resolve(parseCzSchedule(decode(body), fetchedAt)),
  },
  euroleague: {
    provider: 'euroleague',
    sport: 'basketball',
    competitionId: competitionId('basketball', 'european', 'evroliga'),
    sourceUrl: 'https://ftpserver.euroleague.net/media/2026-27_EL_RS_CALENDAR_PRINTABLE.pdf',
    parse: (body, fetchedAt) => parseEuroleaguePdf(body, fetchedAt),
  },
};

/**
 * Sintetički dokument na lab.schedule.test, ali pravi HTML/PDF parser.
 * Produkcija ovo ne zove: tamo publikacija ostaje unknown.
 * Dozvola dolazi samo iz /policy ovog testa, nikad iz samog dokumenta.
 */
export function createDocumentLabSource(fixturesUrl: string, parserName: string, timeoutMs = 5000): FeedSource {
  const parser = PARSERS[parserName];
  if (!parser) throw new Error('Nepoznat laboratorijski parser.');
  const fixtures = new URL(fixturesUrl);
  if (fixtures.protocol !== 'https:' || fixtures.hostname !== LAB_HOST) {
    throw new Error('Sintetička laboratorija sme samo na lab.schedule.test.');
  }
  const policyUrl = new URL('/policy', fixtures.origin).toString();
  return {
    async load(input): Promise<FeedLoad> {
      const policy = await readPolicy(policyUrl, timeoutMs);
      const wrongSport = parser.sport !== input.team.sport;
      let parsed = emptyParse('Keš je još u roku. Izvor nije zvan.');
      const readNetwork = input.network && !wrongSport && (policy.failure === 'none' || policy.failure === 'incomplete_page');
      if (wrongSport) {
        parsed = emptyParse('Parser ne pripada sportu ovog kluba.', 'http_error');
      } else if (readNetwork) {
        parsed = await readDocument(fixtures.toString(), parser, input.now, timeoutMs);
      } else if (input.network && policy.failure !== 'none') {
        parsed = emptyParse('Laboratorija javlja neuspeh. Dokument nije čitan.', policy.failure);
      }
      const failure: FetchFailureKind = wrongSport ? 'http_error' : policy.failure !== 'none' ? policy.failure : parsed.failure;
      const drafts = parsed.drafts.filter((draft) => draft.homeTeamId === input.team.id || draft.awayTeamId === input.team.id);
      const includePages = failure === 'none' || failure === 'incomplete_page';
      const feed: CompetitionFeed = {
        competitionId: parser.competitionId,
        seasonId: input.seasonId,
        provider: parser.provider,
        providerCompetitionId: null,
        publication: policy.publication,
        organizerMarkedUnpublished: false,
        teamNotInCompetition: false,
        failure,
        totalPages: failure === 'incomplete_page' ? 2 : 1,
        pages: includePages ? [{ page: 1, fixtures: drafts }] : [],
        evidence: parsed.evidence,
        sourceUrl: parser.sourceUrl,
        checkedAt: input.todayLocalDate,
      };
      return {
        feeds: [feed],
        teams: [input.team],
        competitions: catalogCompetitions(input.team.sport),
        upstreamPlan: 1,
        technicalSuccess: input.network && failure === 'none' ? [`${parser.provider}:${parser.competitionId}`] : [],
      };
    },
  };
}

async function readDocument(url: string, parser: DocumentParser, fetchedAt: string, timeoutMs: number): Promise<ParsedSource> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return emptyParse(`Laboratorija je vratila HTTP ${response.status}.`, 'http_error');
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength === 0) return emptyParse('Prazan odgovor laboratorije.', 'unexpected_empty');
    const started = performance.now();
    const parsed = await parser.parse(body, fetchedAt);
    const wallMs = performance.now() - started;
    return {
      ...parsed,
      evidence: `${parsed.evidence} Parsiranje u ovom procesu: ${wallMs.toFixed(1)} ms zida.`,
    };
  } catch {
    return emptyParse('Dokument laboratorije nije stigao u roku.', 'timeout');
  }
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

function decode(body: Uint8Array): string {
  return new TextDecoder('utf-8').decode(body);
}
