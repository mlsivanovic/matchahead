/**
 * Javni sportski ugovori. Identitet utakmice ne zavisi od termina ni od
 * sponzorskog imena. Vreme je ili potvrđen UTC trenutak, ili je nepoznato.
 */

export type Sport = 'football' | 'basketball';

export type FixtureStatus =
  | 'scheduled'
  | 'time_tbd'
  | 'postponed'
  | 'cancelled'
  | 'live'
  | 'finished'
  | 'abandoned';

export type CompetitionScope =
  | 'domestic'
  | 'regional'
  | 'european'
  | 'friendly'
  | 'other';

/** Presuda o besplatnom izvoru. Javna lista liga nije potvrda naloga. */
export type CoverageVerdict = 'confirmed' | 'uncovered' | 'unverified';

/**
 * Objavljen raspored, još neobjavljen raspored i kvar izvora su različita stanja.
 * Prazan ili nepotpun odgovor nije otkazivanje i nije sam po sebi dokaz da
 * organizator nije objavio raspored.
 */
export type ScheduleAvailability =
  | 'published'
  | 'unpublished'
  | 'source_error'
  | 'not_participant'
  | 'unknown';

export type TimePrecision =
  | 'utc_confirmed'
  | 'date_only'
  | 'unconfirmed_clock'
  | 'unknown';

export type PublicationRights =
  | 'allowed'
  | 'restricted'
  | 'forbidden'
  | 'unknown';

export interface Team {
  /** Interni stabilan identitet, različit za FK i KK istog imena. */
  id: string;
  sport: Sport;
  name: string;
  shortName: string;
  country: string;
  city: string;
  aliases: string[];
  providerIds: Record<string, string>;
}

export interface Competition {
  id: string;
  sport: Sport;
  name: string;
  scope: CompetitionScope;
  /** null za međunarodno takmičenje. */
  country: string | null;
  aliases: string[];
  providerIds: Record<string, string>;
}

export interface Fixture {
  /** Ne sadrži termin ni sponzorsko ime. */
  id: string;
  sport: Sport;
  competitionId: string;
  seasonId: string;
  homeTeamId: string;
  /** null dok žreb nije odredio protivnika. */
  awayTeamId: string | null;
  /**
   * Potvrđen početak u UTC, sa slovom Z ili brojčanim pomakom.
   * null kada satnica nije potvrđena. Ponoć se ne sme upisati kao zamena.
   */
  startsAtUtc: string | null;
  /** Kalendarski datum YYYY-MM-DD u zoni izvora, ili null. */
  scheduledLocalDate: string | null;
  sourceTimeZone: string | null;
  timeConfirmed: boolean;
  /** Prethodni potvrđeni termin posle pomeranja ili odlaganja. */
  previousStartsAtUtc: string | null;
  previousScheduledLocalDate: string | null;
  status: FixtureStatus;
  venue: string | null;
  round: string | null;
  sourceUrl: string;
  provider: string;
  providerFixtureId: string | null;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  contentHash: string;
  revision: number;
}

export interface CoverageStatus {
  id: string;
  teamId: string | null;
  competitionId: string;
  seasonId: string;
  provider: string;
  providerCompetitionId: string | null;
  verdict: CoverageVerdict;
  scheduleAvailability: ScheduleAvailability;
  /** null dok besplatan nalog nije stvarno pozvan. */
  freeAccessConfirmed: boolean | null;
  futureFixturesAvailable: boolean | null;
  timePrecision: TimePrecision | null;
  postponementObserved: boolean | null;
  cancellationObserved: boolean | null;
  publication: PublicationRights;
  /** Zahtevi jednog ciklusa osvežavanja za ovu stavku, ili null ako nije mereno. */
  requestsPerRefresh: number | null;
  evidence: string;
  /** Kalendarski dan provere YYYY-MM-DD, ili null. */
  checkedAt: string | null;
}

/** Manifest svežine. Pokušaj, uspeh i promena sadržaja nisu isti trenutak. */
export interface SourceManifest {
  provider: string;
  competitionId: string;
  seasonId: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastChangeAt: string | null;
  staleAfterHours: number;
}

export type FetchFailureKind =
  | 'none'
  | 'http_error'
  | 'timeout'
  | 'rate_limited'
  | 'incomplete_page'
  | 'unexpected_empty';

export interface FetchAssessment {
  scheduleAvailability: ScheduleAvailability;
  keepPreviousSchedule: boolean;
  /** Nestanak utakmice iz jednog odgovora nikad nije otkazivanje. */
  mayInferCancellation: false;
  failure: FetchFailureKind;
}
