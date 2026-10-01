import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUserAgenda,
  countdownLabel,
  fixtureCalendarDate,
  groupUserAgenda,
  kickoffText,
  localDateInZone,
  nextAgendaFixtures,
  nextConfirmedFixtures,
  reasonsForFixture,
  scheduleStatusLabel,
} from '../src/logic/agenda.ts';
import type { Fixture } from '../../../packages/domain/src/types.ts';

const ZVEZDA_FB = 'football:rs:crvena-zvezda';
const PARTIZAN_FB = 'football:rs:partizan';
const ZVEZDA_BB = 'basketball:rs:crvena-zvezda';

const NOW = Date.parse('2026-09-27T12:00:00Z');

function fx(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    sport: 'football',
    competitionId: 'football:demo:demo-liga',
    seasonId: 'demo-sezona',
    homeTeamId: PARTIZAN_FB,
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-30T17:00:00Z',
    scheduledLocalDate: '2026-09-30',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'DEMO stadion',
    round: 'DEMO kolo',
    sourceUrl: 'synthetic://demo/x',
    provider: 'demo',
    providerFixtureId: overrides.id,
    fetchedAt: '2026-09-20T08:00:00.000Z',
    sourceUpdatedAt: null,
    contentHash: 'abc',
    revision: 1,
    ...overrides,
  };
}

test('unija: dva praćena protivnika daju jedan red sa oba razloga', () => {
  const derby = fx({ id: 'derby', homeTeamId: ZVEZDA_FB, awayTeamId: PARTIZAN_FB });
  const agenda = buildUserAgenda([derby], [ZVEZDA_FB, PARTIZAN_FB], []);
  assert.equal(agenda.length, 1);
  assert.deepEqual(agenda[0]!.reasons, [
    { kind: 'followed_team', teamId: ZVEZDA_FB },
    { kind: 'followed_team', teamId: PARTIZAN_FB },
  ]);
});

test('unija: ručni izbor i praćenje iste utakmice daju jedan red sa oba razloga', () => {
  const one = fx({ id: 'one' });
  const agenda = buildUserAgenda([one], [PARTIZAN_FB], ['one']);
  assert.equal(agenda.length, 1);
  assert.deepEqual(agenda[0]!.reasons, [
    { kind: 'followed_team', teamId: PARTIZAN_FB },
    { kind: 'manual_selection', fixtureId: 'one' },
  ]);
});

test('uklanjanje jednog razloga čuva utakmicu koju pokriva drugi razlog', () => {
  const derby = fx({ id: 'derby', homeTeamId: ZVEZDA_FB, awayTeamId: PARTIZAN_FB });
  const both = buildUserAgenda([derby], [ZVEZDA_FB, PARTIZAN_FB], []);
  assert.equal(both.length, 1);
  const afterUnfollow = buildUserAgenda([derby], [ZVEZDA_FB], []);
  assert.equal(afterUnfollow.length, 1);
  assert.deepEqual(afterUnfollow[0]!.reasons, [{ kind: 'followed_team', teamId: ZVEZDA_FB }]);
  const manualKept = buildUserAgenda([derby], [ZVEZDA_FB], ['derby']);
  const manualAfterUnfollowAll = buildUserAgenda([derby], [], ['derby']);
  assert.equal(manualKept.length, 1);
  assert.equal(manualAfterUnfollowAll.length, 1);
  assert.deepEqual(manualAfterUnfollowAll[0]!.reasons, [{ kind: 'manual_selection', fixtureId: 'derby' }]);
  assert.equal(buildUserAgenda([derby], [], []).length, 0);
});

test('ručni izbor van praćenih klubova ulazi; nepoznat ručni ID se ignoriše', () => {
  const neutral = fx({
    id: 'neutral',
    homeTeamId: 'football:xx:demo-rival-sever',
    awayTeamId: 'football:xx:demo-rival-istok',
  });
  const agenda = buildUserAgenda([neutral], [PARTIZAN_FB], ['neutral', 'nepostojeci-id']);
  assert.deepEqual(agenda.map((entry) => entry.fixture.id), ['neutral']);
  assert.deepEqual(agenda[0]!.reasons, [{ kind: 'manual_selection', fixtureId: 'neutral' }]);
});

