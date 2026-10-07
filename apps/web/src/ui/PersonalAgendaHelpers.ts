import type { Fixture, Sport } from '../../../../packages/domain/src/types.ts';
import {
  addCalendarDays,
  compareAgendaEntries,
  fixtureCalendarDate,
  formatCalendarDate,
  localDateInZone,
  nextAgendaFixtures,
  reasonsForFixture,
  type AgendaEntry,
  type AgendaInclusionReason,
} from '../logic/agenda.ts';
import { calendarEligible } from '../logic/calendar.ts';

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

export const AGENDA_PAGE_SIZE = 20;

export type AgendaPeriod = 'today' | 'week' | 'all';
export type AgendaView = 'upcoming' | 'changes' | 'archive';
export type AgendaBucket = 'upcoming' | 'unconfirmed' | 'disrupted' | 'archive';

export interface AgendaQuery extends AgendaFilter {
  period: AgendaPeriod;
  view: AgendaView;
}

export const DEFAULT_AGENDA_QUERY: AgendaQuery = {
  ...EMPTY_AGENDA_FILTER,
  period: 'all',
  view: 'upcoming',
};

export const AGENDA_SPORT_OPTIONS = [
  [ALL_FILTER_VALUE, 'Sve'],
  ['football', 'Fudbal'],
  ['basketball', 'Košarka'],
] as const;

export const AGENDA_PERIOD_OPTIONS = [
  ['today', 'Danas'],
  ['week', '7 dana'],
  ['all', 'Sve'],
] as const;

export const AGENDA_VIEW_OPTIONS = [
  ['upcoming', 'Predstojeće'],
  ['changes', 'Promene'],
  ['archive', 'Arhiva'],
] as const;

/**
 * Ista podela kao groupUserAgenda: uživo ide u arhivu, bez oznake „Uživo”.
 * Odloženo i otkazano su poremećaj. Nepotvrđen sat nije predstojeći termin.
 */
export function agendaBucket(fixture: Fixture, nowMs: number): AgendaBucket {
  if (fixture.status === 'postponed' || fixture.status === 'cancelled') return 'disrupted';
  if (fixture.status === 'finished' || fixture.status === 'abandoned' || fixture.status === 'live') return 'archive';
  if (fixture.timeConfirmed && fixture.startsAtUtc !== null) {
    return Date.parse(fixture.startsAtUtc) < nowMs ? 'archive' : 'upcoming';
  }
  return 'unconfirmed';
}

/** Prethodni trenutak ili datum koji se razlikuje od aktuelnog jeste stvaran pomeraj. */
export function fixtureWasRescheduled(fixture: Fixture): boolean {
  const movedInstant = fixture.previousStartsAtUtc !== null && fixture.previousStartsAtUtc !== fixture.startsAtUtc;
  const movedDate = fixture.previousScheduledLocalDate !== null
    && fixture.previousScheduledLocalDate !== fixture.scheduledLocalDate;
  return movedInstant || movedDate;
}

/**
 * Predstojeće uključuje nepotvrđen sat, odlaganje i otkazivanje.
 * Promene zadržavaju to i dodaju potvrđen meč kojem je pomeran datum ili sat.
 * Završen pomeraj ostaje u arhivi.
 */
export function entriesForView(
  entries: readonly AgendaEntry[],
  view: AgendaView,
  nowMs: number,
): AgendaEntry[] {
  return entries.filter((entry) => {
    const bucket = agendaBucket(entry.fixture, nowMs);
    if (view === 'archive') return bucket === 'archive';
    if (view === 'changes') {
      return bucket === 'disrupted'
        || bucket === 'unconfirmed'
        || (bucket !== 'archive' && fixtureWasRescheduled(entry.fixture));
    }
    return bucket !== 'archive';
  });
}

/** „7 dana” je danas i narednih šest dana. Utakmica bez datuma nije u Danas ni u 7 dana. */
export function filterByPeriod(
  entries: readonly AgendaEntry[],
  period: AgendaPeriod,
  nowMs: number,
  timeZone: string,
): AgendaEntry[] {
  if (period === 'all') return [...entries];
  const today = localDateInZone(nowMs, timeZone);
  const allowed = new Set<string>();
  const span = period === 'today' ? 1 : 7;
  for (let index = 0; index < span; index += 1) allowed.add(addCalendarDays(today, index));
  return entries.filter((entry) => {
    const date = fixtureCalendarDate(entry.fixture, timeZone);
    return date !== null && allowed.has(date);
  });
}

/**
 * Redosled ekrana: lokalni datum u zoni prikaza, utakmice bez datuma na kraju.
 * Unutar istog dana ostaje postojeći poredak po satu i ID-u.
 * Domenski compareAgendaEntries se ne menja.
 */
export function compareAgendaForDisplay(left: AgendaEntry, right: AgendaEntry, timeZone: string): number {
  const leftDate = fixtureCalendarDate(left.fixture, timeZone);
  const rightDate = fixtureCalendarDate(right.fixture, timeZone);
  if (leftDate !== rightDate) {
    if (leftDate === null) return 1;
    if (rightDate === null) return -1;
    return leftDate < rightDate ? -1 : 1;
  }
  return compareAgendaEntries(left, right);
}

