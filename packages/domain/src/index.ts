export type {
  Competition,
  CompetitionScope,
  CoverageStatus,
  CoverageVerdict,
  FetchAssessment,
  FetchFailureKind,
  Fixture,
  FixtureStatus,
  PublicationRights,
  ScheduleAvailability,
  SourceManifest,
  Sport,
  Team,
  TimePrecision,
} from './types.ts';

export { competitionId, fixtureIdFromProvider, teamId } from './identity.ts';
export { isSelectableTeamId, selectableTeams } from './selectable-teams.ts';
export {
  applyObservedFixture,
  assessFetch,
  contentHash,
  isExplicitCancellation,
  nextRevision,
} from './normalize.ts';
export {
  dailyRequestCount,
  fitsDailyQuota,
  maxFreshFindsPerDay,
  minSpacingSeconds,
  requestsForFreshFind,
  upstreamRequestsForClicks,
} from './quota.ts';
export type { DailyQuotaInput } from './quota.ts';
export {
  assertFixtureTime,
  canExportTimedEvent,
  hasKnownDate,
  isUntrustedKickoffClock,
  timeErrors,
} from './time.ts';
export type { FixtureTimeInput } from './time.ts';
export { findFixtures, fixtureInvolvesTeam } from './find-fixtures.ts';
export type {
  CompetitionFeed,
  FindCacheRecord,
  FindCacheStatus,
  FindCacheStore,
  FindFixturesQuery,
  FindFixturesResult,
  ObservedFixtureDraft,
  OnDemandCachePolicy,
} from './find-fixtures.ts';