test('dupliran stabilan ID daje jedan red; prazni ulazi daju praznu agendu', () => {
  const first = fx({ id: 'dup', startsAtUtc: '2026-10-01T17:00:00Z' });
  const second = fx({ id: 'dup', startsAtUtc: '2026-10-02T17:00:00Z' });
  const agenda = buildUserAgenda([first, second], [PARTIZAN_FB], []);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0]!.fixture.startsAtUtc, '2026-10-01T17:00:00Z');
  assert.deepEqual(buildUserAgenda([], [], []), []);
  assert.deepEqual(nextAgendaFixtures([], NOW), []);
  const groups = groupUserAgenda([], NOW);
  assert.deepEqual(groups.upcoming, []);
  assert.deepEqual(groups.toBeAnnounced, []);
  assert.deepEqual(groups.disrupted, []);
  assert.deepEqual(groups.archive, []);
});

test('reasonsForFixture vraća prazno za utakmicu van agende', () => {
  const one = fx({ id: 'one' });
  assert.deepEqual(reasonsForFixture(one, [], []), []);
  assert.deepEqual(reasonsForFixture(one, [ZVEZDA_FB], []), []);
});

test('deterministički redosled: UTC rastuće, stabilan ključ za jednake termine', () => {
  const late = fx({ id: 'b-kasnije', startsAtUtc: '2026-10-02T17:00:00Z' });
  const early = fx({ id: 'c-ranije', startsAtUtc: '2026-09-28T17:00:00Z' });
  const tieA = fx({ id: 'a-isti', startsAtUtc: '2026-09-29T17:00:00Z' });
  const tieB = fx({ id: 'b-isti', startsAtUtc: '2026-09-29T17:00:00Z' });
  const agenda = buildUserAgenda([late, tieB, tieA, early], [PARTIZAN_FB], []);
  assert.deepEqual(
    agenda.map((entry) => entry.fixture.id),
    ['c-ranije', 'a-isti', 'b-isti', 'b-kasnije'],
  );
  const again = buildUserAgenda([early, tieA, tieB, late], [PARTIZAN_FB], []);
  assert.deepEqual(
    again.map((entry) => entry.fixture.id),
    ['c-ranije', 'a-isti', 'b-isti', 'b-kasnije'],
  );
});

test('grupe: predstojeće, termin naknadno, poremećaj i arhiva', () => {
  const future = fx({ id: 'future' });
  const tbd = fx({
    id: 'tbd',
    startsAtUtc: null,
    timeConfirmed: false,
    status: 'time_tbd',
    scheduledLocalDate: '2026-10-05',
  });
  const postponed = fx({ id: 'postponed', startsAtUtc: null, timeConfirmed: false, status: 'postponed' });
  const cancelled = fx({ id: 'cancelled', status: 'cancelled' });
  const past = fx({ id: 'past', startsAtUtc: '2026-09-01T17:00:00Z' });
  const finished = fx({ id: 'finished', status: 'finished', startsAtUtc: '2026-09-20T17:00:00Z' });
  const agenda = buildUserAgenda(
    [cancelled, finished, tbd, past, postponed, future],
    [PARTIZAN_FB],
    [],
  );
  const groups = groupUserAgenda(agenda, NOW);
  assert.deepEqual(groups.upcoming.map((entry) => entry.fixture.id), ['future']);
  assert.deepEqual(groups.toBeAnnounced.map((entry) => entry.fixture.id), ['tbd']);
  assert.deepEqual(
    groups.disrupted.map((entry) => entry.fixture.id).sort(),
    ['cancelled', 'postponed'],
  );
  assert.deepEqual(
    groups.archive.map((entry) => entry.fixture.id).sort(),
    ['finished', 'past'],
  );
});

test('sledeća: najraniji termin; istovremene vraćaju sve; TBD i prošle otpadaju', () => {
  const next1 = fx({ id: 'next-1', startsAtUtc: '2026-09-27T17:00:00Z' });
  const next2 = fx({ id: 'next-2', startsAtUtc: '2026-09-27T17:00:00Z' });
  const later = fx({ id: 'later', startsAtUtc: '2026-09-30T17:00:00Z' });
  const past = fx({ id: 'past', startsAtUtc: '2026-09-01T17:00:00Z' });
  const tbd = fx({
    id: 'tbd',
    startsAtUtc: null,
    timeConfirmed: false,
    status: 'time_tbd',
    scheduledLocalDate: '2026-09-27',
  });
  const cancelled = fx({ id: 'cancelled', startsAtUtc: '2026-09-27T17:00:00Z', status: 'cancelled' });
  const agenda = buildUserAgenda([later, tbd, past, cancelled, next2, next1], [PARTIZAN_FB], []);
  const next = nextAgendaFixtures(agenda, NOW);
  assert.deepEqual(
    next.map((entry) => entry.fixture.id).sort(),
    ['next-1', 'next-2'],
  );
  assert.equal(next.length, 2, 'ekran dodaje oznaku „još 1 u isto vreme”');
  const onlyPast = buildUserAgenda([past], [PARTIZAN_FB], []);
  assert.deepEqual(nextAgendaFixtures(onlyPast, NOW), []);
  const onlyTbd = buildUserAgenda([tbd], [], ['tbd']);
  assert.deepEqual(nextAgendaFixtures(onlyTbd, NOW), []);
});

