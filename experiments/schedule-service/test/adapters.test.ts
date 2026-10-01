import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';

import { zonedWallTimeToUtc } from '../src/kickoff.ts';
import { applyIdMapping, teamIdForName } from '../src/names.ts';
import { parseAbaCalendar } from '../src/sources/aba.ts';
import { parseCzSchedule } from '../src/sources/cz-football.ts';
import { parseEuroleaguePdf } from '../src/sources/euroleague-pdf.ts';
import { parseFssSuperliga } from '../src/sources/fss.ts';
import { parseKkCz, parseKkPartizan, parseKls } from '../src/sources/gates.ts';
import { parsePartizanNuxt } from '../src/sources/partizan-football.ts';

test('Beogradski zidni sat ima zimski i letnji pomeraj', () => {
  assert.equal(zonedWallTimeToUtc('2027-01-15', '13:00', 'Europe/Belgrade'), '2027-01-15T12:00:00Z');
  assert.equal(zonedWallTimeToUtc('2027-07-15', '13:00', 'Europe/Belgrade'), '2027-07-15T11:00:00Z');
  assert.equal(zonedWallTimeToUtc('2026-10-02', '18:30', 'Europe/Belgrade'), '2026-10-02T16:30:00Z');
  assert.equal(zonedWallTimeToUtc('2027-01-08', '20:00', 'Europe/Belgrade'), '2027-01-08T19:00:00Z');
});

test('poznati klubovi dobijaju rs identitet, protivnik zadržava sponzora', () => {
  assert.equal(teamIdForName('basketball', 'Crvena zvezda Meridianbet'), 'basketball:rs:crvena-zvezda');
  assert.equal(teamIdForName('basketball', 'Partizan Mozzart Bet Belgrade'), 'basketball:rs:partizan');
  assert.equal(teamIdForName('football', 'ЦРВЕНА ЗВЕЗДА'), 'football:rs:crvena-zvezda');
  assert.equal(teamIdForName('football', 'ПАРТИЗАН'), 'football:rs:partizan');
  assert.equal(teamIdForName('basketball', 'Borac Mozzart'), 'basketball:xx:borac-mozzart');
});

test('mapiranje je izričito, a isti par bez mape nije isti ID', () => {
  const draft = { provider: 'synthetic-alt', providerFixtureId: 'raw-9', pair: 'a' };
  const mapped = applyIdMapping(draft, [
    { fromProvider: 'synthetic-alt', fromId: 'raw-9', toProvider: 'synthetic', toId: 'stable-1' },
  ]);
  assert.equal(mapped.provider, 'synthetic');
  assert.equal(mapped.providerFixtureId, 'stable-1');
  const unmapped = applyIdMapping({ ...draft, providerFixtureId: 'raw-8' }, []);
  assert.equal(unmapped.providerFixtureId, 'raw-8');
  assert.notEqual(unmapped.providerFixtureId, mapped.providerFixtureId);
});

test('ABA potvrđuje Beograd samo uz Cluj i različite satove', () => {
  const proved = parseAbaCalendar(abaHtml(true, ['18:30', '12:00']), '2026-10-02T12:00:00Z');
  const evening = proved.drafts.find((draft) => draft.providerFixtureId === '15');
  assert.equal(evening?.startsAtUtc, null);
  assert.equal(evening?.scheduledLocalDate, '2026-10-02');
  assert.equal(evening?.printedLocalTime, '18:30');
  assert.equal(evening?.homeTeamId, 'basketball:rs:partizan');
  const clujRow = proved.drafts.find((draft) => draft.providerFixtureId === '27');
  assert.equal(clujRow?.startsAtUtc, zonedWallTimeToUtc('2026-10-11', '13:00', 'Europe/Bucharest'));
  assert.equal(clujRow?.sourceTimeZone, 'Europe/Bucharest');

  const sameClock = parseAbaCalendar(abaHtml(true, ['18:30', '18:30']), '2026-10-02T12:00:00Z');
  assert.equal(sameClock.drafts.find((draft) => draft.providerFixtureId === '15')?.startsAtUtc, null);
  assert.equal(sameClock.drafts.find((draft) => draft.providerFixtureId === '27')?.sourceTimeZone, 'Europe/Bucharest');

  const noProof = parseAbaCalendar(abaHtml(false, ['18:30', '20:30']), '2026-10-02T12:00:00Z');
  assert.equal(noProof.drafts.every((draft) => draft.startsAtUtc === null), true);
  assert.equal(noProof.drafts[0]?.scheduledLocalDate, '2026-10-02');
  assert.match(proved.evidence, /Dozvola/);
});

