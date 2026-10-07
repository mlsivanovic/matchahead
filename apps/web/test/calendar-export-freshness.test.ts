import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import type { Fixture } from '../../../packages/domain/src/types.ts';
import type { AgendaEntry } from '../src/logic/agenda.ts';
import { buildCalendarEvent } from '../src/logic/calendar.ts';
import type { CalendarWriteSource } from '../src/ui/CalendarExport.tsx';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) return nextLoad(url, { ...context, format: 'module-typescript' });
    return nextLoad(url, context);
  },
});

const {
  CALENDAR_SCHEDULE_CHANGED,
  calendarEventForInsert,
  calendarWriteSourceChanged,
  readCalendarWriteSource,
  runCalendarInsertBatch,
} = await import('../src/ui/CalendarExport.tsx');

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fss:derby-2026',
    sport: 'football',
    competitionId: 'superliga',
    seasonId: '2026-27',
    homeTeamId: 'zvezda',
    awayTeamId: 'partizan',
    startsAtUtc: null,
    scheduledLocalDate: '2026-10-06',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: false,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'time_tbd',
    venue: 'Stadion',
    round: '12',
    sourceUrl: 'https://example.com/fixtures',
    provider: 'fss',
    providerFixtureId: '12',
    fetchedAt: '2026-10-06T10:00:00Z',
    sourceUpdatedAt: null,
    contentHash: 'hash',
    revision: 1,
    ...overrides,
  };
}

const teams = [
  { id: 'zvezda', name: 'Zvezda' },
  { id: 'partizan', name: 'Partizan' },
];
const competitions = [{ id: 'superliga', name: 'Superliga' }];

function sourceOf(current: Fixture, note = ''): CalendarWriteSource | null {
  return readCalendarWriteSource([entry(current)], current.id, teams, competitions, 'Europe/Belgrade', note);
}

function entry(current: Fixture): AgendaEntry {
  return { fixture: current, reasons: [] };
}

test('nepromenjen izvor gradi događaj jednom', async () => {
  const current = fixture();
  let builds = 0;
  const result = await calendarEventForInsert(
    () => sourceOf(current),
    async (source) => {
      builds += 1;
      return buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
    },
    () => true,
  );
  assert.equal(builds, 1);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.event.start.dateTime, '2026-10-06T15:00:00.000Z');
  assert.match(result.event.description, /Vreme nije poznato/);
});

test('promena fixtura tokom digesta gradi događaj iz nove slike', async () => {
  let current = fixture();
  const confirmed = fixture({ status: 'scheduled', timeConfirmed: true, startsAtUtc: '2026-10-06T19:30:00Z' });
  let builds = 0;
  const result = await calendarEventForInsert(
    () => sourceOf(current),
    async (source) => {
      builds += 1;
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      if (builds === 1) current = confirmed;
      return pending;
    },
    () => true,
  );
  assert.equal(builds, 2);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.event.start.dateTime, '2026-10-06T19:30:00.000Z');
  assert.doesNotMatch(result.event.description, /Vreme nije poznato/);
  const stable = await buildCalendarEvent(fixture(), 'Zvezda — Partizan', 'Superliga', 'Europe/Belgrade');
  assert.equal(result.event.id, stable.id);
});

test('otkazivanje tokom digesta preskače već izgrađen događaj', async () => {
  let current = fixture();
  const result = await calendarEventForInsert(
    () => sourceOf(current),
    async (source) => {
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      current = fixture({ status: 'cancelled' });
      return pending;
    },
    () => true,
  );
  assert.deepEqual(result, { status: 'skip' });
  assert.equal(sourceOf(current), null);
});

test('druga promena tokom ponovne izgradnje ne vraća zastareo događaj', async () => {
  let current = fixture();
  let builds = 0;
  const result = await calendarEventForInsert(
    () => sourceOf(current),
    async (source) => {
      builds += 1;
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      current = fixture({
        venue: builds === 1 ? 'Prva izmena' : 'Druga izmena',
      });
      return pending;
    },
    () => true,
  );
  assert.equal(builds, 2);
  assert.deepEqual(result, { status: 'retry' });
  assert.equal('event' in result, false);
  assert.notEqual(sourceOf(current), null);
});

test('otkazivanje posle prve izmene i dalje je preskok', async () => {
  let current = fixture();
  let builds = 0;
  const result = await calendarEventForInsert(
    () => sourceOf(current),
    async (source) => {
      builds += 1;
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      current = builds === 1 ? fixture({ venue: 'Prva izmena' }) : fixture({ status: 'cancelled' });
      return pending;
    },
    () => true,
  );
  assert.equal(builds, 2);
  assert.deepEqual(result, { status: 'skip' });
  assert.equal(sourceOf(current), null);
});