test('sledeća nad agendom slaže se sa postojećim nextConfirmedFixtures', () => {
  const fixtures = [
    fx({ id: 'a', startsAtUtc: '2026-09-27T17:00:00Z' }),
    fx({ id: 'b', startsAtUtc: '2026-09-27T17:00:00Z' }),
    fx({ id: 'c', startsAtUtc: '2026-09-30T17:00:00Z' }),
  ];
  const agenda = buildUserAgenda(fixtures, [PARTIZAN_FB], []);
  assert.deepEqual(
    nextAgendaFixtures(agenda, NOW).map((entry) => entry.fixture.id).sort(),
    nextConfirmedFixtures(fixtures, NOW).map((item) => item.id).sort(),
  );
});

test('bezbedan status: prošla po rasporedu, nikad izvedeno uživo ili završeno', () => {
  const pastScheduled = fx({ id: 'past', startsAtUtc: '2026-09-01T17:00:00Z', status: 'scheduled' });
  assert.equal(scheduleStatusLabel(pastScheduled, NOW), 'Počela prema rasporedu');
  const liveClaim = fx({ id: 'live', status: 'live', startsAtUtc: '2026-09-27T10:00:00Z' });
  assert.equal(scheduleStatusLabel(liveClaim, NOW), 'Počela prema rasporedu');
  assert.notEqual(scheduleStatusLabel(liveClaim, NOW), 'Uživo');
  const explicitFinished = fx({ id: 'done', status: 'finished' });
  assert.equal(scheduleStatusLabel(explicitFinished, NOW), 'Završeno');
  const future = fx({ id: 'future', status: 'scheduled' });
  assert.equal(scheduleStatusLabel(future, NOW), 'Zakazano');
  assert.equal(countdownLabel(pastScheduled, NOW), null);
  assert.equal(countdownLabel(liveClaim, NOW), null);
});

test('izričit live nema odbrojavanje ni uz budući potvrđen termin', () => {
  const liveFuture = fx({ id: 'live-buduci', status: 'live', startsAtUtc: '2026-09-30T17:00:00Z' });
  assert.equal(scheduleStatusLabel(liveFuture, NOW), 'Počela prema rasporedu');
  assert.equal(countdownLabel(liveFuture, NOW), null);
});

test('ponoć UTC ostaje potvrđen termin; nepoznat sat nikad nije ponoć', () => {
  const midnight = fx({ id: 'midnight', startsAtUtc: '2026-10-01T00:00:00Z', timeConfirmed: true });
  const agenda = buildUserAgenda([midnight], [PARTIZAN_FB], []);
  assert.equal(agenda.length, 1);
  assert.equal(groupUserAgenda(agenda, NOW).upcoming.length, 1);
  assert.match(countdownLabel(midnight, NOW) ?? '', /^počinje za /);
  const tbd = fx({
    id: 'tbd',
    startsAtUtc: null,
    timeConfirmed: false,
    status: 'time_tbd',
    scheduledLocalDate: '2026-10-01',
  });
  assert.equal(tbd.startsAtUtc, null);
  assert.equal(countdownLabel(tbd, NOW), null);
  assert.equal(groupUserAgenda(buildUserAgenda([tbd], [], ['tbd']), NOW).toBeAnnounced.length, 1);
});