test('FSS nema zonu, 00:00 nije termin, rezultat zatvara utakmicu', () => {
  const parsed = parseFssSuperliga(
    `
    <div class="fss-rezultati__title"> 1. kolo </div>
    <div class="fss-rezultati__one-date">17.07.2026 20:00</div>
    <div class="fss-rezultati__one-city">Београд</div>
    <a class="fss-rezultati__teams"><div class="col-6">ПАРТИЗАН</div><div class="col-6">ЦРВЕНА ЗВЕЗДА</div></a>
    <div class="fss-rezultati__result"><div>1</div><div>0</div></div></div>
    <div class="fss-rezultati__one-date">10.10.2026. 00:00</div>
    <div class="fss-rezultati__one-city">Београд</div>
    <a class="fss-rezultati__teams"><div class="col-6">ЦРВЕНА ЗВЕЗДА</div><div class="col-6">МАЧВА</div></a>
    <div class="fss-rezultati__result"><div>/</div><div>/</div></div></div>
    `,
    '2026-10-02T12:00:00Z',
  );
  assert.equal(parsed.confirmedUtc, 0);
  assert.equal(parsed.drafts[0]?.status, 'finished');
  assert.equal(parsed.drafts[0]?.startsAtUtc, null);
  assert.equal(parsed.drafts[0]?.homeTeamId, 'football:rs:partizan');
  assert.equal(parsed.drafts[1]?.status, 'time_tbd');
  assert.equal(parsed.drafts[1]?.printedLocalTime, null);
  assert.equal(parsed.drafts[0]?.providerFixtureId, 'partizan-crvena-zvezda');
  assert.equal(parsed.drafts[0]?.round, '1');
  assert.equal(parsed.complete, false);
});

