import type { Sport } from './types.ts';

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** FK i KK dele slug, ali sport je deo identiteta. */
export function teamId(sport: Sport, country: string, slug: string): string {
  assertToken('country', country);
  assertToken('slug', slug);
  return `${sport}:${country}:${slug}`;
}

export function competitionId(sport: Sport, scope: string, slug: string): string {
  assertToken('scope', scope);
  assertToken('slug', slug);
  return `${sport}:${scope}:${slug}`;
}

/**
 * Identitet iz poznatog ID-ja provajdera. Termin, kolo i sponzorsko ime
 * namerno nisu deo ključa: pomeranje ne sme napraviti drugu utakmicu.
 */
export function fixtureIdFromProvider(input: {
  sport: Sport;
  competitionId: string;
  seasonId: string;
  provider: string;
  providerFixtureId: string;
}): string {
  assertToken('provider', input.provider);
  if (!input.competitionId || !input.seasonId || !input.providerFixtureId) {
    throw new Error('Identitet utakmice traži takmičenje, sezonu i ID provajdera.');
  }
  if (input.providerFixtureId.includes(':')) {
    throw new Error('ID provajdera ne sme sadržati dvotačku.');
  }
  return [
    input.sport,
    input.competitionId,
    input.seasonId,
    input.provider,
    input.providerFixtureId,
  ].join(':');
}

function assertToken(label: string, value: string): void {
  if (!TOKEN.test(value)) {
    throw new Error(`${label} mora biti mali slug bez razmaka: ${value}`);
  }
}
