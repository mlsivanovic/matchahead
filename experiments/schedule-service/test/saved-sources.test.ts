import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseAbaCalendar } from '../src/sources/aba.ts';
import { parseCzSchedule } from '../src/sources/cz-football.ts';
import { parseEuroleaguePdf } from '../src/sources/euroleague-pdf.ts';
import { parseFssSuperliga } from '../src/sources/fss.ts';
import { parseKkCz, parseKkPartizan, parseKls } from '../src/sources/gates.ts';
import { parsePartizanNuxt } from '../src/sources/partizan-football.ts';

/**
 * Opcioni živi snimak. Obavezne provere identiteta, potpunosti i zone su u adapters.test.ts.
 * Nedostatak fajla preskače samo taj snimak i ispisuje razlog.
 */
const root = '/tmp/ma-sources';
const fetchedAt = '2026-10-01T18:00:00Z';

function saved(name: string): string | false {
  const path = `${root}/${name}`;
  return existsSync(path) ? false : `nema ${path}`;
}

test('opciono: ABA snimak', { skip: saved('aba.html') }, () => {
  const aba = parseAbaCalendar(readFileSync(`${root}/aba.html`, 'utf8'), fetchedAt);
  const regular = (suffix: string) => aba.drafts.filter((draft) => /^ROUND\s+(?:[1-9]|1[0-8])$/.test(draft.round ?? '') && (draft.homeTeamId.endsWith(suffix) || (draft.awayTeamId ?? '').endsWith(suffix))).length;
  const partizanRounds = regular(':partizan');
  const zvezdaRounds = regular(':crvena-zvezda');
  assert.equal(aba.complete, partizanRounds === 18 && zvezdaRounds === 18);
  assert.equal(aba.failure, aba.complete ? 'none' : 'incomplete_page');
  assert.ok(partizanRounds > 0);
  assert.ok(zvezdaRounds > 0);
  const evening = aba.drafts.find((draft) => draft.providerFixtureId === '15');
  assert.equal(evening?.startsAtUtc, null);
  assert.equal(evening?.scheduledLocalDate, '2026-10-02');
  assert.equal(evening?.printedLocalTime, '18:30');
  assert.match(aba.evidence, /26\/1/);
});

test('opciono: FSS snimak', { skip: saved('fss.html') }, () => {
  const fss = parseFssSuperliga(readFileSync(`${root}/fss.html`, 'utf8'), fetchedAt);
  assert.equal(fss.confirmedUtc, 0);
  assert.equal(fss.complete, false);
  assert.ok(fss.drafts.length > 100);
  assert.ok(fss.drafts.some((draft) => draft.status === 'finished'));
  assert.ok(fss.drafts.some((draft) => draft.status === 'time_tbd'));
  assert.equal(fss.drafts.some((draft) => draft.startsAtUtc !== null), false);
  assert.equal(fss.drafts.some((draft) => /^k\d+-/.test(draft.providerFixtureId)), false);
});

test('opciono: Partizan snimak', { skip: saved('partizan.html') }, () => {
  const partizan = parsePartizanNuxt(readFileSync(`${root}/partizan.html`, 'utf8'), fetchedAt);
  assert.equal(partizan.complete, false);
  assert.equal(partizan.drafts.filter((draft) => draft.status === 'scheduled' || draft.status === 'time_tbd').length, 1);
  assert.ok(partizan.drafts.some((draft) => draft.status === 'postponed'));
  assert.equal(partizan.drafts.every((draft) => draft.startsAtUtc === null), true);
});

test('opciono: Zvezda snimak', { skip: saved('czv.html') }, () => {
  const cz = parseCzSchedule(readFileSync(`${root}/czv.html`, 'utf8'), fetchedAt);
  assert.equal(cz.complete, false);
  assert.ok(cz.drafts.length >= 10);
  assert.equal(cz.drafts.every((draft) => draft.startsAtUtc === null), true);
  assert.equal(cz.drafts.some((draft) => draft.printedLocalTime === '13:00'), false);
});

test('opciono: KK Partizan, KK Zvezda i KLS', { skip: saved('kkpart.html') || saved('kkczv.html') || saved('kls.html') }, () => {
  const kkPartizan = parseKkPartizan(readFileSync(`${root}/kkpart.html`, 'utf8'));
  assert.equal(kkPartizan.drafts.length, 0);
  assert.match(kkPartizan.evidence, /2026-2027/);
  const kkCz = parseKkCz(readFileSync(`${root}/kkczv.html`, 'utf8'));
  assert.equal(kkCz.failure, 'incomplete_page');
  const kls = parseKls(readFileSync(`${root}/kls.html`, 'utf8'));
  assert.equal(kls.drafts.length, 0);
});

test('opciono: Evroliga PDF snimak', { skip: saved('el-2026-27.pdf') }, async () => {
  const euroleague = await parseEuroleaguePdf(readFileSync(`${root}/el-2026-27.pdf`), fetchedAt);
  assert.equal(euroleague.complete, false);
  assert.equal(euroleague.drafts.length, 380);
  assert.equal(euroleague.rounds, 0);
  const january = euroleague.drafts.find(
    (draft) => draft.scheduledLocalDate === '2027-01-08' && draft.homeTeamId.endsWith(':crvena-zvezda'),
  );
  assert.equal(january?.startsAtUtc, '2027-01-08T19:00:00Z');
  assert.match(euroleague.evidence, /pdftotext se ne poziva/);
  assert.match(euroleague.evidence, /nije obračunati CPU/);
  assert.ok(euroleague.durationMs > 0);
  console.log(`euroleague-node-wall-ms=${euroleague.durationMs.toFixed(1)}`);
});
