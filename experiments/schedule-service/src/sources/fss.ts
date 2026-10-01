import { competitionId } from '../../../../packages/domain/src/index.ts';
import type { ObservedFixtureDraft } from '../../../../packages/domain/src/index.ts';
import { foldName, teamIdForName } from '../names.ts';
import { observedDraft } from './draft.ts';
import { dottedDate, visibleText } from './html.ts';
import type { ParsedSource } from './types.ts';

const COMPETITION = competitionId('football', 'domestic', 'superliga-srbije');
const BLOCK =
  /fss-rezultati__one-date[^>]*>([^<]*)<\/div>[\s\S]*?fss-rezultati__one-city[^>]*>([^<]*)<\/div>[\s\S]*?fss-rezultati__teams[^>]*>([\s\S]*?)<\/a>[\s\S]*?fss-rezultati__result[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;

export function parseFssSuperliga(html: string, fetchedAt: string): ParsedSource {
  const titles = [...html.matchAll(/fss-rezultati__title">\s*([^<]*?)\s*</g)].map((match) => ({
    index: match.index ?? 0,
    label: visibleText(match[1] ?? ''),
  }));
  const drafts: ObservedFixtureDraft[] = [];
  const rounds = new Set<number>();
  for (const match of html.matchAll(BLOCK)) {
    const names = [...(match[3] ?? '').matchAll(/col-6">([^<]*)</g)].map((item) => visibleText(item[1] ?? ''));
    if (names.length < 2) continue;
    const when = dottedDate(visibleText(match[1] ?? ''));
    const title = titles.filter((item) => item.index < (match.index ?? 0)).at(-1);
    const roundMatch = /(\d+)\s*\.\s*kolo/.exec(foldName(title?.label ?? ''));
    const round = roundMatch ? Number(roundMatch[1]) : null;
    if (round !== null) rounds.add(round);
    const result = visibleText(match[4] ?? '');
    const finished = /\d/.test(result);
    const home = names[0] ?? '';
    const away = names[1] ?? '';
    if (round === null || !when) continue;
    drafts.push(
      observedDraft({
        sport: 'football',
        competitionId: COMPETITION,
        seasonId: '2026-2027',
        homeTeamId: teamIdForName('football', home),
        awayTeamId: teamIdForName('football', away),
        scheduledLocalDate: when.date,
        printedLocalTime: when.clock,
        startsAtUtc: null,
        sourceTimeZone: null,
        status: finished ? 'finished' : 'scheduled',
        venue: visibleText(match[2] ?? '') || null,
        round: String(round),
        sourceUrl: 'https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/',
        provider: 'fss',
        providerFixtureId: `${slugPart(home)}-${slugPart(away)}`,
        fetchedAt,
      }),
    );
  }
  const unique: ObservedFixtureDraft[] = [];
  let conflict = false;
  let repeated = 0;
  for (const draft of drafts) {
    const previous = unique.find((item) => item.providerFixtureId === draft.providerFixtureId);
    if (!previous) {
      unique.push(draft);
      continue;
    }
    repeated += 1;
    if (!sameFixture(previous, draft)) conflict = true;
  }
  const seasonTitle = /2026\s*[/.-]\s*27|26\s*[/.-]\s*27/.test(foldName(html));
  const datesInSeason = unique.every((draft) => {
    const date = draft.scheduledLocalDate;
    return date !== null && date >= '2026-07-01' && date <= '2027-06-30';
  });
  let roundsExact = rounds.size === 26;
  for (let round = 1; round <= 26; round += 1) {
    if (!rounds.has(round)) roundsExact = false;
  }
  const clubOnce = [':partizan', ':crvena-zvezda'].every((suffix) => {
    for (let round = 1; round <= 26; round += 1) {
      const count = unique.filter((draft) => draft.round === String(round) && (draft.homeTeamId.endsWith(suffix) || (draft.awayTeamId ?? '').endsWith(suffix))).length;
      if (count !== 1) return false;
    }
    return true;
  });
  const complete = seasonTitle && datesInSeason && roundsExact && clubOnce && !conflict && unique.length > 0;
  return {
    drafts: unique,
    complete,
    failure: complete ? 'none' : 'incomplete_page',
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
    evidence: `FSS Superliga: blokova ${unique.length}, kola ${[...rounds].sort((a, b) => a - b).join(',') || 'nema'}. Nema zone, pa UTC ostaje prazan. Budući 00:00 nije termin. Identitet je domaćin-gost, kolo je metadata. ${duplicateNote(conflict, repeated)} Naslov van 2026/27 ili kola koja nisu tačno 1–26 sa jednim mečom našeg kluba po kolu nisu potpuna strana. Stranica nema stabilan URL utakmice. Dozvola nije utvrđena.`,
  };
}

function sameFixture(left: ObservedFixtureDraft, right: ObservedFixtureDraft): boolean {
  return left.round === right.round
    && left.scheduledLocalDate === right.scheduledLocalDate
    && left.printedLocalTime === right.printedLocalTime
    && left.status === right.status
    && left.homeTeamId === right.homeTeamId
    && left.awayTeamId === right.awayTeamId;
}

function duplicateNote(conflict: boolean, repeated: number): string {
  if (conflict) return 'Isti par ima različite podatke.';
  if (repeated > 0) return 'Isti pregled istog para je odbačen.';
  return '';
}

function slugPart(name: string): string {
  return teamIdForName('football', name).split(':').at(-1) ?? 'tim';
}
