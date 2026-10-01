import { emptyParse, type ParsedSource } from './types.ts';

export function parseKkPartizan(html: string): ParsedSource {
  const iso = [...html.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map((match) => `${match[1]}-${match[2]}-${match[3]}`);
  const reversed = [...html.matchAll(/\b(\d{2})-(\d{2})-(20\d{2})\b/g)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);
  const dates = [...iso, ...reversed];
  const inSeason = dates.filter((date) => date >= '2026-07-01' && date <= '2027-06-30');
  if (dates.length > 0 && inSeason.length === 0) {
    return emptyParse(
      `KK Partizan: datumi na strani su van sezone 2026-2027 (viđeno ${dates[0]}). To nije učestvovanje ni prazan raspored ove sezone.`,
    );
  }
  if (inSeason.length === 0) {
    return emptyParse('KK Partizan: strana nema datuma sezone 2026-2027.', 'incomplete_page');
  }
  return emptyParse(
    `KK Partizan: na strani ima ${inSeason.length} datuma u sezoni, ali klubovska lista nije potpun kalendar i ne objavljuje se kao sezona.`,
    'incomplete_page',
  );
}

export function parseKkCz(html: string): ParsedSource {
  if (html.includes('{{date}}') || html.includes('{{gameId}}')) {
    return emptyParse(
      'KK Crvena zvezda: javni HTML je šablon bez datuma. To nije prazan raspored i nije dokaz da utakmica nema.',
      'incomplete_page',
    );
  }
  return emptyParse('KK Crvena zvezda: kalendar nije pročitan kao objavljen raspored.', 'incomplete_page');
}

export function parseKls(html: string): ParsedSource {
  const mentionsClub = /partizan|zvezda|звезда/i.test(html);
  const mentionsDate = /\d{2}\.\d{2}\.20\d{2}|20\d{2}-\d{2}-\d{2}/.test(html);
  if (!mentionsClub && !mentionsDate) {
    return emptyParse(
      'KLS kalendar: nema pomena dva kluba ni datuma utakmice. To nije dokaz da ne učestvuju; prolećna faza može doći kasnije.',
    );
  }
  return emptyParse(
    `KLS kalendar: klub ${mentionsClub ? 'pomenut' : 'nije pomenut'}, datum ${mentionsDate ? 'postoji' : 'nije viđen'}. Strana se ne uzima kao cela sezona.`,
    'incomplete_page',
  );
}
