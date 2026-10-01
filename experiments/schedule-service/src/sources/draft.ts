import { isUntrustedKickoffClock } from '../../../../packages/domain/src/index.ts';
import type { FixtureStatus, ObservedFixtureDraft, Sport } from '../../../../packages/domain/src/index.ts';

export function observedDraft(input: {
  sport: Sport;
  competitionId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledLocalDate: string | null;
  printedLocalTime: string | null;
  startsAtUtc: string | null;
  sourceTimeZone: string | null;
  status: FixtureStatus;
  venue: string | null;
  round: string | null;
  sourceUrl: string;
  provider: string;
  providerFixtureId: string;
  fetchedAt: string;
}): ObservedFixtureDraft {
  const trustedClock = input.printedLocalTime !== null && !isUntrustedKickoffClock({
    printedLocalTime: input.printedLocalTime,
    startsAtUtc: input.startsAtUtc,
  });
  const confirmed = input.startsAtUtc !== null && trustedClock;
  return {
    sport: input.sport,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    scheduledLocalDate: input.scheduledLocalDate,
    printedLocalTime: trustedClock ? input.printedLocalTime : null,
    startsAtUtc: confirmed ? input.startsAtUtc : null,
    sourceTimeZone: confirmed ? input.sourceTimeZone : null,
    sourceClaimsTimeConfirmed: confirmed,
    status: input.status === 'scheduled' && !confirmed ? 'time_tbd' : input.status,
    venue: input.venue,
    round: input.round,
    sourceUrl: input.sourceUrl,
    provider: input.provider,
    providerFixtureId: input.providerFixtureId,
    fetchedAt: input.fetchedAt,
    sourceUpdatedAt: null,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
  };
}
