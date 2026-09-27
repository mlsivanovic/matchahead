import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { competitionId, teamId } from '../../../packages/domain/src/identity.ts';
import { contentHash } from '../../../packages/domain/src/normalize.ts';
import { isSelectableTeamId, selectableTeams } from '../../../packages/domain/src/selectable-teams.ts';
import { timeErrors } from '../../../packages/domain/src/time.ts';
import type { Competition, Fixture, Team } from '../../../packages/domain/src/types.ts';

const fetchedAt = '2026-09-20T08:00:00.000Z';
const seasonId = 'demo-sezona';
const footballCompetition = competitionId('football', 'demo', 'demo-liga');
const basketballCompetition = competitionId('basketball', 'demo', 'demo-liga');

const opponents: Team[] = [
  team('football', 'xx', 'demo-rival-sever', 'DEMO Rival Sever'),
  team('football', 'xx', 'demo-rival-istok', 'DEMO Rival Istok'),
  team('football', 'xx', 'demo-rival-morava', 'DEMO Rival Morava'),
  team('basketball', 'xx', 'demo-rival-jug', 'DEMO Rival Jug'),
  team('basketball', 'xx', 'demo-rival-zapad', 'DEMO Rival Zapad'),
];

const competitions: Competition[] = [
  {
    id: footballCompetition,
    sport: 'football',
    name: 'DEMO liga',
    scope: 'other',
    country: null,
    aliases: ['DEMO liga'],
    providerIds: { demo: 'demo-liga-f' },
  },
  {
    id: basketballCompetition,
    sport: 'basketball',
    name: 'DEMO košarkaška liga',
    scope: 'other',
    country: null,
    aliases: ['DEMO košarkaška liga'],
    providerIds: { demo: 'demo-liga-b' },
  },
];

const drafts = [
  draft({
    sport: 'football',
    competitionId: footballCompetition,
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-27T17:00:00Z',
    scheduledLocalDate: '2026-09-27',
    timeConfirmed: true,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: 'DEMO kolo 1',
    providerFixtureId: 'fx-zvezda-sever',
  }),
  draft({
    sport: 'football',
    competitionId: footballCompetition,
    homeTeamId: 'football:xx:demo-rival-istok',
    awayTeamId: 'football:rs:partizan',
    startsAtUtc: '2026-09-30T15:00:00Z',
    scheduledLocalDate: '2026-09-30',
    timeConfirmed: true,
    status: 'scheduled',
    venue: 'DEMO stadion Istok',
    round: 'DEMO kolo 2',
    providerFixtureId: 'fx-partizan-gostovanje',
  }),
  draft({
    sport: 'football',
    competitionId: footballCompetition,
    homeTeamId: 'football:rs:partizan',
    awayTeamId: 'football:xx:demo-rival-morava',
    startsAtUtc: '2026-09-29T18:00:00Z',
    scheduledLocalDate: '2026-09-29',
    timeConfirmed: true,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: 'DEMO kolo 3',
    providerFixtureId: 'fx-partizan-morava',
  }),
  draft({
    sport: 'basketball',
    competitionId: basketballCompetition,
    homeTeamId: 'basketball:rs:crvena-zvezda',
    awayTeamId: 'basketball:xx:demo-rival-jug',
    startsAtUtc: '2026-10-02T16:30:00Z',
    scheduledLocalDate: '2026-10-02',
    timeConfirmed: true,
    status: 'scheduled',
    venue: 'DEMO dvorana',
    round: 'DEMO kolo 4',
    providerFixtureId: 'fx-kk-zvezda-jug',
  }),
  draft({
    sport: 'basketball',
    competitionId: basketballCompetition,
    homeTeamId: 'basketball:rs:partizan',
    awayTeamId: 'basketball:xx:demo-rival-zapad',
    startsAtUtc: null,
    scheduledLocalDate: '2026-10-10',
    timeConfirmed: false,
    status: 'time_tbd',
    venue: 'DEMO dvorana',
    round: 'DEMO kolo 5',
    providerFixtureId: 'fx-kk-partizan-zapad',
  }),
  draft({
    sport: 'basketball',
    competitionId: basketballCompetition,
    homeTeamId: 'basketball:rs:crvena-zvezda',
    awayTeamId: null,
    startsAtUtc: null,
    scheduledLocalDate: '2026-10-03',
    timeConfirmed: false,
    status: 'time_tbd',
    venue: null,
    round: 'DEMO žreb nije održan',
    providerFixtureId: 'fx-kk-zvezda-zreb',
  }),
  draft({
    sport: 'football',
    competitionId: footballCompetition,
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: null,
    scheduledLocalDate: null,
    timeConfirmed: false,
    status: 'postponed',
    previousStartsAtUtc: '2026-09-25T17:00:00Z',
    previousScheduledLocalDate: '2026-09-25',
    venue: 'DEMO stadion',
    round: 'DEMO kolo 0',
    providerFixtureId: 'fx-zvezda-odlozeno',
  }),
  draft({
    sport: 'football',
    competitionId: footballCompetition,
    homeTeamId: 'football:rs:partizan',
    awayTeamId: 'football:xx:demo-rival-morava',
    startsAtUtc: '2026-09-01T17:00:00Z',
    scheduledLocalDate: '2026-09-01',
    timeConfirmed: true,
    status: 'finished',
    venue: 'DEMO stadion',
    round: 'DEMO kolo prošlo',
    providerFixtureId: 'fx-partizan-proslo',
  }),
];

