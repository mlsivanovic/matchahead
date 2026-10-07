import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { AgendaEntry } from '../logic/agenda.ts';
import { fixtureTitle, kickoffText } from '../logic/agenda.ts';
import { authorizeCalendar } from '../logic/calendar-auth.ts';
import { buildCalendarEvent, calendarEligible, insertCalendarEvent } from '../logic/calendar.ts';
import { activeFirebaseSession } from '../logic/firebase-app.ts';
import type { NamedRef } from './PersonalAgendaHelpers.ts';

export function CalendarExport(props: { entries: readonly AgendaEntry[]; teams: readonly NamedRef[]; competitions: readonly NamedRef[]; timeZone: string; note: string; onNoteChange?: (value: string) => void }) {
  const eligible = props.entries.filter((entry) => calendarEligible(entry.fixture));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  const current = useRef(props);
  current.current = props;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const session = activeFirebaseSession();
    const uid = session?.auth.currentUser?.uid;
    const unsubscribe = session ? onAuthStateChanged(session.auth, (user) => {
      if (user?.uid !== uid) pending.current?.abort();
    }) : () => {};
    return () => { mounted.current = false; pending.current?.abort(); unsubscribe(); };
  }, []);

  async function exportSelected() {
    if (pending.current || selected.size === 0) return;
    const chosen = eligible.filter((entry) => selected.has(entry.fixture.id));
    if (!chosen.length) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('Tražim Google dozvolu za kalendar…');
    let created = 0;
    let existing = 0;
    let failed = 0;
    const succeeded = new Set<string>();
    try {
      // Called before any await so the user's click opens the OAuth popup.
      const auth = await authorizeCalendar();
      const stillOwned = () => !controller.signal.aborted && activeFirebaseSession()?.auth.currentUser?.uid === auth.uid;
      for (const entry of chosen) {
        if (!stillOwned()) break;
        // A revoked or removed fixture cannot be exported from a stale selection.
        const latest = current.current.entries.find((next) => next.fixture.id === entry.fixture.id && calendarEligible(next.fixture));
        if (!latest) continue;
        try {
          const competition = props.competitions.find((item) => item.id === entry.fixture.competitionId)?.name ?? entry.fixture.competitionId;
          const event = await buildCalendarEvent(latest.fixture, fixtureTitle(latest.fixture, current.current.teams), competition, current.current.timeZone, current.current.note);
          if (!stillOwned()) break;
          const result = await insertCalendarEvent(event, auth.token, controller.signal);
          if (!stillOwned()) break;
          if (result === 'created') created++; else existing++;
          succeeded.add(entry.fixture.id);
        } catch (error) {
          if (!stillOwned()) break;
          failed++;
          setMessage(error instanceof Error ? error.message : 'Upis nije potvrđen.');
          // Stop on first error: preserve remaining selection for deliberate retry.
          break;
        }
      }
      if (mounted.current && stillOwned()) {
        setSelected((before) => new Set([...before].filter((id) => !succeeded.has(id))));
        setMessage((before) => `Dodato: ${created}. Već u kalendaru: ${existing}.${failed ? ` Preostale utakmice nisu dodate. ${before}` : ''}`);
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        setMessage(code.startsWith('auth/') ? 'Google dozvola nije dobijena. Zatvoren prozor, odbijena dozvola ili pogrešan nalog — pokušaj ponovo.' : error instanceof Error ? error.message : 'Dodavanje nije uspelo.');
      }
    } finally {
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  if (!props.entries.length) return null;
  return (
    <section className="card calendar-export" aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">Google kalendar</h2>
      <p className="meta">Izaberi utakmice za jednokratni upis u svoj glavni Google kalendar. Nepoznata satnica: 17:00 uz napomenu „Vreme nije poznato“. Trajanje događaja je 2 sata; promene rasporeda se ne sinhronizuju automatski.</p>
      <div className="agenda-actions">
        <button type="button" disabled={busy || !eligible.length} onClick={() => setSelected(new Set(eligible.map((entry) => entry.fixture.id)))}>Izaberi sve</button>
        <button type="button" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Poništi izbor</button>
      </div>
      <ul className="calendar-selection">
        {props.entries.map(({ fixture }) => {
          const enabled = calendarEligible(fixture);
          return <li key={fixture.id}><label><input type="checkbox" disabled={busy || !enabled} checked={enabled && selected.has(fixture.id)} onChange={(event) => setSelected((before) => { const next = new Set(before); if (event.target.checked) next.add(fixture.id); else next.delete(fixture.id); return next; })} /> <span>{fixtureTitle(fixture, props.teams)}<small className="meta" style={{ display: 'block' }}>{kickoffText(fixture, props.timeZone)}{!enabled ? ' — nije dostupna za dodavanje' : ''}</small></span></label></li>;
        })}
      </ul>
      {props.onNoteChange ? <div className="note" data-draft-dirty={props.note.trim() ? 'true' : 'false'}><label htmlFor="draft-note">Beleška za izabrane događaje</label><textarea id="draft-note" value={props.note} onChange={(event) => props.onNoteChange?.(event.target.value)} rows={2} maxLength={2000} placeholder="Opciona beleška" /><p className="meta">Beleška se čuva u ovoj sesiji i briše odjavom.</p></div> : null}
      <button type="button" className="primary" disabled={busy || !eligible.some((entry) => selected.has(entry.fixture.id))} onClick={() => void exportSelected()}>{busy ? 'Dodavanje…' : `Dodaj u Google kalendar (${eligible.filter((entry) => selected.has(entry.fixture.id)).length})`}</button>
      <p role="status" aria-live="polite">{message}</p>
    </section>
  );
}
