import type {
  FetchAssessment,
  FetchFailureKind,
  Fixture,
  ScheduleAvailability,
} from './types.ts';

/** Polja čija promena menja sadržaj događaja. fetchedAt i revision nisu među njima. */
const CONTENT_FIELDS = [
  'sport',
  'competitionId',
  'seasonId',
  'homeTeamId',
  'awayTeamId',
  'startsAtUtc',
  'scheduledLocalDate',
  'sourceTimeZone',
  'timeConfirmed',
  'previousStartsAtUtc',
  'previousScheduledLocalDate',
  'status',
  'venue',
  'round',
  'provider',
  'providerFixtureId',
] as const satisfies readonly (keyof Fixture)[];

export function contentHash(fixture: Pick<Fixture, (typeof CONTENT_FIELDS)[number]>): string {
  const canonical: Record<string, unknown> = {};
  for (const field of CONTENT_FIELDS) {
    canonical[field] = fixture[field];
  }
  return fnv1a32(JSON.stringify(canonical));
}

/**
 * Isti sadržaj zadržava reviziju. Promena termina ili statusa podiže je za jedan.
 * Nov zapis počinje od 1.
 */
export function nextRevision(previous: Fixture | null, nextHash: string): number {
  if (previous === null) return 1;
  if (previous.contentHash === nextHash) return previous.revision;
  return previous.revision + 1;
}

export function applyObservedFixture(previous: Fixture | null, next: Fixture): Fixture {
  const hash = contentHash(next);
  return {
    ...next,
    contentHash: hash,
    revision: nextRevision(previous, hash),
  };
}

/**
 * Prazan, nepotpun ili neuspeo odgovor ne briše prethodni raspored i ne
 * pretvara nestalu utakmicu u otkazivanje. Neobjavljen raspored dolazi samo
 * iz izričite oznake organizatora, ne iz prazne liste.
 */
export function assessFetch(input: {
  failure: FetchFailureKind;
  organizerMarkedUnpublished: boolean;
  teamNotInCompetition: boolean;
}): FetchAssessment {
  if (input.teamNotInCompetition) {
    return assessment('not_participant', true, 'none');
  }
  if (input.organizerMarkedUnpublished && input.failure === 'none') {
    return assessment('unpublished', true, 'none');
  }
  if (input.failure !== 'none') {
    return assessment('source_error', true, input.failure);
  }
  return assessment('published', false, 'none');
}

export function isExplicitCancellation(status: Fixture['status']): boolean {
  return status === 'cancelled';
}

function assessment(
  scheduleAvailability: ScheduleAvailability,
  keepPreviousSchedule: boolean,
  failure: FetchFailureKind,
): FetchAssessment {
  return {
    scheduleAvailability,
    keepPreviousSchedule,
    mayInferCancellation: false,
    failure,
  };
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
