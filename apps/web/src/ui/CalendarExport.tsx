import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { AgendaEntry } from '../logic/agenda.ts';
import { fixtureTitle } from '../logic/agenda.ts';
import { authorizeCalendar } from '../logic/calendar-auth.ts';
import { buildCalendarEvent, calendarEligible, type CalendarEvent, type CalendarWriteResult, insertCalendarEvent } from '../logic/calendar.ts';
import { activeFirebaseSession } from '../logic/firebase-app.ts';
import type { Fixture } from '../../../../packages/domain/src/types.ts';
import type { NamedRef } from './PersonalAgendaHelpers.ts';

export interface CalendarExportResult {
  created: number;
  existing: number;
  failed: number;
  remaining: string[];
  aborted: boolean;
}

export interface CalendarExportInput {
  entries: readonly AgendaEntry[];
  teams: readonly NamedRef[];
  competitions: readonly NamedRef[];
  timeZone: string;
  note: string;
  accountIdentity: string;
}

const EMPTY_RESULT: CalendarExportResult = { created: 0, existing: 0, failed: 0, remaining: [], aborted: true };

/**
 * Podaci koji ulaze u događaj. Stabilan ID i dalje zavisi samo od fixture.id.
 * Sat nepoznatog termina i dalje računa buildCalendarEvent.
 */
export interface CalendarWriteSource {
  fixture: Fixture;
  title: string;
  competition: string;
  timeZone: string;
  note: string;
}

export type FreshCalendarEvent =
  | { status: 'ready'; event: CalendarEvent }
  | { status: 'skip' }
  | { status: 'retry' }
  | { status: 'aborted' };

/** Vidljivo upozorenje kada je red još podoban, ali se raspored promenio tokom izgradnje. */
export const CALENDAR_SCHEDULE_CHANGED = 'Raspored se promenio. Pokušaj ponovo.';

/** Polja koja menjaju telo događaja ili podobnost. Ostala polja fixtura ne pokreću novu izgradnju. */
function fixtureWriteStamp(fixture: Fixture): string {
  return [
    fixture.id,
    fixture.status,
    fixture.timeConfirmed,
    fixture.startsAtUtc,
    fixture.scheduledLocalDate,
    fixture.sourceTimeZone,
    fixture.sourceUrl,
    fixture.venue,
    fixture.homeTeamId,
    fixture.awayTeamId,
    fixture.competitionId,
  ].join('\u001f');
}

export function calendarWriteSourceChanged(left: CalendarWriteSource, right: CalendarWriteSource): boolean {
  return left.title !== right.title
    || left.competition !== right.competition
    || left.timeZone !== right.timeZone
    || left.note !== right.note
    || fixtureWriteStamp(left.fixture) !== fixtureWriteStamp(right.fixture);
}

/** Trenutni podoban red. Nepodoban ili nestao red nije izvor za upis. */
export function readCalendarWriteSource(
  entries: readonly AgendaEntry[],
  id: string,
  teams: readonly NamedRef[],
  competitions: readonly NamedRef[],
  timeZone: string,
  note: string,
): CalendarWriteSource | null {
  const entry = entries.find((next) => next.fixture.id === id && calendarEligible(next.fixture));
  if (!entry) return null;
  const competition = competitions.find((item) => item.id === entry.fixture.competitionId)?.name
    ?? entry.fixture.competitionId;
  return {
    fixture: entry.fixture,
    title: fixtureTitle(entry.fixture, teams),
    competition,
    timeZone,
    note,
  };
}

/**
 * buildCalendarEvent čeka digest pre povratka. Za to vreme izvor može da se promeni.
 * Posle svakog await-a izvor se čita ponovo. Ako se promenio, događaj se gradi iznova.
 * Ako ni druga slika nije stabilna, zastareo događaj se ne vraća: red je još podoban,
 * pa je ishod ponovni pokušaj. Ako red više nije podoban, ishod je preskok.
 */
export async function calendarEventForInsert(
  read: () => CalendarWriteSource | null,
  build: (source: CalendarWriteSource) => Promise<CalendarEvent>,
  stillOwned: () => boolean,
): Promise<FreshCalendarEvent> {
  const first = read();
  if (!first || !stillOwned()) return first ? { status: 'aborted' } : { status: 'skip' };
  const built = await build(first);
  if (!stillOwned()) return { status: 'aborted' };
  const second = read();
  if (!second) return { status: 'skip' };
  if (!calendarWriteSourceChanged(first, second)) return { status: 'ready', event: built };
  const rebuilt = await build(second);
  if (!stillOwned()) return { status: 'aborted' };
  const third = read();
  if (!third) return { status: 'skip' };
  if (calendarWriteSourceChanged(second, third)) return { status: 'retry' };
  return { status: 'ready', event: rebuilt };
}

export interface CalendarInsertBatch {
  created: number;
  existing: number;
  failed: number;
  remaining: string[];
  notice: string;
}

/**
 * Serijski upis. Nepodoban red se preskače i serija ide dalje.
 * Podoban red koji se promeni dvaput staje seriju, bez POST-a, i ostaje u ostatku
 * zajedno sa redovima koji još nisu pokušani.
 */
