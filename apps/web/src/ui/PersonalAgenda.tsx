import { useMemo, useState } from 'react';

import './PersonalAgenda.css';
import {
  buildUserAgenda,
  countdownLabel,
  fixtureCalendarDate,
  fixtureTitle,
  formatCalendarDate,
  formatFetchedAt,
  groupUserAgenda,
  kickoffText,
  localDateInZone,
  nextAgendaFixtures,
  scheduleStatusLabel,
  weekDatesAfter,
  type AgendaEntry,
} from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';
import { routeHash } from '../logic/routes.ts';
import { competitionName, isScheduleStale, type DemoSchedule } from '../logic/schedule.ts';
import {
  ALL_FILTER_VALUE,
  EMPTY_AGENDA_FILTER,
  applyAgendaFilters,
  catalogRowState,
  clubOptionsForAgenda,
  competitionOptionsForAgenda,
  reasonLabel,
  teamDisplayName,
  type AgendaFilter,
} from './PersonalAgendaHelpers.ts';

/**
 * Faza 06 UI: samostalne komponente lične agende. Namerno nisu uvezane u
 * App/screens dok koordinator ne dodeli integraciju (auth iz faze 04 nije
 * spojen). Samo sintetički DEMO redovi; nikakva tvrdnja o Google/ICS upisu.
 * Odbrojavanje i „sada” dolaze isključivo iz prosleđenih propsa, pa
 * visibilitychange osvežavanje korenske aplikacije važi i ovde — komponente
 * ne pokreću sopstveni sat.
 */

export interface PersonalAgendaHomeProps {
  schedule: DemoSchedule | null;
  error: string | null;
  now: number;
  timeZone: string;
  online: boolean;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
}

export interface PersonalAgendaScreenProps {
  schedule: DemoSchedule | null;
  now: number;
  timeZone: string;
  online: boolean;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  draftNote: string;
  onDraft: (value: string) => void;
}

export function PersonalAgendaHome(props: PersonalAgendaHomeProps) {
  const { schedule, error, now, timeZone, online, followed, manualFixtureIds, onToggleManual } = props;
  const agenda = useMemo(
    () => (schedule ? buildUserAgenda(schedule.fixtures, followed, manualFixtureIds) : []),
    [schedule, followed, manualFixtureIds],
  );
  const next = useMemo(() => nextAgendaFixtures(agenda, now), [agenda, now]);
  const today = localDateInZone(now, timeZone);
  const weekDays = useMemo(() => new Set(weekDatesAfter(today)), [today]);
  const todayEntries = useMemo(
    () => agenda.filter((entry) => fixtureCalendarDate(entry.fixture, timeZone) === today),
    [agenda, timeZone, today],
  );
  const weekEntries = useMemo(
    () =>
      agenda.filter((entry) => {
        const date = fixtureCalendarDate(entry.fixture, timeZone);
        return date !== null && weekDays.has(date);
      }),
    [agenda, timeZone, weekDays],
  );

  return (
    <section>
      <h1>Početna</h1>
      <p className="lead">Tvoja agenda: praćeni klubovi i ručni DEMO izbori. Sve utakmice su izmišljene.</p>
      {schedule ? (
        <AgendaFreshness schedule={schedule} now={now} timeZone={timeZone} online={online} />
      ) : null}
      {error ? <p className="warning" role="alert">{error}</p> : null}
      {!schedule && !error ? <p>Učitavam DEMO raspored.</p> : null}
      {schedule ? (
        <>
          {agenda.length === 0 ? (
            <p>
              Tvoja agenda je prazna. Izaberi klub na ekranu <a href={routeHash('clubs')}>Klubovi</a> ili
              ručno dodaj DEMO utakmicu na ekranu <a href={routeHash('mine')}>Moje utakmice</a>.
            </p>
          ) : null}
          <h2>Sledeća utakmica</h2>
          {next.length === 0 ? (
            <p>Nema predstojeće DEMO utakmice sa potvrđenim terminom u tvojoj agendi.</p>
          ) : (
            <>
              {next.length > 1 ? <p className="meta">Još {next.length - 1} u isto vreme.</p> : null}
              {next.map((entry) => (
                <AgendaEntryCard
                  key={entry.fixture.id}
                  entry={entry}
                  schedule={schedule}
                  timeZone={timeZone}
                  now={now}
                  followed={followed}
                  manualFixtureIds={manualFixtureIds}
                  onToggleManual={onToggleManual}
                />
              ))}
            </>
          )}
          <h2>Danas</h2>
          {todayEntries.length === 0 ? (
            <p>Nema DEMO utakmice iz tvoje agende za današnji datum.</p>
          ) : (
            todayEntries.map((entry) => (
              <AgendaEntryCard
                key={entry.fixture.id}
                entry={entry}
                schedule={schedule}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
              />
            ))
          )}
          <h2>Narednih sedam dana</h2>
          {weekEntries.length === 0 ? (
            <p>Nema DEMO utakmice iz tvoje agende u narednih sedam dana.</p>
          ) : (
            weekEntries.map((entry) => (
              <AgendaEntryCard
                key={entry.fixture.id}
                entry={entry}
                schedule={schedule}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
              />
            ))
          )}
        </>
      ) : null}
    </section>
  );
}