test('Partizanov javni blok ne veruje praznoj zoni ni nuli', () => {
  const payload = [
    { matchesScheduled: 1, matchesCompleted: 2 },
    [3],
    [4],
    { matchId: 5, matchStatus: 6, matchTime: 7, timezone: 8, roundNumber: 9, phaseName: 10, home_team: 11, away_team: 12 },
    { matchId: 13, matchStatus: 14, matchTime: 15, timezone: 8, roundNumber: 16, phaseName: 10, home_team: 12, away_team: 11 },
    235,
    'SCHEDULED',
    '0000-00-00 00:00:00',
    '',
    '11',
    '11. kolo Mozzart Bet SLS 2026/27',
    { teamName: 17 },
    { teamName: 18 },
    225,
    'POSTPONED',
    '2026-08-08 00:00:00',
    '4',
    'FK Partizan',
    'FK Novi Pazar',
  ];
  const html = `<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
  const parsed = parsePartizanNuxt(html, '2026-10-02T12:00:00Z');
  assert.equal(parsed.complete, false);
  assert.equal(parsed.failure, 'incomplete_page');
  assert.equal(parsed.drafts[0]?.scheduledLocalDate, null);
  assert.equal(parsed.drafts[0]?.startsAtUtc, null);
  assert.equal(parsed.drafts[1]?.status, 'postponed');
  assert.equal(parsed.drafts[1]?.startsAtUtc, null);
  assert.match(parsed.evidence, /nije UTC/);
  assert.equal(html.includes('preMatchText'), false);
});

test('stranica Zvezde ne koristi hero sat i nema zonu', () => {
  const html = `
    <div wized="match-date">10.10.2026 13:00</div>
    <div class="superliga-schedule-item" data-location="Zvezda u gostima">
      <div class="filter-text">Superliga</div>
      <div>11 . kolo</div>
      <div raspored-date="">10.10.2026</div>
      <div raspored-time="">.</div>
      <div class="table-team-name">RADNIČKI 1923</div>
      <div class="table-team-name">CRVENA ZVEZDA</div>
      <a href="/sr-latn/utakmice/radnicki-1923---crvena-zvezda-3"></a>
    </div>`;
  const parsed = parseCzSchedule(html, '2026-10-02T12:00:00Z');
  assert.equal(parsed.complete, false);
  assert.equal(parsed.drafts[0]?.homeTeamId, 'football:xx:radnicki-1923');
  assert.equal(parsed.drafts[0]?.awayTeamId, 'football:rs:crvena-zvezda');
  assert.equal(parsed.drafts[0]?.startsAtUtc, null);
  assert.equal(parsed.drafts[0]?.printedLocalTime, null);
  assert.equal(parsed.drafts.some((draft) => draft.printedLocalTime === '13:00'), false);
});

test('pogrešna sezona, JS šablon i prazan KLS nisu prazan raspored', () => {
  const partizan = parseKkPartizan('<td>30-09-2025</td><td>Partizan Mozzart Bet Belgrade</td>');
  assert.equal(partizan.drafts.length, 0);
  assert.match(partizan.evidence, /van sezone/);
  const shell = parseKkCz('{"date":"{{date}}","gameId":"{{gameId}}"}');
  assert.equal(shell.failure, 'incomplete_page');
  assert.match(shell.evidence, /nije prazan/);
  const kls = parseKls('<h1>Kalendar</h1>');
  assert.match(kls.evidence, /nije dokaz/);
  assert.equal(kls.drafts.length, 0);
});

test('mali PDF čita GMT kao UTC bez spoljnog procesa', async () => {
  const text = [
    '[(Thursday, 24 September 2026)] TJ',
    '[(20:00)] TJ',
    '[(18:00)] TJ',
    '[(CRVENA ZVEZDA MERIDIANBET BELGRADE)] TJ',
    '[(ZALGIRIS KAUNAS)] TJ',
  ].join(' ');
  const parsed = await parseEuroleaguePdf(tinyPdf(text), '2026-09-01T00:00:00Z');
  assert.equal(parsed.complete, false);
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0]?.startsAtUtc, '2026-09-24T18:00:00Z');
  assert.equal(parsed.drafts[0]?.homeTeamId, 'basketball:rs:crvena-zvezda');
  assert.equal(parsed.drafts[0]?.providerFixtureId, 'crvena-zvezda-zalgiris-kaunas');
  assert.equal(parsed.drafts[0]?.round, null);
  assert.match(parsed.evidence, /pdftotext se ne poziva/);
  assert.doesNotMatch(parsed.evidence, /pdftotext se poziva/);
});

function abaHtml(cluj: boolean, clocks: string[]): string {
  const second = cluj
    ? `Sunday, 11.10.2026 ${clocks[1]} CET (13:00 Cluj-Napoca local time)`
    : `Sunday, 11.10.2026 ${clocks[1]} CET`;
  return `
    <h4>ROUND 1</h4>
    <p class="hidden-xs"><a href="https://www.aba-liga.com/match/15/26/1/Overview/a">Partizan Mozzart Bet <span>:</span> Cedevita Olimpija</a></p>
    <td class="scoretable"></td><td class="locationtable">Friday, 02.10.2026 ${clocks[0]} CET</td>
    <p class="hidden-xs"><a href="https://www.aba-liga.com/match/27/26/1/Overview/b">Cedevita Olimpija <span>:</span> Dubai Basketball</a></p>
    <td class="scoretable"></td><td class="locationtable">${second}</td>`;
}

function tinyPdf(commands: string): Uint8Array {
  const stream = deflateSync(Buffer.from(commands));
  const head = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`);
  const tail = Buffer.from('\nendstream\nendobj\n');
  return Buffer.concat([head, stream, tail]);
}
