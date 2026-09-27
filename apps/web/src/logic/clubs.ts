import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';
import type { Sport, Team } from '../../../../packages/domain/src/types.ts';

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

/** Pretraga preko imena iz selectableTeams. Protivnici nisu u ovom skupu. */
export function foldSearch(value: string): string {
  let folded = '';
  for (const char of value.toLowerCase()) folded += CYRILLIC[char] ?? char;
  return folded.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'dj');
}

export function clubChoices(sport: Sport | 'all', query: string): Team[] {
  const source = sport === 'all' ? selectableTeams() : selectableTeams(sport);
  const needle = foldSearch(query.trim());
  if (!needle) return source;
  return source.filter((team) => {
    const haystack = [team.name, team.shortName, team.city, ...team.aliases].map(foldSearch);
    return haystack.some((value) => value.includes(needle));
  });
}

export function sportLabel(sport: Sport): string {
  return sport === 'football' ? 'Fudbal' : 'Košarka';
}
