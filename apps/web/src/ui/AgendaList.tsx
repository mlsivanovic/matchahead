import type { AgendaEntry, AgendaInclusionReason } from '../logic/agenda.ts';
import { countdownLabel, fixtureTitle, kickoffText, scheduleStatusLabel } from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';

/**
 * Faza 06: nezavisan prikaz agende. Namerno nije uvezan u App/screens dok
 * Grok schema (faza 04) ne bude spremna. Samo sintetički DEMO redovi;
 * nikakva tvrdnja o Google/ICS upisu. Koordinator dodeljuje integraciju.
 */

export interface AgendaDisplayTeam {
  id: string;
  name: string;
}

export interface AgendaDisplayCompetition {
  id: string;
  name: string;
}

function reasonText(reason: AgendaInclusionReason): string {
  if (reason.kind === 'followed_team') return 'Pratim u aplikaciji';
  return 'Ručni izbor';
}

export function AgendaList(props: {
  entries: readonly AgendaEntry[];
  teams: readonly AgendaDisplayTeam[];
  competitions: readonly AgendaDisplayCompetition[];
  timeZone: string;
  now: number;
  simultaneousNote?: string;
}) {
  const { entries, teams, competitions, timeZone, now } = props;
  if (entries.length === 0) {
    return (
      <section aria-label="Moja agenda">
        <p>Nema utakmica u agendi. Izaberi klub na ekranu Klubovi ili ručno dodaj DEMO utakmicu.</p>
        <p className="meta">DEMO prikaz. Nije stvarna utakmica.</p>
      </section>
    );
  }
  return (
    <section aria-label="Moja agenda">
      {props.simultaneousNote ? <p className="meta">{props.simultaneousNote}</p> : null}
      {entries.map((entry) => (
        <AgendaRow
          key={entry.fixture.id}
          entry={entry}
          teams={teams}
          competitions={competitions}
          timeZone={timeZone}
          now={now}
        />
      ))}
    </section>
  );
}

export function AgendaRow(props: {
  entry: AgendaEntry;
  teams: readonly AgendaDisplayTeam[];
  competitions: readonly AgendaDisplayCompetition[];
  timeZone: string;
  now: number;
}) {
  const { entry, teams, competitions, timeZone, now } = props;
  const { fixture, reasons } = entry;
  const countdown = countdownLabel(fixture, now);
  const competition = competitions.find((item) => item.id === fixture.competitionId)?.name ?? 'DEMO takmičenje';
  return (
    <article className="card">
      <p className="kicker">
        <span className="demo">DEMO</span>
        <span>{sportLabel(fixture.sport)}</span>
        <span>{competition}</span>
      </p>
      <h3>{fixtureTitle(fixture, teams)}</h3>
      <p>{kickoffText(fixture, timeZone)}</p>
      {countdown ? <p className="countdown">{countdown}</p> : null}
      <p className="meta">{scheduleStatusLabel(fixture, now)}</p>
      <p className="meta">{reasons.map(reasonText).join(' · ')}</p>
      <p className="meta">Nije stvarna utakmica. Upis u Google kalendar nije deo ove faze.</p>
    </article>
  );
}
