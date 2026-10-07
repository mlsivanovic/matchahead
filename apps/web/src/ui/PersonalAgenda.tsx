import { useMemo, useState } from 'react';
import './PersonalAgenda.css';
import {
  countdownLabel, fixtureCalendarDate, fixtureTitle, formatCalendarDate,
  formatFetchedAt, groupUserAgenda, kickoffText, localDateInZone,
  nextAgendaFixtures, scheduleStatusLabel, weekDatesAfter, type AgendaEntry,
} from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';
import { routeHash } from '../logic/routes.ts';
import type { LastGoodSchedule } from '../logic/schedule-store.ts';
import {
  buildUnifiedServerAgenda, unifiedServerCompetitions,
  unifiedServerProvenance, unifiedServerTeams,
} from '../logic/server-agenda.ts';
import {
  EMPTY_AGENDA_FILTER, applyAgendaFilters, entriesForSport,
  clubOptionsForAgenda, competitionOptionsForAgenda, catalogRowState,
  reasonLabel, teamDisplayName, type AgendaFilter, type NamedRef,
} from './PersonalAgendaHelpers.ts';
import { CalendarExport } from './CalendarExport.tsx';

export interface PersonalAgendaHomeProps {
  now: number;
  timeZone: string;
  online: boolean;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  serverSnapshots?: readonly LastGoodSchedule[];
}

export interface PersonalAgendaScreenProps extends PersonalAgendaHomeProps {
  draftNote: string;
  onDraft: (value: string) => void;
}

const EMPTY_SNAPSHOTS: readonly LastGoodSchedule[] = [];
function useAgenda(props: PersonalAgendaHomeProps) {
  const snapshots = props.serverSnapshots ?? EMPTY_SNAPSHOTS;
  return useMemo(() => ({
    entries: buildUnifiedServerAgenda(snapshots, props.followed, props.manualFixtureIds),
    teams: unifiedServerTeams(snapshots),
    competitions: unifiedServerCompetitions(snapshots),
    provenance: unifiedServerProvenance(snapshots),
  }), [snapshots, props.followed, props.manualFixtureIds]);
}

