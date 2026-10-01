import type { CompetitionFeed, FetchFailureKind } from '../../../../packages/domain/src/index.ts';
import {
  MAX_SOURCE_BYTES,
  SOURCE_DOCUMENTS,
  USER_AGENT,
  assertAllowlisted,
  catalogCompetitions,
  competitionForProvider,
  type SourceDocument,
} from '../catalog.ts';
import { parseAbaCalendar } from './aba.ts';
import { parseCzSchedule } from './cz-football.ts';
import { parseEuroleaguePdf } from './euroleague-pdf.ts';
import { parseFssSuperliga } from './fss.ts';
import { parseKkCz, parseKkPartizan, parseKls } from './gates.ts';
import { parsePartizanNuxt } from './partizan-football.ts';
import type { FeedLoad, FeedRequest, FeedSource, ParsedSource } from './types.ts';

export function createProductionSource(fetchImpl: typeof fetch = globalThis.fetch): FeedSource {
  return {
    async load(input) {
      const documents = SOURCE_DOCUMENTS[input.team.sport];
      if (!documents.some((document) => document.url.includes('api-live.euroleague.net'))) {
        // Katalog namerno nema privatni ili nedokumentovani Game Center.
      }
      if (!input.network) {
        return {
          feeds: documents.map((document) =>
            baseFeed(document, input, competitionForProvider(document.provider), 'none', 'Keš je još u roku. Izvor nije zvan.'),
          ),
          teams: [input.team],
          competitions: catalogCompetitions(input.team.sport),
          upstreamPlan: documents.length,
          technicalSuccess: [],
        };
      }
      const feeds: CompetitionFeed[] = [];
      const technicalSuccess: string[] = [];
      for (const document of documents) {
        const read = await readAllowlisted(document, fetchImpl);
        if (!read.ok) {
          feeds.push(baseFeed(document, input, competitionForProvider(document.provider), read.failure, read.evidence));
          continue;
        }
        const parsed = await parseDocument(document, read.body, input.now);
        const competitions = parsed.competitions.length > 0
          ? parsed.competitions.map((item) => item.id)
          : [competitionForProvider(document.provider)];
        for (const competition of competitions) {
          const drafts = parsed.drafts.filter((draft) => draft.competitionId === competition).length;
          const success = parsed.failure === 'none' || (parsed.failure === 'incomplete_page' && drafts > 0);
          feeds.push(baseFeed(document, input, competition, parsed.failure, parsed.evidence));
          if (success) technicalSuccess.push(`${document.provider}:${competition}`);
        }
      }
      for (const competition of catalogCompetitions(input.team.sport)) {
        if (feeds.some((feed) => feed.competitionId === competition.id)) continue;
        feeds.push({
          competitionId: competition.id,
          seasonId: input.seasonId,
          provider: 'listed-gap',
          providerCompetitionId: null,
          publication: 'unknown',
          organizerMarkedUnpublished: false,
          teamNotInCompetition: false,
          failure: 'none',
          totalPages: 1,
          pages: [],
          evidence: `${competition.name}: ovaj skup javnih strana nema dokument za tu fazu. To nije dokaz da klub ne učestvuje.`,
          sourceUrl: '',
          checkedAt: input.todayLocalDate,
        });
      }
      return {
        feeds,
        teams: [input.team],
        competitions: catalogCompetitions(input.team.sport),
        upstreamPlan: documents.length,
        technicalSuccess,
      };
    },
  };
}

async function parseDocument(document: SourceDocument, body: Uint8Array, fetchedAt: string): Promise<ParsedSource> {
  if (document.kind === 'pdf') return parseEuroleaguePdf(body, fetchedAt);
  const html = new TextDecoder('utf8').decode(body);
  switch (document.provider) {
    case 'aba-liga':
      return parseAbaCalendar(html, fetchedAt);
    case 'fss':
      return parseFssSuperliga(html, fetchedAt);
    case 'fk-partizan':
      return parsePartizanNuxt(html, fetchedAt);
    case 'fk-crvena-zvezda':
      return parseCzSchedule(html, fetchedAt);
    case 'kk-partizan':
      return parseKkPartizan(html);
    case 'kk-crvena-zvezda':
      return parseKkCz(html);
    case 'kls':
      return parseKls(html);
    default:
      return {
        drafts: [],
        complete: false,
        failure: 'http_error',
        evidence: 'Nepoznat dokument izvora.',
        competitions: [],
        confirmedUtc: 0,
      };
  }
}

function baseFeed(
  document: SourceDocument,
  input: FeedRequest,
  competition: string,
  failure: FetchFailureKind,
  evidence: string,
): CompetitionFeed {
  return {
    competitionId: competition,
    seasonId: input.seasonId,
    provider: document.provider,
    providerCompetitionId: null,
    publication: 'unknown',
    organizerMarkedUnpublished: false,
    teamNotInCompetition: false,
    failure,
    totalPages: 1,
    pages: [],
    evidence,
    sourceUrl: document.url,
    checkedAt: input.todayLocalDate,
  };
}

async function readAllowlisted(
  document: SourceDocument,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; body: Uint8Array } | { ok: false; failure: FetchFailureKind; evidence: string }> {
  let target: URL;
  try {
    target = assertAllowlisted(document.url);
  } catch {
    return { ok: false, failure: 'http_error', evidence: 'URL nije na listi dozvoljenih domaćina.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), document.timeoutMs);
  try {
    const response = await fetchImpl(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/html,application/pdf', 'user-agent': USER_AGENT },
    });
    if (response.url) {
      try {
        assertAllowlisted(response.url);
      } catch {
        return { ok: false, failure: 'http_error', evidence: 'Preusmerenje je napustilo listu domaćina.' };
      }
    }
    if (response.status === 429) return { ok: false, failure: 'rate_limited', evidence: 'Izvor je vratio 429.' };
    if (!response.ok) return { ok: false, failure: 'http_error', evidence: `HTTP ${response.status}.` };
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      return { ok: false, failure: 'http_error', evidence: 'Odgovor je veći od granice.' };
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength === 0) return { ok: false, failure: 'unexpected_empty', evidence: 'Prazan odgovor.' };
    if (body.byteLength > MAX_SOURCE_BYTES) return { ok: false, failure: 'http_error', evidence: 'Odgovor je veći od granice.' };
    return { ok: true, body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, failure: 'timeout', evidence: 'Zahtev je istekao.' };
    }
    return { ok: false, failure: 'http_error', evidence: 'Zahtev nije završen.' };
  } finally {
    clearTimeout(timer);
  }
}