export function PersonalAgendaScreen(props: PersonalAgendaScreenProps) {
  const { schedule, now, timeZone, online, followed, manualFixtureIds, onToggleManual, draftNote, onDraft } = props;
  const [filter, setFilter] = useState<AgendaFilter>(EMPTY_AGENDA_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const agenda = useMemo(
    () => (schedule ? buildUserAgenda(schedule.fixtures, followed, manualFixtureIds) : []),
    [schedule, followed, manualFixtureIds],
  );
  const clubOptions = useMemo(
    () => (schedule ? clubOptionsForAgenda(agenda, schedule.teams) : []),
    [agenda, schedule],
  );
  const competitionOptions = useMemo(
    () => (schedule ? competitionOptionsForAgenda(agenda, schedule.competitions) : []),
    [agenda, schedule],
  );
  const filtered = useMemo(() => applyAgendaFilters(agenda, filter), [agenda, filter]);
  const groups = useMemo(() => groupUserAgenda(filtered, now), [filtered, now]);

  return (
    <section>
      <h1>Moje utakmice</h1>
      <p className="lead">Hronološka DEMO agenda: unija praćenih klubova i ručnih izbora. Jedna utakmica je jedan red.</p>
      {!online ? <p className="warning">Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.</p> : null}
      {!schedule ? <p>Učitavam DEMO raspored.</p> : null}
      {schedule ? (
        <>
          {agenda.length === 0 ? (
            <p>
              Nema utakmica u agendi. Izaberi klub na ekranu <a href={routeHash('clubs')}>Klubovi</a> ili
              ručno dodaj DEMO utakmicu iz kataloga ispod.
            </p>
          ) : null}
          <div className="filters" role="group" aria-label="Filter sporta">
            <FilterButton pressed={filter.sport === 'all'} onClick={() => setFilter({ ...filter, sport: 'all' })}>Svi</FilterButton>
            <FilterButton pressed={filter.sport === 'football'} onClick={() => setFilter({ ...filter, sport: 'football' })}>Fudbal</FilterButton>
            <FilterButton pressed={filter.sport === 'basketball'} onClick={() => setFilter({ ...filter, sport: 'basketball' })}>Košarka</FilterButton>
          </div>
          <div className="agenda-selects">
            <div>
              <label htmlFor="agenda-club">Klub</label>
              <select
                id="agenda-club"
                value={filter.clubId}
                onChange={(event) => setFilter({ ...filter, clubId: event.target.value })}
              >
                <option value={ALL_FILTER_VALUE}>Svi klubovi</option>
                {clubOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="agenda-competition">Takmičenje</label>
              <select
                id="agenda-competition"
                value={filter.competitionId}
                onChange={(event) => setFilter({ ...filter, competitionId: event.target.value })}
              >
                <option value={ALL_FILTER_VALUE}>Sva takmičenja</option>
                {competitionOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
          </div>
          {agenda.length > 0 && filtered.length === 0 ? <p>Nema DEMO utakmice za ovaj filter.</p> : null}
          <AgendaGroup
            title="Predstojeće"
            entries={groups.upcoming}
            schedule={schedule}
            timeZone={timeZone}
            now={now}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={onToggleManual}
            expandedId={expandedId}
            onToggleDetail={setExpandedId}
          />
          <AgendaGroup
            title="Termin naknadno"
            entries={groups.toBeAnnounced}
            schedule={schedule}
            timeZone={timeZone}
            now={now}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={onToggleManual}
            expandedId={expandedId}
            onToggleDetail={setExpandedId}
          />
          <AgendaGroup
            title="Odloženo ili otkazano"
            entries={groups.disrupted}
            schedule={schedule}
            timeZone={timeZone}
            now={now}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={onToggleManual}
            expandedId={expandedId}
            onToggleDetail={setExpandedId}
          />
          <AgendaGroup
            title="Arhiva"
            entries={groups.archive}
            schedule={schedule}
            timeZone={timeZone}
            now={now}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={onToggleManual}
            expandedId={expandedId}
            onToggleDetail={setExpandedId}
          />
          <h2>Ručni izbor iz DEMO kataloga</h2>
          <p className="meta">Katalog je nezavisan od praćenih klubova: svaku DEMO utakmicu možeš dodati ili ukloniti ručno.</p>
          <ul className="agenda-catalog">
            {schedule.fixtures.map((fixture) => {
              const state = catalogRowState(fixture, followed, manualFixtureIds);
              return (
                <li key={fixture.id} className="card">
                  <p className="kicker">
                    <span className="demo">DEMO</span>
                    <span>{sportLabel(fixture.sport)}</span>
                    <span>{competitionName(schedule, fixture.competitionId)}</span>
                  </p>
                  <p><strong>{fixtureTitle(fixture, schedule.teams)}</strong></p>
                  <p>{kickoffText(fixture, timeZone)}</p>
                  <button type="button" aria-pressed={state.manuallySelected} onClick={() => onToggleManual(fixture.id)}>
                    {state.toggleLabel}
                  </button>
                  {state.toggleNote ? <p className="meta">{state.toggleNote}</p> : null}
                </li>
              );
            })}
          </ul>
          <div className="note" data-draft-dirty={draftNote.trim().length > 0 ? 'true' : 'false'}>
            <label htmlFor="agenda-draft-note">Beleška uz događaj</label>
            <textarea
              id="agenda-draft-note"
              value={draftNote}
              onChange={(event) => onDraft(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Unos ostaje u ovoj sesiji"
            />
            <p className="meta">Beleška nije na serveru. Odjava lokalne sesije je briše. Dok unos traje, nova verzija se ne učitava sama.</p>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AgendaFreshness(props: { schedule: DemoSchedule; now: number; timeZone: string; online: boolean }) {
  const stale = isScheduleStale(props.schedule.fetchedAt, props.now, props.schedule.staleAfterHours);
  return (
    <div className="freshness" data-stale={stale ? 'true' : 'false'} data-offline={props.online ? 'false' : 'true'}>
      <p>
        Poslednje osvežavanje:{' '}
        <time dateTime={props.schedule.fetchedAt}>{formatFetchedAt(props.schedule.fetchedAt, props.timeZone)}</time>
        .
      </p>
      {stale ? (
        <p>Podaci su zastareli. Prag je {props.schedule.staleAfterHours} časova od poslednjeg zapisa u fajlu.</p>
      ) : (
        <p>Zapis u fajlu je unutar praga od {props.schedule.staleAfterHours} časova. I dalje je sintetički DEMO.</p>
      )}
      <p>{props.online ? 'Na mreži. Ovo nije svež sportski izvor.' : 'Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.'}</p>
      <p>{props.schedule.warning}</p>
    </div>
  );
}

function AgendaGroup(props: {
  title: string;
  entries: readonly AgendaEntry[];
  schedule: DemoSchedule;
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
        <AgendaEntryCard
          key={entry.fixture.id}
          entry={entry}
          schedule={props.schedule}
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

function AgendaEntryCard(props: {
  entry: AgendaEntry;
  schedule: DemoSchedule;
  timeZone: string;
  now: number;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  expanded?: boolean;
  onToggleDetail?: () => void;
}) {
  const { entry, schedule, timeZone, now } = props;
  const { fixture } = entry;
  const countdown = countdownLabel(fixture, now);
  const manual = catalogRowState(fixture, props.followed, props.manualFixtureIds);
  const title = fixtureTitle(fixture, schedule.teams);
  const detailId = `agenda-detail-${fixture.id}`;
  const showDetail = props.expanded === true && typeof props.onToggleDetail === 'function';
  return (
    <article className="card">
      <p className="kicker">
        <span className="demo">DEMO</span>
        <span>{sportLabel(fixture.sport)}</span>
        <span>{competitionName(schedule, fixture.competitionId)}</span>
      </p>
      <h3>{title}</h3>
      <p>{kickoffText(fixture, timeZone)}</p>
      {countdown ? <p className="countdown">{countdown}</p> : null}
      <p className="meta">
        <span>{scheduleStatusLabel(fixture, now)}</span>
        {fixture.venue ? <span>{fixture.venue}</span> : null}
        {fixture.round ? <span>{fixture.round}</span> : null}
      </p>
      <ul className="agenda-reasons" aria-label="Razlozi uključivanja u agendu">
        {entry.reasons.map((reason, index) => (
          <li key={`${reason.kind}-${index}`}>{reasonLabel(reason, schedule.teams)}</li>
        ))}
      </ul>
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
        <div className="agenda-detail" id={detailId} role="region" aria-label={`Detalj: ${title}`}>
          <dl>
            <div>
              <dt>Takmičenje</dt>
              <dd>{competitionName(schedule, fixture.competitionId)}</dd>
            </div>
            <div>
              <dt>Sezona</dt>
              <dd>{fixture.seasonId}</dd>
            </div>
            <div>
              <dt>Domaćin</dt>
              <dd>{teamDisplayName(fixture.homeTeamId, schedule.teams)}</dd>
            </div>
            <div>
              <dt>Gost</dt>
              <dd>{teamDisplayName(fixture.awayTeamId, schedule.teams)}</dd>
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
            {fixture.previousScheduledLocalDate ? (
              <div>
                <dt>Raniji datum</dt>
                <dd>{formatCalendarDate(fixture.previousScheduledLocalDate)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
      <p className="meta">Nije stvarna utakmica. Upis u Google kalendar nije deo ove faze.</p>
    </article>
  );
}

function FilterButton(props: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={props.pressed} onClick={props.onClick}>{props.children}</button>
  );
}