export function PersonalAgendaHome(props: PersonalAgendaHomeProps) {
  const agenda = useAgenda(props);
  const today = localDateInZone(props.now, props.timeZone);
  const week = new Set(weekDatesAfter(today));
  const sections = [
    { title: 'Sledeća utakmica', entries: nextAgendaFixtures(agenda.entries, props.now) },
    {
      title: 'Danas',
      entries: agenda.entries.filter(({ fixture }) => fixtureCalendarDate(fixture, props.timeZone) === today),
    },
    {
      title: 'Narednih sedam dana',
      entries: agenda.entries.filter(({ fixture }) => {
        const date = fixtureCalendarDate(fixture, props.timeZone);
        return date !== null && week.has(date);
      }),
    },
  ];
  return (
    <section>
      <h1>Početna</h1>
      <p className="lead">Tvoj sportski raspored na jednom mestu.</p>
      {!props.online ? <p className="warning">Van mreže. Prikazujemo poslednji sačuvan raspored.</p> : null}
      <ServerProvenanceLine provenance={agenda.provenance} timeZone={props.timeZone} />
      {!agenda.entries.length ? (
        <p>Agenda je prazna. Izaberi praćene <a href={routeHash('clubs')}>klubove i pronađi utakmice</a>.</p>
      ) : (
        <div data-server-agenda="unified" data-provenance={agenda.provenance ?? undefined}>
          {sections.map(({ title, entries }) => (
            <section key={title}>
              <h2>{title}</h2>
              {!entries.length ? <p>Nema utakmica za ovaj period.</p> : entries.map((entry) => (
                <ServerAgendaEntryCard
                  key={entry.fixture.id} {...props} entry={entry}
                  teams={agenda.teams} competitions={agenda.competitions}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export function PersonalAgendaScreen(props: PersonalAgendaScreenProps) {
  const agenda = useAgenda(props);
  const [filter, setFilter] = useState<AgendaFilter>(EMPTY_AGENDA_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = applyAgendaFilters(agenda.entries, filter);
  const groups = groupUserAgenda(filtered, props.now);
  const sportEntries = entriesForSport(agenda.entries, filter.sport);
  const clubs = clubOptionsForAgenda(sportEntries, agenda.teams);
  const competitions = competitionOptionsForAgenda(sportEntries, agenda.competitions);
  const sections = [
    ['Predstojeće', groups.upcoming],
    ['Termin naknadno', groups.toBeAnnounced],
    ['Odloženo ili otkazano', groups.disrupted],
    ['Arhiva', groups.archive],
  ] as const;
  return (
    <section>
      <h1>Utakmice</h1>
      <p className="lead">Praćeni klubovi i utakmice koje si dodao ručno.</p>
      {!props.online ? <p className="warning">Van mreže. Za dodavanje u kalendar potrebna je mreža.</p> : null}
      <div className="agenda-filters" role="group" aria-label="Filter sporta">
        {([['all', 'Sve'], ['football', 'Fudbal'], ['basketball', 'Košarka']] as const).map(([sport, label]) => (
          <button
            key={sport} type="button" aria-pressed={filter.sport === sport}
            onClick={() => setFilter({ ...EMPTY_AGENDA_FILTER, sport })}
          >{label}</button>
        ))}
      </div>
      <div className="agenda-selects">
        <label>
          Klub
          <select id="agenda-club" value={filter.clubId} onChange={(event) => setFilter({ ...filter, clubId: event.target.value })}>
            <option value="all">Svi klubovi</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <label>
          Takmičenje
          <select id="agenda-competition" value={filter.competitionId} onChange={(event) => setFilter({ ...filter, competitionId: event.target.value })}>
            <option value="all">Sva takmičenja</option>
            {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
          </select>
        </label>
      </div>
      <ServerProvenanceLine provenance={agenda.provenance} timeZone={props.timeZone} />
      {!filtered.length ? <p>Nema utakmica za ovaj izbor. <a href={routeHash('clubs')}>Pronađi utakmice</a>.</p> : null}
      <CalendarExport
        entries={filtered} teams={agenda.teams} competitions={agenda.competitions}
        timeZone={props.timeZone} note={props.draftNote} onNoteChange={props.onDraft}
      />
      <div data-server-agenda="unified" data-provenance={agenda.provenance ?? undefined}>
        {sections.map(([title, entries]) => (
          <ServerAgendaGroup
            key={title} {...props} title={title} entries={entries}
            teams={agenda.teams} competitions={agenda.competitions}
            expandedId={expandedId} onToggleDetail={setExpandedId}
          />
        ))}
      </div>
    </section>
  );
}

export function ServerProvenanceLine(props: { provenance: string | null; timeZone: string }) {
  const { provenance, timeZone } = props;
  return (
    <p className="meta">
      <strong>Pronađene utakmice</strong> · Proveren raspored ·{' '}
      {provenance ? (
        <>poslednja uspešna provera: <time dateTime={provenance}>{formatFetchedAt(provenance, timeZone)}</time>.</>
      ) : (
        <>još nema uspešne provere izvora.</>
      )}
    </p>
  );
}

/** Jedan red agende sa izvorom i razlozima uključivanja. */
export function ServerAgendaEntryCard(props: {
  entry: AgendaEntry;
  teams: readonly NamedRef[];
  competitions: readonly NamedRef[];
  timeZone: string;
  now: number;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  expanded?: boolean;
  onToggleDetail?: () => void;
}) {
  const { entry, timeZone, now } = props;
  const { fixture } = entry;
  const countdown = countdownLabel(fixture, now);
  const manual = catalogRowState(fixture, props.followed, props.manualFixtureIds);
  const competitionName = props.competitions.find((item) => item.id === fixture.competitionId)?.name ?? fixture.competitionId;
  const detailId = `server-agenda-detail-${fixture.id}`;
  const showDetail = props.expanded === true && typeof props.onToggleDetail === 'function';
  return (
    <article className="card">
      <p className="kicker">
        <span>{sportLabel(fixture.sport)}</span>
        <span>{competitionName}</span>
      </p>
      <h3>{fixtureTitle(fixture, props.teams)}</h3>
      <p>{kickoffText(fixture, timeZone)}</p>
      {countdown ? <p className="countdown">{countdown}</p> : null}
      <p className="meta">
        <span>{scheduleStatusLabel(fixture, now)}</span>
        {fixture.venue ? <span>{fixture.venue}</span> : null}
        {fixture.round ? <span>{fixture.round}</span> : null}
      </p>
      <ul className="agenda-reasons" aria-label="Razlozi uključivanja u agendu">
        {entry.reasons.map((reason, index) => (
          <li key={`${reason.kind}-${index}`}>{reasonLabel(reason, props.teams)}</li>
        ))}
      </ul>
      <p className="meta">
        Izvor:{' '}
        <a href={fixture.sourceUrl} data-source-url={fixture.sourceUrl} rel="noreferrer">
          {fixture.provider}
        </a>
      </p>
      <div className="agenda-actions">
        <button type="button" aria-pressed={manual.manuallySelected} onClick={() => props.onToggleManual(fixture.id)}>
          {manual.toggleLabel}
        </button>
        {props.onToggleDetail ? (
          <button type="button" aria-expanded={showDetail} aria-controls={detailId} onClick={props.onToggleDetail}>
            {showDetail ? 'Sakrij detalj' : 'Detalj'}
          </button>
        ) : null}
      </div>
      {manual.toggleNote ? <p className="meta">{manual.toggleNote}</p> : null}
      {showDetail ? (
        <div className="agenda-detail" id={detailId} role="region" aria-label={`Detalj: ${fixtureTitle(fixture, props.teams)}`}>
          <dl>
            <div>
              <dt>Takmičenje</dt>
              <dd>{competitionName}</dd>
            </div>
            <div>
              <dt>Sezona</dt>
              <dd>{fixture.seasonId}</dd>
            </div>
            <div>
              <dt>Domaćin</dt>
              <dd>{teamDisplayName(fixture.homeTeamId, props.teams)}</dd>
            </div>
            <div>
              <dt>Gost</dt>
              <dd>{teamDisplayName(fixture.awayTeamId, props.teams)}</dd>
            </div>
            {fixture.venue ? (
              <div>
                <dt>Mesto</dt>
                <dd>{fixture.venue}</dd>
              </div>
            ) : null}
            {fixture.round ? (
              <div>
                <dt>Kolo</dt>
                <dd>{fixture.round}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </article>
  );
}

function ServerAgendaGroup(props: {
  title: string;
  entries: readonly AgendaEntry[];
  teams: readonly NamedRef[];
  competitions: readonly NamedRef[];
  timeZone: string;
  now: number;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  expandedId: string | null;
  onToggleDetail: (fixtureId: string | null) => void;
}) {
  if (props.entries.length === 0) return null;
  return (
    <>
      <h2>{props.title}</h2>
      {props.entries.map((entry) => (
        <ServerAgendaEntryCard
          key={entry.fixture.id}
          entry={entry}
          teams={props.teams}
          competitions={props.competitions}
          timeZone={props.timeZone}
          now={props.now}
          followed={props.followed}
          manualFixtureIds={props.manualFixtureIds}
          onToggleManual={props.onToggleManual}
          expanded={props.expandedId === entry.fixture.id}
          onToggleDetail={() =>
            props.onToggleDetail(props.expandedId === entry.fixture.id ? null : entry.fixture.id)
          }
        />
      ))}
    </>
  );
}

