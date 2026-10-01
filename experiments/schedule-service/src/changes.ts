import type { Fixture, ScheduleChange } from '../../../packages/domain/src/index.ts';

/**
 * Indeks promena gleda objavljeni snimak. Nestanak nije otkazivanje.
 * Sama promena sale ne ulazi u indeks.
 */
export function diffFixtures(previous: readonly Fixture[], next: readonly Fixture[]): ScheduleChange[] {
  const before = new Map(previous.map((fixture) => [fixture.id, fixture]));
  const changes: ScheduleChange[] = [];
  for (const fixture of next) {
    const prior = before.get(fixture.id);
    if (!prior) {
      changes.push({ fixtureId: fixture.id, revision: fixture.revision, kind: 'new' });
      continue;
    }
    if (prior.contentHash === fixture.contentHash) continue;
    if (fixture.status === 'cancelled' && prior.status !== 'cancelled') {
      changes.push({ fixtureId: fixture.id, revision: fixture.revision, kind: 'cancelled' });
      continue;
    }
    if (fixture.status === 'postponed' && prior.status !== 'postponed') {
      changes.push({ fixtureId: fixture.id, revision: fixture.revision, kind: 'postponed' });
      continue;
    }
    const moved =
      prior.startsAtUtc !== fixture.startsAtUtc ||
      prior.scheduledLocalDate !== fixture.scheduledLocalDate ||
      prior.previousStartsAtUtc !== fixture.previousStartsAtUtc;
    if (moved) {
      changes.push({ fixtureId: fixture.id, revision: fixture.revision, kind: 'rescheduled' });
    }
  }
  return changes;
}