test('DST: isti UTC trenutak pada u različite lokalne datume pre i posle prelaza', () => {
  const beforeDst = fx({ id: 'pre', startsAtUtc: '2026-03-28T22:30:00Z', timeConfirmed: true });
  const afterDst = fx({ id: 'posle', startsAtUtc: '2026-03-29T22:30:00Z', timeConfirmed: true });
  assert.equal(localDateInZone(Date.parse(beforeDst.startsAtUtc!), 'Europe/Belgrade'), '2026-03-28');
  assert.equal(localDateInZone(Date.parse(afterDst.startsAtUtc!), 'Europe/Belgrade'), '2026-03-30');
  assert.equal(fixtureCalendarDate(beforeDst, 'Europe/Belgrade'), '2026-03-28');
  assert.equal(fixtureCalendarDate(afterDst, 'Europe/Belgrade'), '2026-03-30');
});

test('promena zone: isti termin grupiše se u drugi lokalni dan', () => {
  const late = fx({ id: 'late', startsAtUtc: '2026-09-27T22:30:00Z', timeConfirmed: true });
  assert.equal(fixtureCalendarDate(late, 'UTC'), '2026-09-27');
  assert.equal(fixtureCalendarDate(late, 'Europe/Belgrade'), '2026-09-28');
});

test('ponoćna granica: 23:30Z je juče u UTC, a sutra u Beogradu', () => {
  const edge = fx({ id: 'edge', startsAtUtc: '2026-09-27T22:30:00Z', timeConfirmed: true });
  assert.equal(localDateInZone(Date.parse(edge.startsAtUtc!), 'UTC'), '2026-09-27');
  assert.equal(localDateInZone(Date.parse(edge.startsAtUtc!), 'Europe/Belgrade'), '2026-09-28');
});

test('pomeranje termina čuva prethodni datum; otkazivanje ima raniji datum', () => {
  const movedWithNewTime = fx({
    id: 'moved-new',
    startsAtUtc: '2026-10-04T17:00:00Z',
    timeConfirmed: true,
    status: 'postponed',
    previousScheduledLocalDate: '2026-09-27',
  });
  assert.match(kickoffText(movedWithNewTime, 'Europe/Belgrade'), /4\. oktobar 2026/);
  assert.equal(movedWithNewTime.previousScheduledLocalDate, '2026-09-27');
  const movedWithoutTime = fx({
    id: 'moved-tbd',
    startsAtUtc: null,
    timeConfirmed: false,
    status: 'postponed',
    previousScheduledLocalDate: '2026-09-27',
  });
  assert.match(kickoffText(movedWithoutTime, 'Europe/Belgrade'), /Odloženo/);
  assert.match(kickoffText(movedWithoutTime, 'Europe/Belgrade'), /Raniji datum/);
  const cancelled = fx({
    id: 'cancelled',
    startsAtUtc: '2026-10-04T17:00:00Z',
    status: 'cancelled',
    timeConfirmed: true,
    previousScheduledLocalDate: '2026-09-27',
  });
  assert.match(kickoffText(cancelled, 'Europe/Belgrade'), /4\. oktobar 2026/);
  const groups = groupUserAgenda(
    buildUserAgenda([movedWithNewTime, movedWithoutTime, cancelled], [PARTIZAN_FB], []),
    NOW,
  );
  assert.equal(groups.disrupted.length, 3);
  assert.equal(groups.upcoming.length, 0);
});

test('filter po klubu ne skriva gostovanje; košarka ostaje odvojena', () => {
  const home = fx({
    id: 'home',
    homeTeamId: ZVEZDA_FB,
    awayTeamId: 'football:xx:demo-rival-sever',
    startsAtUtc: '2026-09-27T17:00:00Z',
  });
  const basket = fx({
    id: 'basket',
    sport: 'basketball',
    competitionId: 'basketball:demo:demo-liga',
    homeTeamId: ZVEZDA_BB,
    awayTeamId: 'basketball:xx:demo-rival',
    startsAtUtc: '2026-09-27T19:00:00Z',
  });
  const agenda = buildUserAgenda([home, basket], [ZVEZDA_FB, ZVEZDA_BB], []);
  assert.equal(agenda.length, 2);
  const fbOnly = agenda.filter((entry) => entry.fixture.sport === 'football');
  assert.deepEqual(fbOnly.map((entry) => entry.fixture.id), ['home']);
});

test('utakmica bez poznatog protivnika ulazi preko praćenog domaćina', () => {
  const unknownAway = fx({ id: 'no-rival', awayTeamId: null });
  const agenda = buildUserAgenda([unknownAway], [PARTIZAN_FB], []);
  assert.equal(agenda.length, 1);
});
