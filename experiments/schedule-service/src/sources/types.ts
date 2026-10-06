import type {
  Competition,
  CompetitionFeed,
  FetchFailureKind,
  ObservedFixtureDraft,
  Team,
} from '../../../../packages/domain/src/index.ts';

export interface ParsedSource {
  drafts: ObservedFixtureDraft[];
  complete: boolean;
  failure: FetchFailureKind;
  evidence: string;
  competitions: Competition[];
  confirmedUtc: number;
}

export interface FeedLoad {
  feeds: CompetitionFeed[];
  teams: Team[];
  competitions: Competition[];
  upstreamPlan: number;
  technicalSuccess: string[];
  /**
   * league: strana ima sve učesnike tog takmičenja i sme da posluži drugi klub.
   * club: strana pripada samo traženom klubu. Podrazumevano je club.
   * Klupski provajderi ostaju club i kada mapa kaže drugačije.
   */
  shares?: Readonly<Record<string, 'league' | 'club'>>;
}

export interface FeedRequest {
  team: Team;
  seasonId: string;
  now: string;
  todayLocalDate: string;
  network: boolean;
  /** Kad je zadato, samo ovi provajderi smeju da povuku sportsko telo. */
  fetchProviders?: readonly string[];
}

export interface FeedSource {
  load(input: FeedRequest): Promise<FeedLoad>;
}

export function emptyParse(evidence: string, failure: FetchFailureKind = 'none'): ParsedSource {
  return { drafts: [], complete: false, failure, evidence, competitions: [], confirmedUtc: 0 };
}
