import { isSelectableTeamId } from '../../../../packages/domain/src/selectable-teams.ts';
import { timeErrors } from '../../../../packages/domain/src/time.ts';
import type { Competition, Fixture, Team } from '../../../../packages/domain/src/types.ts';

export interface DemoFixture extends Fixture {
  demo: true;
}

export interface DemoSchedule {
  kind: 'synthetic-demo';
  notProductionData: true;
  provider: 'demo';
  publication: 'forbidden';
  warning: string;
  fetchedAt: string;
  staleAfterHours: number;
  teams: Team[];
  competitions: Competition[];
  fixtures: DemoFixture[];
}

export function isScheduleStale(fetchedAt: string, nowMs: number, staleAfterHours: number): boolean {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched)) return true;
  return nowMs - fetched > staleAfterHours * 60 * 60 * 1000;
}

/** Odbija fajl koji nije jasno označen sintetički DEMO. */
export function parseDemoSchedule(value: unknown): DemoSchedule {
  if (!value || typeof value !== 'object') throw new Error('Raspored nije objekat.');
  const record = value as Partial<DemoSchedule>;
  if (record.kind !== 'synthetic-demo' || record.notProductionData !== true || record.provider !== 'demo') {
    throw new Error('Raspored nije označen kao sintetički DEMO.');
  }
  if (record.publication !== 'forbidden') {
    throw new Error('DEMO raspored ne sme biti označen kao dozvoljen unos.');
  }
  if (typeof record.warning !== 'string' || !record.warning.includes('DEMO')) {
    throw new Error('Rasporedu nedostaje DEMO upozorenje.');
  }
  if (typeof record.fetchedAt !== 'string' || Number.isNaN(Date.parse(record.fetchedAt))) {
    throw new Error('fetchedAt nije trenutak.');
  }
  if (typeof record.staleAfterHours !== 'number' || record.staleAfterHours <= 0) {
    throw new Error('staleAfterHours mora biti pozitivan broj.');
  }
  if (!Array.isArray(record.teams) || !Array.isArray(record.competitions) || !Array.isArray(record.fixtures)) {
    throw new Error('Rasporedu nedostaju timovi, takmičenja ili utakmice.');
  }
  if (record.fixtures.length === 0) throw new Error('DEMO raspored je prazan.');
  for (const fixture of record.fixtures) {
    if (fixture.demo !== true || fixture.provider !== 'demo') {
      throw new Error('Utakmica nije označena kao DEMO.');
    }
    if (!fixture.sourceUrl.startsWith('synthetic://')) {
      throw new Error('DEMO utakmica nema sintetički izvor.');
    }
    const errors = timeErrors(fixture);
    if (errors.length > 0) throw new Error(errors.join(' '));
    const involved = [fixture.homeTeamId, fixture.awayTeamId].filter((id): id is string => id !== null);
    if (!involved.some((id) => isSelectableTeamId(id))) {
      throw new Error('DEMO utakmica ne uključuje klub iz selectableTeams.');
    }
  }
  return record as DemoSchedule;
}

export function competitionName(schedule: DemoSchedule, competitionId: string): string {
  return schedule.competitions.find((competition) => competition.id === competitionId)?.name ?? 'DEMO takmičenje';
}
