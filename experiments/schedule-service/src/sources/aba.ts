import { competitionId, isUntrustedKickoffClock } from '../../../../packages/domain/src/index.ts';
import { zonedWallTimeToUtc } from '../kickoff.ts';
import { teamIdForName } from '../names.ts';
import { observedDraft } from './draft.ts';
import { visibleText } from './html.ts';
import type { ParsedSource } from './types.ts';

const ROW =
  /<p class="hidden-xs">\s*<a href="(https:\/\/www\.aba-liga\.com\/match\/(\d+)\/26\/1\/[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="scoretable">([\s\S]*?)<\/td>[\s\S]*?<td class="locationtable">([\s\S]*?)<\/td>/g;

const COMPETITION = competitionId('basketball', 'regional', 'aba-liga');

interface Row {
  id: string;
  url: string;
  home: string;
  away: string;
  date: string | null;
  clock: string | null;
  cluj: string | null;
  finished: boolean;
  round: string | null;
}

export function parseAbaCalendar(html: string, fetchedAt: string): ParsedSource {
  const rows = readRows(html);
  const rounds = new Set<number>();
  const drafts = rows.flatMap((row) => {
    if (!row.home || !row.away) return [];
    const roundNumber = /^ROUND\s+(\d+)$/.exec(row.round ?? '');
    if (roundNumber) rounds.add(Number(roundNumber[1]));
    const clujTrusted = row.cluj !== null && !isUntrustedKickoffClock({ printedLocalTime: row.cluj, startsAtUtc: null });
    const startsAtUtc = clujTrusted && row.date && row.cluj ? zonedWallTimeToUtc(row.date, row.cluj, 'Europe/Bucharest') : null;
    return [
      observedDraft({
        sport: 'basketball',
        competitionId: COMPETITION,
        seasonId: '2026-2027',
        homeTeamId: teamIdForName('basketball', row.home),
        awayTeamId: teamIdForName('basketball', row.away),
        scheduledLocalDate: row.date,
        printedLocalTime: row.clock,
        startsAtUtc,
        sourceTimeZone: startsAtUtc ? 'Europe/Bucharest' : null,
        status: row.finished ? 'finished' : 'scheduled',
        venue: null,
        round: row.round,
        sourceUrl: row.url,
        provider: 'aba-liga',
        providerFixtureId: row.id,
        fetchedAt,
      }),
    ];
  });
  let roundsExact = true;
  for (let round = 1; round <= 18; round += 1) {
    if (!rounds.has(round)) roundsExact = false;
  }
  const inRegular = (round: string | null) => {
    const match = /^ROUND\s+(\d+)$/.exec(round ?? '');
    return match !== null && Number(match[1]) >= 1 && Number(match[1]) <= 18;
  };
  const clubCount = (suffix: string) => drafts.filter((draft) => inRegular(draft.round) && (draft.homeTeamId.endsWith(suffix) || (draft.awayTeamId ?? '').endsWith(suffix))).length;
  const ids = drafts.map((draft) => draft.providerFixtureId);
  const uniqueIds = new Set(ids).size === ids.length;
  const complete = roundsExact && uniqueIds && clubCount(':partizan') === 18 && clubCount(':crvena-zvezda') === 18;
  const clubRows = clubCount(':partizan') + clubCount(':crvena-zvezda');
  const confirmedUtc = drafts.filter((draft) => draft.startsAtUtc !== null).length;
  return {
    drafts,
    complete,
    failure: complete ? 'none' : 'incomplete_page',
    confirmedUtc,
    competitions: [
      {
        id: COMPETITION,
        sport: 'basketball',
        name: 'ABA liga',
        scope: 'regional',
        country: null,
        aliases: ['ABA liga'],
        providerIds: { 'aba-liga': '26/1' },
      },
    ],
    evidence: `ABA kalendar 26/1: redova ${rows.length}, mečeva naša dva kluba u kolima 1–18 je ${clubRows}. Potpunost traži tačno kola 1–18 i tačno 18 mečeva po klubu. UTC postoji samo na redu koji sam ispisuje Cluj-Napoca, preko Europe/Bucharest. CET na ostalim redovima ne dokazuje Beograd. Potvrđenih UTC ${confirmedUtc}. Dozvola za objavu nije utvrđena.`,
  };
}

function readRows(html: string): Row[] {
  const rows: Row[] = [];
  for (const match of html.matchAll(ROW)) {
    const names = visibleText(match[3] ?? '').split(/\s+:\s+/).map((part) => part.trim()).filter(Boolean);
    if (names.length !== 2) continue;
    const when = visibleText(match[5] ?? '');
    const dateMatch = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(when);
    const cluj = /\((\d{2}:\d{2})\s+Cluj-Napoca local time\)/i.exec(when);
    const score = visibleText(match[4] ?? '');
    const index = match.index ?? 0;
    rows.push({
      id: match[2] ?? '',
      url: match[1] ?? '',
      home: names[0] ?? '',
      away: names.slice(1).join(':'),
      date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
      clock: dateMatch?.[4] ?? null,
      cluj: cluj?.[1] ?? null,
      finished: /\d/.test(score),
      round: roundBefore(html, index),
    });
  }
  return rows;
}

function roundBefore(html: string, index: number): string | null {
  const slice = html.slice(0, index);
  const matches = [...slice.matchAll(/ROUND\s+\d+|PLAY-IN|PLAYOFF|FINAL(?:\s+[A-Z]+)?/g)];
  return matches.at(-1)?.[0] ?? null;
}
