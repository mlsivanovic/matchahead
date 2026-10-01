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
}

export interface FeedRequest {
  team: Team;
  seasonId: string;
  now: string;
  todayLocalDate: string;
  network: boolean;
}

export interface FeedSource {
  load(input: FeedRequest): Promise<FeedLoad>;
}

export function emptyParse(evidence: string, failure: FetchFailureKind = 'none'): ParsedSource {
  return { drafts: [], complete: false, failure, evidence, competitions: [], confirmedUtc: 0 };
}
