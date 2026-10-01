import { competitionId } from '../../../../packages/domain/src/index.ts';
import { sideSlug, teamIdForName } from '../names.ts';
import { extractPdfTextLines } from '../pdf-text.ts';
import { observedDraft } from './draft.ts';
import type { ParsedSource } from './types.ts';

const COMPETITION = competitionId('basketball', 'european', 'evroliga');
const MONTHS: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
  July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
};
const DATE = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2}) ([A-Za-z]+) (\d{4})$/;
const CLOCK = /^(\d{2}):(\d{2})$/;

export interface EuroleagueParse extends ParsedSource {
  durationMs: number;
  rounds: number;
}

/**
 * Podržan je samo ovaj štampani kalendar: 380 redova, 10 po kolu, redosled kola 1–38.
 * GMT kolona je UTC. LOCAL je sat dvorane, ne Beograd.
 * Kolo se ne izvodi iz rednog broja. Bez stvarnog ROUND naslova uz red, kolo ostaje prazno.
 */
export async function parseEuroleaguePdf(bytes: Uint8Array, fetchedAt: string): Promise<EuroleagueParse> {
  const started = performance.now();
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    return emptyEuroleague(performance.now() - started, 'Dokument ne počinje sa %PDF.');
  }
  const lines = await extractPdfTextLines(bytes);
  const rows = readRows(lines);
  const durationMs = performance.now() - started;
  const byRound = new Map<number, number>();
  const clubRounds = { partizan: new Set<number>(), zvezda: new Set<number>() };
  const drafts = rows.map((row) => {
    if (row.round !== null) byRound.set(row.round, (byRound.get(row.round) ?? 0) + 1);
    const homeId = teamIdForName('basketball', row.home);
    const awayId = teamIdForName('basketball', row.away);
    if (row.round !== null && (homeId.endsWith(':partizan') || awayId.endsWith(':partizan'))) clubRounds.partizan.add(row.round);
    if (row.round !== null && (homeId.endsWith(':crvena-zvezda') || awayId.endsWith(':crvena-zvezda'))) clubRounds.zvezda.add(row.round);
    const day = row.day.padStart(2, '0');
    const date = `${row.year}-${row.month}-${day}`;
    const startsAtUtc = `${date}T${row.gmt}:00Z`;
    return observedDraft({
      sport: 'basketball',
      competitionId: COMPETITION,
      seasonId: '2026-2027',
      homeTeamId: homeId,
      awayTeamId: awayId,
      scheduledLocalDate: date,
      printedLocalTime: row.local,
      startsAtUtc,
      sourceTimeZone: null,
      status: 'scheduled',
      venue: null,
      round: row.round === null ? null : String(row.round),
      sourceUrl: 'https://ftpserver.euroleague.net/media/2026-27_EL_RS_CALENDAR_PRINTABLE.pdf',
      provider: 'euroleague',
      providerFixtureId: `${sideSlug('basketball', row.home)}-${sideSlug('basketball', row.away)}`,
      fetchedAt,
    });
  });
  let clubsEveryRound = true;
  for (let round = 1; round <= 38; round += 1) {
    if (!clubRounds.partizan.has(round) || !clubRounds.zvezda.has(round) || byRound.get(round) !== 10) {
      clubsEveryRound = false;
    }
  }
  const pairIds = drafts.map((draft) => draft.providerFixtureId);
  const uniquePairs = new Set(pairIds).size === pairIds.length;
  const datesInSeason = rows.every((row) => {
    const date = `${row.year}-${row.month}-${row.day.padStart(2, '0')}`;
    return date >= '2026-09-01' && date <= '2027-06-15';
  });
  const titled = lines.some((line) => /2026\s*[-/]\s*27/.test(line));
  const roundsKnown = rows.every((row) => {
    const round = row.round;
    return round !== null && round >= 1 && round <= 38;
  }) && rows.some((row) => row.heading);
  const complete = rows.length === 380 && byRound.size === 38 && clubsEveryRound && uniquePairs && datesInSeason && titled && roundsKnown;
  const workerNote = `Merenje inflate+TJ: ${durationMs.toFixed(1)} ms zida ovog procesa. To nije obračunati CPU Cloudflare-a. pdftotext se ne poziva.`;
  return {
    drafts,
    complete,
    failure: complete ? 'none' : 'incomplete_page',
    confirmedUtc: drafts.filter((draft) => draft.startsAtUtc !== null).length,
    durationMs,
    rounds: byRound.size,
    competitions: [
      {
        id: COMPETITION,
        sport: 'basketball',
        name: 'Evroliga',
        scope: 'european',
        country: null,
        aliases: ['Euroleague'],
        providerIds: {},
      },
    ],
    evidence: `Evroliga regularna sezona PDF: redova ${rows.length}, kola ${byRound.size}, Partizan kola ${clubRounds.partizan.size}, Zvezda kola ${clubRounds.zvezda.size}. GMT je UTC, LOCAL je dvorana. Plej-of nije u ovom dokumentu. Javno preuzimanje nije dozvola za redistribuciju. ${workerNote}`,
  };
}

function readRows(lines: readonly string[]): Array<{
  round: number | null;
  heading: boolean;
  day: string;
  month: string;
  year: string;
  local: string;
  gmt: string;
  home: string;
  away: string;
}> {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const date = DATE.exec(lines[index] ?? '');
    if (!date) continue;
    const local = lines[index + 1] ?? '';
    const gmt = lines[index + 2] ?? '';
    const home = lines[index + 3] ?? '';
    const away = lines[index + 4] ?? '';
    if (!CLOCK.test(local) || !CLOCK.test(gmt) || !home || !away || DATE.test(home)) continue;
    const month = MONTHS[date[2] ?? ''];
    if (!month) continue;
    const heading = /^ROUND\s+(\d+)$/.exec((lines[index - 1] ?? '').trim());
    const round = heading ? Number(heading[1]) : null;
    rows.push({
      round: round !== null && round >= 1 && round <= 38 ? round : null,
      heading: round !== null,
      day: date[1] ?? '',
      month,
      year: date[3] ?? '',
      local,
      gmt,
      home,
      away,
    });
    index += 4;
  }
  return rows;
}

function emptyEuroleague(durationMs: number, reason: string): EuroleagueParse {
  return {
    drafts: [],
    complete: false,
    failure: 'incomplete_page',
    confirmedUtc: 0,
    durationMs,
    rounds: 0,
    competitions: [],
    evidence: `${reason} pdftotext se ne poziva.`,
  };
}
