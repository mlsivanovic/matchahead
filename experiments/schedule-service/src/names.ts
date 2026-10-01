import { teamId } from '../../../packages/domain/src/index.ts';
import type { Sport } from '../../../packages/domain/src/index.ts';

const FOLD: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j',
  к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
  č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj',
};

export function foldName(value: string): string {
  let folded = '';
  for (const char of value.normalize('NFC').toLowerCase()) folded += FOLD[char] ?? char;
  return folded.normalize('NFD').replace(/\p{M}/gu, '');
}

export function slugify(value: string): string {
  const slug = foldName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Ime nema slug.');
  return slug;
}

/** Poznati klub dobija rs identitet. Protivnik zadržava sponzora i zemlju xx. */
export function teamIdForName(sport: Sport, name: string): string {
  const folded = foldName(name).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const withoutPrefix = folded.replace(/^(fk|kk|hkk)\s+/, '');
  const club = withoutPrefix.replace(/\bmeridianbet\b/g, '').replace(/\bmozzart bet\b/g, '').replace(/\s+/g, ' ').trim();
  if (club === 'crvena zvezda' || club === 'crvena zvezda belgrade' || club === 'crvena zvezda beograd') {
    return teamId(sport, 'rs', 'crvena-zvezda');
  }
  if (club === 'partizan' || club === 'partizan belgrade' || club === 'partizan beograd') {
    return teamId(sport, 'rs', 'partizan');
  }
  return teamId(sport, 'xx', slugify(name));
}

export function sideSlug(sport: Sport, name: string): string {
  const id = teamIdForName(sport, name);
  if (id.endsWith(':crvena-zvezda')) return 'crvena-zvezda';
  if (id.endsWith(':partizan')) return 'partizan';
  return slugify(name);
}

export interface IdMapping {
  fromProvider: string;
  fromId: string;
  toProvider: string;
  toId: string;
}

/** Prazno u produkciji. Isti par i datum bez ove tabele ostaju dva identiteta. */
export const PRODUCTION_ID_MAPPINGS: readonly IdMapping[] = [];

export function applyIdMapping<T extends { provider: string; providerFixtureId: string }>(
  draft: T,
  mappings: readonly IdMapping[],
): T {
  const hit = mappings.find((item) => item.fromProvider === draft.provider && item.fromId === draft.providerFixtureId);
  if (!hit) return draft;
  if (hit.toId.includes(':')) throw new Error('Mapiran ID ne sme sadržati dvotačku.');
  return { ...draft, provider: hit.toProvider, providerFixtureId: hit.toId };
}