export async function runCalendarInsertBatch(
  requested: readonly string[],
  read: (id: string) => CalendarWriteSource | null,
  build: (source: CalendarWriteSource) => Promise<CalendarEvent>,
  stillOwned: () => boolean,
  insert: (event: CalendarEvent) => Promise<CalendarWriteResult>,
): Promise<CalendarInsertBatch> {
  let created = 0;
  let existing = 0;
  let failed = 0;
  let notice = '';
  const succeeded = new Set<string>();
  const skipped = new Set<string>();
  for (const id of requested) {
    if (!stillOwned()) break;
    try {
      const fresh = await calendarEventForInsert(() => read(id), build, stillOwned);
      if (fresh.status === 'aborted' || !stillOwned()) break;
      if (fresh.status === 'skip') {
        skipped.add(id);
        continue;
      }
      if (fresh.status === 'retry') {
        failed += 1;
        notice = CALENDAR_SCHEDULE_CHANGED;
        break;
      }
      const result = await insert(fresh.event);
      if (!stillOwned()) break;
      if (result === 'created') created += 1;
      else existing += 1;
      succeeded.add(id);
    } catch (error) {
      if (!stillOwned()) break;
      failed += 1;
      notice = error instanceof Error ? error.message : 'Upis nije potvrđen.';
      break;
    }
  }
  return {
    created,
    existing,
    failed,
    remaining: requested.filter((id) => !succeeded.has(id) && !skipped.has(id)),
    notice,
  };
}

/**
 * Isti upis kao ranije: posebna Google dozvola, stabilan ID, prekid na prvoj
 * grešci, ostatak ostaje za ponovni pokušaj. Nepodoban red se i dalje proverava
 * i preskače. Nestabilan podoban red staje seriju bez upisa. Nema posebne liste za izbor.
 */
export function useCalendarExport(props: CalendarExportInput) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  const current = useRef(props);
  current.current = props;
  const mounted = useRef(true);
  const epoch = useRef(0);

  useEffect(() => {
    const operation = ++epoch.current;
    mounted.current = true;
    setMessage('');
    setBusy(false);
    pending.current?.abort();
    pending.current = null;
    const session = activeFirebaseSession();
    const uid = session?.auth.currentUser?.uid;
    const unsubscribe = session ? onAuthStateChanged(session.auth, (user) => {
      if (user?.uid !== uid) pending.current?.abort();
    }) : () => {};
    return () => {
      pending.current?.abort();
      unsubscribe();
      if (epoch.current === operation) mounted.current = false;
    };
  }, [props.accountIdentity]);

  function cancel() {
    pending.current?.abort();
  }

  async function exportIds(ids: readonly string[]): Promise<CalendarExportResult> {
    if (pending.current || ids.length === 0) return { ...EMPTY_RESULT, remaining: [...ids] };
    const operation = epoch.current;
    const requested = current.current.entries
      .filter((entry) => ids.includes(entry.fixture.id) && calendarEligible(entry.fixture))
      .map((entry) => entry.fixture.id);
    if (!requested.length) {
      if (mounted.current) setMessage('Nema utakmica za dodavanje.');
      return { created: 0, existing: 0, failed: 0, remaining: [], aborted: false };
    }
    const controller = new AbortController();
    pending.current = controller;
    const live = () => mounted.current && epoch.current === operation && !controller.signal.aborted;
    setBusy(true);
    setMessage('Tražim Google dozvolu za kalendar…');
    let created = 0;
    let existing = 0;
    let failed = 0;
    const finish = (aborted: boolean, remaining: readonly string[]): CalendarExportResult => ({
      created,
      existing,
      failed,
      remaining: [...remaining],
      aborted,
    });
    try {
      // Poziv pre drugog await-a da klik otvori OAuth prozor.
      const auth = await authorizeCalendar();
      const stillOwned = () => live() && activeFirebaseSession()?.auth.currentUser?.uid === auth.uid;
      const batch = await runCalendarInsertBatch(
        requested,
        (id) => readCalendarWriteSource(
          current.current.entries,
          id,
          current.current.teams,
          current.current.competitions,
          current.current.timeZone,
          current.current.note,
        ),
        (source) => buildCalendarEvent(source.fixture, source.title, source.competition, source.timeZone, source.note),
        stillOwned,
        (event) => insertCalendarEvent(event, auth.token, controller.signal),
      );
      created = batch.created;
      existing = batch.existing;
      failed = batch.failed;
      if (batch.notice && stillOwned()) setMessage(batch.notice);
      const owned = stillOwned();
      if (owned) {
        setMessage((before) => `Dodato: ${created}. Već u kalendaru: ${existing}.${failed ? ` Preostale utakmice nisu dodate. ${before}` : ''}`);
      }
      return finish(!owned, batch.remaining);
    } catch (error) {
      const aborted = controller.signal.aborted || epoch.current !== operation || !mounted.current;
      if (!aborted) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        setMessage(code.startsWith('auth/')
          ? 'Google dozvola nije dobijena. Zatvoren prozor, odbijena dozvola ili pogrešan nalog — pokušaj ponovo.'
          : error instanceof Error ? error.message : 'Dodavanje nije uspelo.');
        failed = Math.max(failed, 1);
      }
      return finish(aborted, requested);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (mounted.current && epoch.current === operation) setBusy(false);
    }
  }

  return { busy, message, exportIds, cancel };
}
