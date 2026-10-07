import { reasonsForFixture, type AgendaEntry, type AgendaInclusionReason } from '../logic/agenda.ts';
import type { Sport } from '../../../../packages/domain/src/types.ts';

/** Ime za prikaz; protivnik može biti neodređen, a strani ID nepoznat. */
export interface NamedRef {
  id: string;
  name: string;
}

export function teamDisplayName(teamId: string | null, teams: readonly NamedRef[]): string {
  if (teamId === null) return 'Protivnik nije određen';
  return teams.find((team) => team.id === teamId)?.name ?? 'Nepoznat tim';
}

/**
 * Razlog uključivanja čitljiv korisniku. Praćeni klub se imenuje, ručni
 * izbor je odvojen. Reč „omiljeno” se namerno ne koristi: omiljeno nije
 * praćenje u aplikaciji.
 */
export function reasonLabel(reason: AgendaInclusionReason, teams: readonly NamedRef[]): string {
  if (reason.kind === 'manual_selection') return 'Ručni izbor';
  return `Pratim u aplikaciji: ${teamDisplayName(reason.teamId, teams)}`;
}

export interface CatalogRowState {
  manuallySelected: boolean;
  followedTeamIds: string[];
  /** Uklanjanje ručnog izbora ne skida utakmicu koju pokriva praćenje. */
  staysAfterManualRemoval: boolean;
  toggleLabel: string;
  toggleNote: string | null;
}

/**
 * Stanje jednog reda kataloga za ručno dodavanje/uklanjanje.
 * Katalog je nezavisan od praćenih klubova: svaka utakmica se nudi.
 */
export function catalogRowState(
  fixture: Pick<{ id: string; homeTeamId: string; awayTeamId: string | null }, 'id' | 'homeTeamId' | 'awayTeamId'>,
  followedTeamIds: readonly string[],
  manualFixtureIds: readonly string[],
): CatalogRowState {
  const reasons = reasonsForFixture(fixture, followedTeamIds, manualFixtureIds);
  const manuallySelected = reasons.some((reason) => reason.kind === 'manual_selection');
  const followed: string[] = [];
  for (const reason of reasons) {
    if (reason.kind === 'followed_team' && !followed.includes(reason.teamId)) followed.push(reason.teamId);
  }
  return {
    manuallySelected,
    followedTeamIds: followed,
    staysAfterManualRemoval: manuallySelected && followed.length > 0,
    toggleLabel: manuallySelected ? 'Ukloni ručni izbor' : 'Dodaj ručno',
    toggleNote:
      manuallySelected && followed.length > 0
        ? 'Uklanjanje ručnog izbora ne uklanja utakmicu: ostaje jer pratiš klub.'
        : !manuallySelected && followed.length > 0
          ? 'U agendi jer pratiš klub; ručno dodavanje nije potrebno.'
          : null,
  };
}

export const ALL_FILTER_VALUE = 'all';

export interface AgendaFilter {
  sport: Sport | typeof ALL_FILTER_VALUE;
  clubId: string;
  competitionId: string;
}

export const EMPTY_AGENDA_FILTER: AgendaFilter = {
  sport: ALL_FILTER_VALUE,
  clubId: ALL_FILTER_VALUE,
  competitionId: ALL_FILTER_VALUE,
};

/**
 * Promena sporta poništava izbor kluba i takmičenja: prethodni izbor
 * može pripadati drugom sportu pa filter više ne bi imao važeću
 * opciju. Opcije kluba/takmičenja se zato izvode iz agende sužene
 * na izabrani sport.
 */
export function sportFilterChange(sport: AgendaFilter['sport']): AgendaFilter {
  return { sport, clubId: ALL_FILTER_VALUE, competitionId: ALL_FILTER_VALUE };
}

/** Agenda sužena na sport pre izvođenja opcija kluba i takmičenja. */
export function entriesForSport(entries: readonly AgendaEntry[], sport: AgendaFilter['sport']): AgendaEntry[] {
  if (sport === ALL_FILTER_VALUE) return [...entries];
  return entries.filter((entry) => entry.fixture.sport === sport);
}

export function applyAgendaFilters(entries: readonly AgendaEntry[], filter: AgendaFilter): AgendaEntry[] {
  return entries.filter((entry) => {
    if (filter.sport !== ALL_FILTER_VALUE && entry.fixture.sport !== filter.sport) return false;
    if (
      filter.clubId !== ALL_FILTER_VALUE
      && entry.fixture.homeTeamId !== filter.clubId
      && entry.fixture.awayTeamId !== filter.clubId
    ) {
      return false;
    }
    if (filter.competitionId !== ALL_FILTER_VALUE && entry.fixture.competitionId !== filter.competitionId) {
      return false;
    }
    return true;
  });
}

/** Klubovi koji se pojavljuju u agendi, sortirani po imenu. */
export function clubOptionsForAgenda(entries: readonly AgendaEntry[], teams: readonly NamedRef[]): NamedRef[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    seen.add(entry.fixture.homeTeamId);
    if (entry.fixture.awayTeamId !== null) seen.add(entry.fixture.awayTeamId);
  }
  return [...seen]
    .map((id) => ({ id, name: teamDisplayName(id, teams) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'sr'));
}

/** Takmičenja koja se pojavljuju u agendi, sortirana po imenu. */
export function competitionOptionsForAgenda(
  entries: readonly AgendaEntry[],
  competitions: readonly NamedRef[],
): NamedRef[] {
  const seen = new Set<string>();
  for (const entry of entries) seen.add(entry.fixture.competitionId);
  return [...seen]
    .map((id) => ({ id, name: competitions.find((item) => item.id === id)?.name ?? 'Nepoznato takmičenje' }))
    .sort((left, right) => left.name.localeCompare(right.name, 'sr'));
}