export function matchesForQuery(
  entries: readonly AgendaEntry[],
  query: AgendaQuery,
  nowMs: number,
  timeZone: string,
): AgendaEntry[] {
  const narrowed = applyAgendaFilters(entries, query);
  const viewed = entriesForView(narrowed, query.view, nowMs);
  return filterByPeriod(viewed, query.period, nowMs, timeZone)
    .sort((left, right) => compareAgendaForDisplay(left, right, timeZone));
}

export function activeAgendaFilterCount(query: AgendaQuery): number {
  let count = 0;
  if (query.sport !== ALL_FILTER_VALUE) count += 1;
  if (query.period !== 'all') count += 1;
  if (query.clubId !== ALL_FILTER_VALUE) count += 1;
  if (query.competitionId !== ALL_FILTER_VALUE) count += 1;
  if (query.view !== 'upcoming') count += 1;
  return count;
}

export function changeSport(query: AgendaQuery, sport: AgendaQuery['sport']): AgendaQuery {
  return { ...sportFilterChange(sport), period: query.period, view: query.view };
}

export interface AgendaDayGroup {
  key: string;
  label: string;
  entries: AgendaEntry[];
}

export function groupPageByDay(
  entries: readonly AgendaEntry[],
  timeZone: string,
  today: string,
): AgendaDayGroup[] {
  const groups: AgendaDayGroup[] = [];
  for (const entry of entries) {
    const date = fixtureCalendarDate(entry.fixture, timeZone);
    const key = date ?? 'undated';
    const label = date === null
      ? 'Bez potvrđenog datuma'
      : date === today
        ? 'Danas'
        : formatCalendarDate(date);
    const last = groups.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label, entries: [entry] });
  }
  return groups;
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize = AGENDA_PAGE_SIZE,
): { page: number; pages: number; items: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Number.isFinite(page) ? Math.min(Math.max(1, Math.trunc(page)), pages) : 1;
  const start = (current - 1) * pageSize;
  return { page: current, pages, items: items.slice(start, start + pageSize) };
}

export interface AgendaListState {
  query: AgendaQuery;
  page: number;
  selectedIds: readonly string[];
}

export function initialAgendaListState(): AgendaListState {
  return { query: DEFAULT_AGENDA_QUERY, page: 1, selectedIds: [] };
}

/** Promena filtera vraća prvu stranu i briše izbor. */
export function changeAgendaQuery(state: AgendaListState, query: AgendaQuery): AgendaListState {
  return { query, page: 1, selectedIds: [] };
}

/** Promena strane zadržava izbor. */
export function changeAgendaPage(state: AgendaListState, page: number): AgendaListState {
  return { ...state, page };
}

/** Odjava i zamena naloga brišu izbor. Filteri i strana ostaju. */
export function clearPrivateAgendaState(state: AgendaListState): AgendaListState {
  return { ...state, selectedIds: [] };
}

export function toggleAgendaSelection(state: AgendaListState, id: string, on: boolean): AgendaListState {
  const selected = new Set(state.selectedIds);
  if (on) selected.add(id);
  else selected.delete(id);
  return { ...state, selectedIds: [...selected] };
}

export function selectEligibleIds(entries: readonly AgendaEntry[]): string[] {
  return entries.filter((entry) => calendarEligible(entry.fixture)).map((entry) => entry.fixture.id);
}

export function selectAllEligible(state: AgendaListState, entries: readonly AgendaEntry[]): AgendaListState {
  return { ...state, selectedIds: selectEligibleIds(entries) };
}

export function revalidateSelectedIds(selected: readonly string[], entries: readonly AgendaEntry[]): string[] {
  const eligible = new Set(selectEligibleIds(entries));
  return selected.filter((id) => eligible.has(id));
}

/**
 * Sledeća je najraniji budući potvrđeni meč sa statusom zakazano ili
 * razrešen time_tbd. Odloženo, uživo i nepodobno za kalendar ne ulaze.
 */
export function nextFixtureIds(entries: readonly AgendaEntry[], nowMs: number): string[] {
  const candidates = entries.filter((entry) => {
    const fixture = entry.fixture;
    if (fixture.status !== 'scheduled' && fixture.status !== 'time_tbd') return false;
    if (!fixture.timeConfirmed || fixture.startsAtUtc === null) return false;
    const kick = Date.parse(fixture.startsAtUtc);
    return Number.isFinite(kick) && kick >= nowMs && calendarEligible(fixture);
  });
  return nextAgendaFixtures(candidates, nowMs).map((entry) => entry.fixture.id);
}

/**
 * Isto pravilo kao buildCalendarEvent: podobna utakmica bez potvrđenog
 * početka ide na 17:00. Sat se ne računa ovde.
 */
export function usesUnknownTimeFallback(fixture: Fixture): boolean {
  if (!calendarEligible(fixture)) return false;
  const known = fixture.timeConfirmed && !!fixture.startsAtUtc && Number.isFinite(Date.parse(fixture.startsAtUtc));
  return !known;
}

export function fallbackSelectionCount(entries: readonly AgendaEntry[], ids: readonly string[]): number {
  const wanted = new Set(ids);
  return entries.filter((entry) => wanted.has(entry.fixture.id) && usesUnknownTimeFallback(entry.fixture)).length;
}
