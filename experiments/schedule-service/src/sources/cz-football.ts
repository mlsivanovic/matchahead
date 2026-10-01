import { competitionId } from '../../../../packages/domain/src/index.ts';
import { teamIdForName } from '../names.ts';
import { observedDraft } from './draft.ts';
import { dottedDate, visibleText } from './html.ts';
import type { ParsedSource } from './types.ts';

const SUPER = competitionId('football', 'domestic', 'superliga-srbije');
const CONFERENCE = competitionId('football', 'european', 'liga-konferencije');

export function parseCzSchedule(html: string, fetchedAt: string): ParsedSource {
  const chunks = html.split('superliga-schedule-item').slice(1);
  const drafts = [];
  const seen = new Map<string, number>();
  for (const chunk of chunks) {
    const location = /data-location="([^"]*)"/.exec(chunk)?.[1] ?? '';
    const date = dottedDate(/raspored-date=""[^>]*>([^<]*)</.exec(chunk)?.[1] ?? '');
    const timeRaw = visibleText(/raspored-time=""[^>]*>([^<]*)</.exec(chunk)?.[1] ?? '');
    const clock = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : null;
    const names = [...chunk.matchAll(/table-team-name[^>]*>([^<]*)</g)].map((match) => visibleText(match[1] ?? ''));
    const opponent = names.find((name) => !/zvezda/i.test(name));
    const competitionName = visibleText(/filter-text">([^<]*)</.exec(chunk)?.[1] ?? '');
    const round = /(\d+)\s*\.\s*kolo/.exec(chunk)?.[1] ?? null;
    const href = /href="([^"]*\/utakmice\/[^"]+)"/.exec(chunk)?.[1] ?? '';
    if (!opponent || !date) continue;
    const away = /gostima/i.test(location);
    const home = /domacin|domaćin/i.test(location);
    if (!away && !home) continue;
    const competition = /konferenc/i.test(competitionName) ? CONFERENCE : SUPER;
    seen.set(competition, (seen.get(competition) ?? 0) + 1);
    const homeName = home ? 'Crvena zvezda' : opponent;
    const awayName = home ? opponent : 'Crvena zvezda';
    const slug = href.split('/').at(-1)?.replace(/[^a-z0-9-]+/gi, '') || `${round ?? 'x'}-${homeName}`;
    drafts.push(
      observedDraft({
        sport: 'football',
        competitionId: competition,
        seasonId: '2026-2027',
        homeTeamId: teamIdForName('football', homeName),
        awayTeamId: teamIdForName('football', awayName),
        scheduledLocalDate: date.date,
        printedLocalTime: clock,
        startsAtUtc: null,
        sourceTimeZone: null,
        status: 'scheduled',
        venue: null,
        round,
        sourceUrl: href.startsWith('http') ? href : `https://www.crvenazvezdafk.com${href}`,
        provider: 'fk-crvena-zvezda',
        providerFixtureId: slug,
        fetchedAt,
      }),
    );
  }
  return {
    drafts,
    complete: false,
    failure: 'incomplete_page',
    confirmedUtc: 0,
    competitions: [...seen.keys()].map((id) => ({
      id,
      sport: 'football' as const,
      name: id === CONFERENCE ? 'Liga konferencije' : 'Superliga Srbije',
      scope: id === CONFERENCE ? 'european' as const : 'domestic' as const,
      country: id === CONFERENCE ? null : 'RS',
      aliases: [],
      providerIds: {},
    })),
    evidence: `FK Crvena zvezda lista: redova ${drafts.length} (${[...seen.entries()].map(([id, count]) => `${id} ${count}`).join(', ') || 'nema'}). Hero 13:00 i skriveni 00:00 se ne koriste. Nema zone. Mesec u naslovu se ne koristi. Lista nije cela sezona. Dozvola nije utvrđena.`,
  };
}
