import type { CompetitionFeed } from '../../../../packages/domain/src/index.ts';
import { SOURCE_DOCUMENTS, catalogCompetitions, competitionForProvider } from '../catalog.ts';
import type { FeedLoad, FeedSource } from './types.ts';

/**
 * Produkcijski izvor. Ne preuzima HTML ni PDF jer dozvola za objavu nije utvrđena.
 * Parseri rade u Durable Object-u kada sintetička politika testa kaže allowed.
 * Ingress Worker samo proverava zahtev. Limit od 10 ms pripada ingressu, ne obradi u objektu.
 */
export function createGateSource(): FeedSource {
  return {
    async load(input): Promise<FeedLoad> {
      const documents = SOURCE_DOCUMENTS[input.team.sport];
      const evidence = input.network
        ? 'Produkcija ne zove izvor. Dozvola za objavu je unknown, pa se HTML i PDF ne učitavaju. To nije tvrdnja da parsiranje ne staje u CPU Durable Object-a.'
        : 'Keš je još u roku. Izvor nije zvan.';
      const feeds: CompetitionFeed[] = documents.map((document) => ({
        competitionId: competitionForProvider(document.provider),
        seasonId: input.seasonId,
        provider: document.provider,
        providerCompetitionId: null,
        publication: 'unknown',
        organizerMarkedUnpublished: false,
        teamNotInCompetition: false,
        failure: 'none',
        totalPages: 1,
        pages: [],
        evidence,
        sourceUrl: document.url,
        checkedAt: input.todayLocalDate,
      }));
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
        technicalSuccess: [],
      };
    },
  };
}
