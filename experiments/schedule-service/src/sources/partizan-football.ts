import { competitionId } from '../../../../packages/domain/src/index.ts';
import type { FixtureStatus } from '../../../../packages/domain/src/index.ts';
import { teamIdForName } from '../names.ts';
import { observedDraft } from './draft.ts';
import { isoDateTime } from './html.ts';
import { emptyParse, type ParsedSource } from './types.ts';

const COMPETITION = competitionId('football', 'domestic', 'superliga-srbije');
const SKIP = new Set(['preMatchText', 'postMatchText', 'logoS1', 'image', 'logo']);

interface MatchRecord {
  matchId?: number | string;
  matchStatus?: string;
  matchTime?: string;
  timezone?: string;
  roundNumber?: string;
  phaseName?: string;
  home_team?: { teamName?: string };
  away_team?: { teamName?: string };
}

export function parsePartizanNuxt(html: string, fetchedAt: string): ParsedSource {
  const raw = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return emptyParse('FK Partizan: nema javnog __NUXT_DATA__ bloka na strani.', 'incomplete_page');
  let data: unknown[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return emptyParse('FK Partizan: NUXT blok nije niz.', 'incomplete_page');
    data = parsed;
  } catch {
    return emptyParse('FK Partizan: NUXT blok nije JSON.', 'incomplete_page');
  }
  const lists = findMatchLists(data);
  if (!lists) return emptyParse('FK Partizan: nema liste utakmica u javnom bloku.', 'incomplete_page');
  const { scheduled, completed } = lists;
  const matches = [...scheduled, ...completed];
  const drafts = matches.flatMap((match) => toDraft(match, fetchedAt));
  return {
    drafts,
    complete: false,
    failure: 'incomplete_page',
    confirmedUtc: 0,
    competitions: [
      {
        id: COMPETITION,
        sport: 'football',
        name: 'Superliga Srbije',
        scope: 'domestic',
        country: 'RS',
        aliases: ['Superliga Srbije'],
        providerIds: {},
      },
    ],
    evidence: `FK Partizan javni blok: zakazanih ${scheduled.length}, odigranih ${completed.length}. timezone je prazan, pa polje matchTimeUTC nije UTC. 0000-00-00 nije datum. Ovo nije cela buduća sezona i ne objavljuje se kao sezona. Dozvola nije utvrđena.`,
  };
}

function toDraft(match: MatchRecord, fetchedAt: string) {
  const home = match.home_team?.teamName;
  const away = match.away_team?.teamName;
  if (!home || !away || match.matchId === undefined) return [];
  const phase = match.phaseName ?? '';
  if (!/2026\/27|2026-2027/.test(phase) && !/2026-/.test(match.matchTime ?? '')) return [];
  const when = isoDateTime(match.matchTime ?? '');
  const status = mapStatus(match.matchStatus ?? '');
  const clock = when?.clock === '00:00' ? '00:00' : (when?.clock ?? null);
  return [
    observedDraft({
      sport: 'football',
      competitionId: COMPETITION,
      seasonId: '2026-2027',
      homeTeamId: teamIdForName('football', home),
      awayTeamId: teamIdForName('football', away),
      scheduledLocalDate: when?.date ?? null,
      printedLocalTime: clock,
      startsAtUtc: null,
      sourceTimeZone: null,
      status,
      venue: null,
      round: match.roundNumber ?? null,
      sourceUrl: 'https://partizan.rs/utakmice',
      provider: 'fk-partizan',
      providerFixtureId: String(match.matchId),
      fetchedAt,
    }),
  ];
}

function mapStatus(status: string): FixtureStatus {
  if (status === 'POSTPONED') return 'postponed';
  if (status === 'COMPLETE') return 'finished';
  if (status === 'CANCELLED') return 'cancelled';
  return 'scheduled';
}

function asMatches(value: unknown): MatchRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MatchRecord => Boolean(item) && typeof item === 'object');
}

function findMatchLists(data: unknown[]): { scheduled: MatchRecord[]; completed: MatchRecord[] } | null {
  for (const entry of data) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as { matchesScheduled?: unknown; matchesCompleted?: unknown };
    if (typeof record.matchesScheduled !== 'number' || typeof record.matchesCompleted !== 'number') continue;
    const scheduled = asMatches(deref(data, record.matchesScheduled, new Set()));
    const completed = asMatches(deref(data, record.matchesCompleted, new Set()));
    if (scheduled.length + completed.length > 0) return { scheduled, completed };
  }
  return null;
}

function deref(data: unknown[], index: number, seen: Set<number>): unknown {
  if (!Number.isInteger(index) || index < 0 || index >= data.length || seen.has(index)) return null;
  const value = data[index];
  if (value === null || typeof value !== 'object') return value;
  const next = new Set(seen);
  next.add(index);
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'number' ? deref(data, item, next) : item));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SKIP.has(key)) continue;
    output[key] = typeof item === 'number' ? deref(data, item, next) : item;
  }
  return output;
}