for (const fixture of drafts) {
  const errors = timeErrors(fixture);
  if (errors.length > 0) {
    throw new Error(`${fixture.id}: ${errors.join(' ')}`);
  }
  const involved = [fixture.homeTeamId, fixture.awayTeamId].filter((id): id is string => id !== null);
  if (!involved.some((id) => isSelectableTeamId(id))) {
    throw new Error(`${fixture.id} ne uključuje klub iz selectableTeams.`);
  }
  if (fixture.provider !== 'demo' || fixture.demo !== true) {
    throw new Error(`${fixture.id} nije označen kao DEMO.`);
  }
}

if (!drafts.some((fixture) => fixture.awayTeamId !== null && !isSelectableTeamId(fixture.awayTeamId))) {
  throw new Error('Nema protivnika van kataloga.');
}
if (!drafts.some((fixture) => !isSelectableTeamId(fixture.homeTeamId) && fixture.awayTeamId !== null && isSelectableTeamId(fixture.awayTeamId))) {
  throw new Error('Nema gostovanja kod protivnika van kataloga.');
}

const schedule = {
  kind: 'synthetic-demo',
  notProductionData: true,
  provider: 'demo',
  publication: 'forbidden',
  warning: 'DEMO utakmice. Nisu preuzete ni iz jednog sportskog izvora i nisu stvarni termini.',
  fetchedAt,
  staleAfterHours: 12,
  teams: [...selectableTeams(), ...opponents],
  competitions,
  fixtures: drafts,
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/demo-schedule.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(schedule, null, 2)}\n`);

function team(sport: 'football' | 'basketball', country: string, slug: string, name: string): Team {
  return {
    id: teamId(sport, country, slug),
    sport,
    name,
    shortName: name,
    country,
    city: 'DEMO grad',
    aliases: [name],
    providerIds: { demo: slug },
  };
}

function draft(input: {
  sport: 'football' | 'basketball';
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startsAtUtc: string | null;
  scheduledLocalDate: string | null;
  timeConfirmed: boolean;
  status: Fixture['status'];
  venue: string | null;
  round: string;
  providerFixtureId: string;
  previousStartsAtUtc?: string | null;
  previousScheduledLocalDate?: string | null;
}): Fixture & { demo: true } {
  const fixture: Fixture & { demo: true } = {
    demo: true,
    id: [
      input.sport,
      input.competitionId,
      seasonId,
      'demo',
      input.providerFixtureId,
    ].join(':'),
    sport: input.sport,
    competitionId: input.competitionId,
    seasonId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    startsAtUtc: input.startsAtUtc,
    scheduledLocalDate: input.scheduledLocalDate,
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: input.timeConfirmed,
    previousStartsAtUtc: input.previousStartsAtUtc ?? null,
    previousScheduledLocalDate: input.previousScheduledLocalDate ?? null,
    status: input.status,
    venue: input.venue,
    round: input.round,
    sourceUrl: `synthetic://demo/${input.providerFixtureId}`,
    provider: 'demo',
    providerFixtureId: input.providerFixtureId,
    fetchedAt,
    sourceUpdatedAt: null,
    contentHash: '',
    revision: 1,
  };
  fixture.contentHash = contentHash(fixture);
  return fixture;
}
