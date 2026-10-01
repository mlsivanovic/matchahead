import { competitionId, selectableTeams } from '../../../packages/domain/src/index.ts';
import type { Competition, Sport, Team } from '../../../packages/domain/src/index.ts';

export const ALLOWED_FETCH_HOSTS = [
  'www.aba-liga.com',
  'fss.rs',
  'partizan.rs',
  'www.crvenazvezdafk.com',
  'partizan.basketball',
  'kkcrvenazvezda.rs',
  'kls.rs',
  'ftpserver.euroleague.net',
] as const;

export const USER_AGENT = 'MatchAheadScheduleProbe/0.1';
export const MAX_SOURCE_BYTES = 3_000_000;

export interface SourceDocument {
  provider: string;
  url: string;
  timeoutMs: number;
  kind: 'html' | 'pdf';
}

export const SOURCE_DOCUMENTS: Record<Sport, readonly SourceDocument[]> = {
  football: [
    {
      provider: 'fss',
      url: 'https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/',
      timeoutMs: 12_000,
      kind: 'html',
    },
    { provider: 'fk-partizan', url: 'https://partizan.rs/utakmice', timeoutMs: 12_000, kind: 'html' },
    {
      provider: 'fk-crvena-zvezda',
      url: 'https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati',
      timeoutMs: 12_000,
      kind: 'html',
    },
  ],
  basketball: [
    { provider: 'aba-liga', url: 'https://www.aba-liga.com/calendar/26/1/', timeoutMs: 12_000, kind: 'html' },
    { provider: 'kk-partizan', url: 'https://partizan.basketball/takmicenja', timeoutMs: 12_000, kind: 'html' },
    { provider: 'kk-crvena-zvezda', url: 'https://kkcrvenazvezda.rs/calendar', timeoutMs: 12_000, kind: 'html' },
    { provider: 'kls', url: 'https://kls.rs/kalendar/', timeoutMs: 12_000, kind: 'html' },
    {
      provider: 'euroleague',
      url: 'https://ftpserver.euroleague.net/media/2026-27_EL_RS_CALENDAR_PRINTABLE.pdf',
      timeoutMs: 20_000,
      kind: 'pdf',
    },
  ],
};

export function teamById(id: string): Team {
  const team = [...selectableTeams('football'), ...selectableTeams('basketball')].find((item) => item.id === id);
  if (!team) throw new Error('Tim nije u katalogu.');
  return team;
}

export function catalogCompetitions(sport: Sport): Competition[] {
  if (sport === 'football') {
    return [
      competition('football', 'domestic', 'superliga-srbije', 'Superliga Srbije', 'RS'),
      competition('football', 'domestic', 'kup-srbije', 'Kup Srbije', 'RS'),
      competition('football', 'european', 'liga-konferencije', 'Liga konferencije', null),
    ];
  }
  return [
    competition('basketball', 'regional', 'aba-liga', 'ABA liga', null),
    competition('basketball', 'european', 'evroliga', 'Evroliga', null),
    competition('basketball', 'european', 'evroliga-plej-of', 'Evroliga plej-of', null),
    competition('basketball', 'domestic', 'kls', 'Košarkaška liga Srbije', 'RS'),
    competition('basketball', 'domestic', 'kup-koraca', 'Kup Radivoja Koraća', 'RS'),
  ];
}

function competition(
  sport: Sport,
  scope: 'domestic' | 'regional' | 'european',
  slug: string,
  name: string,
  country: string | null,
): Competition {
  return {
    id: competitionId(sport, scope, slug),
    sport,
    name,
    scope,
    country,
    aliases: [name],
    providerIds: {},
  };
}

const PROVIDER_COMPETITION: Record<string, string> = {
  fss: competitionId('football', 'domestic', 'superliga-srbije'),
  'fk-partizan': competitionId('football', 'domestic', 'superliga-srbije'),
  'fk-crvena-zvezda': competitionId('football', 'domestic', 'superliga-srbije'),
  'aba-liga': competitionId('basketball', 'regional', 'aba-liga'),
  'kk-partizan': competitionId('basketball', 'european', 'evroliga'),
  'kk-crvena-zvezda': competitionId('basketball', 'european', 'evroliga'),
  kls: competitionId('basketball', 'domestic', 'kls'),
  euroleague: competitionId('basketball', 'european', 'evroliga'),
};

export function competitionForProvider(provider: string): string {
  return PROVIDER_COMPETITION[provider] ?? provider;
}

export function assertAllowlisted(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL izvora nije ispravan.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Izvor mora biti https.');
  if (!ALLOWED_FETCH_HOSTS.includes(parsed.hostname as (typeof ALLOWED_FETCH_HOSTS)[number])) {
    throw new Error('Domaćin nije na listi javnih izvora.');
  }
  return parsed;
}
