import type { Sport, Team } from './types.ts';

/** Jedina četiri tima koja korisnik može da izabere u prvoj verziji. */
const SELECTABLE_TEAMS: readonly Team[] = [
  {
    id: 'football:rs:crvena-zvezda',
    sport: 'football',
    name: 'FK Crvena zvezda',
    shortName: 'Crvena zvezda',
    country: 'RS',
    city: 'Beograd',
    aliases: ['Crvena zvezda', 'FK Crvena zvezda'],
    providerIds: {},
  },
  {
    id: 'football:rs:partizan',
    sport: 'football',
    name: 'FK Partizan',
    shortName: 'Partizan',
    country: 'RS',
    city: 'Beograd',
    aliases: ['Partizan', 'FK Partizan'],
    providerIds: {},
  },
  {
    id: 'basketball:rs:crvena-zvezda',
    sport: 'basketball',
    name: 'KK Crvena zvezda',
    shortName: 'Crvena zvezda',
    country: 'RS',
    city: 'Beograd',
    aliases: ['Crvena zvezda', 'KK Crvena zvezda'],
    providerIds: {},
  },
  {
    id: 'basketball:rs:partizan',
    sport: 'basketball',
    name: 'KK Partizan',
    shortName: 'Partizan',
    country: 'RS',
    city: 'Beograd',
    aliases: ['Partizan', 'KK Partizan'],
    providerIds: {},
  },
];

export function selectableTeams(sport?: Sport): Team[] {
  return SELECTABLE_TEAMS
    .filter((team) => sport === undefined || team.sport === sport)
    .map((team) => ({ ...team, aliases: [...team.aliases], providerIds: { ...team.providerIds } }));
}

export function isSelectableTeamId(teamId: string, sport?: Sport): boolean {
  return SELECTABLE_TEAMS.some((team) => team.id === teamId && (sport === undefined || team.sport === sport));
}