test('nestabilan podoban izvor ostaje za ponovni pokušaj i ne šalje zastareo događaj', async () => {
  const stable = fixture({ id: 'stable', providerFixtureId: '1' });
  const unstable = fixture({ id: 'unstable', providerFixtureId: '2' });
  const later = fixture({ id: 'later', providerFixtureId: '3' });
  const rows = new Map<string, Fixture>([
    [stable.id, stable],
    [unstable.id, unstable],
    [later.id, later],
  ]);
  const posted: string[] = [];
  let unstableBuilds = 0;
  const batch = await runCalendarInsertBatch(
    [stable.id, unstable.id, later.id],
    (id) => {
      const current = rows.get(id);
      return current ? sourceOf(current) : null;
    },
    async (source) => {
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      if (source.fixture.id === unstable.id) {
        unstableBuilds += 1;
        rows.set(unstable.id, fixture({
          id: unstable.id,
          providerFixtureId: '2',
          venue: unstableBuilds === 1 ? 'Prva izmena' : 'Druga izmena',
        }));
      }
      return pending;
    },
    () => true,
    async (event) => {
      posted.push(event.extendedProperties.private.matchaheadFixtureId);
      return 'created';
    },
  );
  assert.equal(unstableBuilds, 2);
  assert.deepEqual(posted, [stable.id]);
  assert.equal(batch.created, 1);
  assert.equal(batch.existing, 0);
  assert.equal(batch.failed, 1);
  assert.deepEqual(batch.remaining, [unstable.id, later.id]);
  assert.equal(batch.notice, CALENDAR_SCHEDULE_CHANGED);
  assert.match(batch.notice, /Raspored se promenio/);
  assert.notEqual(sourceOf(rows.get(unstable.id)!), null);
});

test('nepodoban red se preskače, a sledeći stabilan ide u upis', async () => {
  const gone = fixture({ id: 'gone', providerFixtureId: '1' });
  const kept = fixture({ id: 'kept', providerFixtureId: '2', timeConfirmed: true, startsAtUtc: '2026-10-06T19:30:00Z', status: 'scheduled' });
  const rows = new Map<string, Fixture>([[gone.id, gone], [kept.id, kept]]);
  const posted: string[] = [];
  const batch = await runCalendarInsertBatch(
    [gone.id, kept.id],
    (id) => {
      const current = rows.get(id);
      return current ? sourceOf(current) : null;
    },
    async (source) => {
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      if (source.fixture.id === gone.id) rows.set(gone.id, fixture({ id: gone.id, providerFixtureId: '1', status: 'cancelled' }));
      return pending;
    },
    () => true,
    async (event) => {
      posted.push(event.extendedProperties.private.matchaheadFixtureId);
      if (event.extendedProperties.private.matchaheadFixtureId === kept.id) return 'existing';
      return 'created';
    },
  );
  assert.deepEqual(posted, [kept.id]);
  assert.equal(batch.created, 0);
  assert.equal(batch.existing, 1);
  assert.equal(batch.failed, 0);
  assert.equal(batch.notice, '');
  assert.deepEqual(batch.remaining, []);
});

test('gubitak naloga zaustavlja seriju bez upisa tekućeg reda', async () => {
  let owned = true;
  const posted: string[] = [];
  const batch = await runCalendarInsertBatch(
    ['a', 'b'],
    (id) => sourceOf(fixture({ id, providerFixtureId: id })),
    async (source) => {
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      owned = false;
      return pending;
    },
    () => owned,
    async (event) => {
      posted.push(event.extendedProperties.private.matchaheadFixtureId);
      return 'created';
    },
  );
  assert.deepEqual(posted, []);
  assert.equal(batch.failed, 0);
  assert.equal(batch.notice, '');
  assert.deepEqual(batch.remaining, ['a', 'b']);
});

test('gubitak naloga tokom digesta prekida izgradnju', async () => {
  let owned = true;
  let builds = 0;
  const result = await calendarEventForInsert(
    () => sourceOf(fixture()),
    async (source) => {
      builds += 1;
      const pending = buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note);
      owned = false;
      return pending;
    },
    () => owned,
  );
  assert.equal(builds, 1);
  assert.deepEqual(result, { status: 'aborted' });
});

test('beleška i sat ulaze u poređenje izvora', () => {
  const base = sourceOf(fixture());
  assert.ok(base);
  assert.equal(calendarWriteSourceChanged(base, { ...base, note: 'nova' }), true);
  assert.equal(calendarWriteSourceChanged(base, sourceOf(fixture({ revision: 9 }))!), false);
  assert.equal(
    calendarWriteSourceChanged(base, sourceOf(fixture({ timeConfirmed: true, startsAtUtc: '2026-10-06T19:30:00Z', status: 'scheduled' }))!),
    true,
  );
});
