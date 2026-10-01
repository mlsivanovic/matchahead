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
import type { LastGoodSchedule } from '../logic/schedule-store.ts';
import {
  buildUnifiedServerAgenda,
  unifiedServerCompetitions,
  unifiedServerProvenance,
  unifiedServerTeams,
} from '../logic/server-agenda.ts';
import {
  ALL_FILTER_VALUE,
  EMPTY_AGENDA_FILTER,
  applyAgendaFilters,
  catalogRowState,
  clubOptionsForAgenda,
  competitionOptionsForAgenda,
  entriesForSport,
  reasonLabel,
  sportFilterChange,
  teamDisplayName,
  type AgendaFilter,
  type NamedRef,
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
  serverSnapshots?: readonly LastGoodSchedule[];
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
  serverSnapshots?: readonly LastGoodSchedule[];
}

export function PersonalAgendaHome(props: PersonalAgendaHomeProps) {
  const { schedule, error, now, timeZone, online, followed, manualFixtureIds, onToggleManual } = props;
  const serverSnapshots = props.serverSnapshots ?? [];
  const agenda = useMemo(
    () => (schedule ? buildUserAgenda(schedule.fixtures, followed, manualFixtureIds) : []),
    [schedule, followed, manualFixtureIds],
  );
  // Stvarna glavna agenda: jedan unificirani skup proverenih utakmica
  // (derbi jednom, najviša revizija), ne odvojene kopije po snimku.
  const serverAgenda = useMemo(
    () => buildUnifiedServerAgenda(serverSnapshots, followed, manualFixtureIds),
    [serverSnapshots, followed, manualFixtureIds],
  );
  const hasServer = serverAgenda.length > 0;
  const serverTeams = useMemo(() => unifiedServerTeams(serverSnapshots), [serverSnapshots]);
  const serverCompetitions = useMemo(() => unifiedServerCompetitions(serverSnapshots), [serverSnapshots]);
  const provenance = useMemo(() => unifiedServerProvenance(serverSnapshots), [serverSnapshots]);
  const next = useMemo(() => nextAgendaFixtures(agenda, now), [agenda, now]);
  const serverNext = useMemo(() => nextAgendaFixtures(serverAgenda, now), [serverAgenda, now]);
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
  const serverTodayEntries = useMemo(
    () => serverAgenda.filter((entry) => fixtureCalendarDate(entry.fixture, timeZone) === today),
    [serverAgenda, timeZone, today],
  );
  const serverWeekEntries = useMemo(
    () =>
      serverAgenda.filter((entry) => {
        const date = fixtureCalendarDate(entry.fixture, timeZone);
        return date !== null && weekDays.has(date);
      }),
    [serverAgenda, timeZone, weekDays],
  );

  return (
    <section>
      <h1>Početna</h1>
      {hasServer ? (
        <p className="lead">Tvoja agenda: praćeni klubovi i ručni izbori. Proverene utakmice su sa servera.</p>
      ) : (
        <p className="lead">Tvoja agenda: praćeni klubovi i ručni DEMO izbori. Sve utakmice su izmišljene.</p>
      )}
      {error ? <p className="warning" role="alert">{error}</p> : null}
      {!schedule && !error && !hasServer ? <p>Učitavam DEMO raspored.</p> : null}
      {hasServer ? (
        <>
          <div data-server-agenda="unified" data-provenance={provenance ?? undefined}>
            <ServerProvenanceLine provenance={provenance} timeZone={timeZone} />
            <h2>Sledeća utakmica</h2>
            {serverNext.length === 0 ? (
              <p>Nema predstojeće serverske utakmice sa potvrđenim terminom u tvojoj agendi.</p>
            ) : (
              <>
                {serverNext.length > 1 ? <p className="meta">Još {serverNext.length - 1} u isto vreme.</p> : null}
                {serverNext.map((entry) => (
                  <ServerAgendaEntryCard
                    key={entry.fixture.id}
                    entry={entry}
                    teams={serverTeams}
                    competitions={serverCompetitions}
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
            {serverTodayEntries.length === 0 ? (
              <p>Nema serverske utakmice iz tvoje agende za današnji datum.</p>
            ) : (
              serverTodayEntries.map((entry) => (
                <ServerAgendaEntryCard
                  key={entry.fixture.id}
                  entry={entry}
                  teams={serverTeams}
                  competitions={serverCompetitions}
                  timeZone={timeZone}
                  now={now}
                  followed={followed}
                  manualFixtureIds={manualFixtureIds}
                  onToggleManual={onToggleManual}
                />
              ))
            )}
            <h2>Narednih sedam dana</h2>
            {serverWeekEntries.length === 0 ? (
              <p>Nema serverske utakmice iz tvoje agende u narednih sedam dana.</p>
            ) : (
              serverWeekEntries.map((entry) => (
                <ServerAgendaEntryCard
                  key={entry.fixture.id}
                  entry={entry}
                  teams={serverTeams}
                  competitions={serverCompetitions}
                  timeZone={timeZone}
                  now={now}
                  followed={followed}
                  manualFixtureIds={manualFixtureIds}
                  onToggleManual={onToggleManual}
                />
              ))
            )}
          </div>
          {schedule ? (
            <section aria-label="DEMO podaci">
              <h2>DEMO podaci (izolovano)</h2>
              <p className="meta">Sintetičke utakmice, odvojene od proverenog rasporeda iznad.</p>
              <AgendaFreshness schedule={schedule} now={now} timeZone={timeZone} online={online} />
              {agenda.length === 0 ? (
                <p>
                  DEMO agenda je prazna. Izaberi klub na ekranu <a href={routeHash('clubs')}>Klubovi</a> ili
                  ručno dodaj DEMO utakmicu na ekranu <a href={routeHash('mine')}>Moje utakmice</a>.
                </p>
              ) : null}
              <h2>Sledeća DEMO utakmica</h2>
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
              <h2>Danas (DEMO)</h2>
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
              <h2>Narednih sedam dana (DEMO)</h2>
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
            </section>
          ) : null}
        </>
      ) : null}
      {!hasServer && schedule ? (
        <>
          <AgendaFreshness schedule={schedule} now={now} timeZone={timeZone} online={online} />
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
          {serverSnapshots.length > 0 ? (
            <p className="meta">Nema serverskih utakmica za praćene klubove. Pronađi raspored na ekranu Klubovi.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function PersonalAgendaScreen(props: PersonalAgendaScreenProps) {
  const { schedule, now, timeZone, online, followed, manualFixtureIds, onToggleManual, draftNote, onDraft } = props;
  const serverSnapshots = props.serverSnapshots ?? [];
  const [filter, setFilter] = useState<AgendaFilter>(EMPTY_AGENDA_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const agenda = useMemo(
    () => (schedule ? buildUserAgenda(schedule.fixtures, followed, manualFixtureIds) : []),
    [schedule, followed, manualFixtureIds],
  );
  // Stvarna glavna agenda: filteri (sport/klub/takmičenje) i grupe statusa
  // rade nad unificiranim proverenim skupom kada postoji.
  const serverAgenda = useMemo(
    () => buildUnifiedServerAgenda(serverSnapshots, followed, manualFixtureIds),
    [serverSnapshots, followed, manualFixtureIds],
  );
  const hasServer = serverAgenda.length > 0;
  const serverTeams = useMemo(() => unifiedServerTeams(serverSnapshots), [serverSnapshots]);
  const serverCompetitions = useMemo(() => unifiedServerCompetitions(serverSnapshots), [serverSnapshots]);
  const provenance = useMemo(() => unifiedServerProvenance(serverSnapshots), [serverSnapshots]);
  const mainAgenda = hasServer ? serverAgenda : agenda;
  const mainTeams: readonly NamedRef[] = hasServer ? serverTeams : (schedule?.teams ?? []);
  const mainCompetitions: readonly NamedRef[] = hasServer ? serverCompetitions : (schedule?.competitions ?? []);
  const sportEntries = useMemo(() => entriesForSport(mainAgenda, filter.sport), [mainAgenda, filter.sport]);
  const clubOptions = useMemo(
    () => clubOptionsForAgenda(sportEntries, mainTeams),
    [sportEntries, mainTeams],
  );
  const competitionOptions = useMemo(
    () => competitionOptionsForAgenda(sportEntries, mainCompetitions),
    [sportEntries, mainCompetitions],
  );
  const filtered = useMemo(() => applyAgendaFilters(mainAgenda, filter), [mainAgenda, filter]);
  const groups = useMemo(() => groupUserAgenda(filtered, now), [filtered, now]);
  // DEMO ostaje izolovan ispod glavne agende, sa istim filterom.
  const demoFiltered = useMemo(() => applyAgendaFilters(agenda, filter), [agenda, filter]);
  const demoGroups = useMemo(() => groupUserAgenda(demoFiltered, now), [demoFiltered, now]);

  return (
    <section>
      <h1>Moje utakmice</h1>
      {hasServer ? (
        <p className="lead">Hronološka agenda: unija praćenih klubova i ručnih izbora. Jedna utakmica je jedan red.</p>
      ) : (
        <p className="lead">Hronološka DEMO agenda: unija praćenih klubova i ručnih izbora. Jedna utakmica je jedan red.</p>
      )}
      {!online ? <p className="warning">Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.</p> : null}
      {!schedule && !hasServer ? <p>Učitavam DEMO raspored.</p> : null}
      {hasServer || schedule ? (
        <>
          {mainAgenda.length === 0 ? (
            <p>
              Nema utakmica u agendi. Izaberi klub na ekranu <a href={routeHash('clubs')}>Klubovi</a> ili
              ručno dodaj utakmicu iz kataloga ispod.
            </p>
          ) : null}
          <div className="filters" role="group" aria-label="Filter sporta">
            <FilterButton pressed={filter.sport === 'all'} onClick={() => setFilter(sportFilterChange('all'))}>Svi</FilterButton>
            <FilterButton pressed={filter.sport === 'football'} onClick={() => setFilter(sportFilterChange('football'))}>Fudbal</FilterButton>
            <FilterButton pressed={filter.sport === 'basketball'} onClick={() => setFilter(sportFilterChange('basketball'))}>Košarka</FilterButton>
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
          {mainAgenda.length > 0 && filtered.length === 0 ? (
            <p>{hasServer ? 'Nema serverskih utakmica za ovaj filter.' : 'Nema DEMO utakmice za ovaj filter.'}</p>
          ) : null}
          {hasServer ? (
            <div data-server-agenda="unified" data-provenance={provenance ?? undefined}>
              <ServerProvenanceLine provenance={provenance} timeZone={timeZone} />
              <ServerAgendaGroup
                title="Predstojeće"
                entries={groups.upcoming}
                teams={serverTeams}
                competitions={serverCompetitions}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
                expandedId={expandedId}
                onToggleDetail={setExpandedId}
              />
              <ServerAgendaGroup
                title="Termin naknadno"
                entries={groups.toBeAnnounced}
                teams={serverTeams}
                competitions={serverCompetitions}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
                expandedId={expandedId}
                onToggleDetail={setExpandedId}
              />
              <ServerAgendaGroup
                title="Odloženo ili otkazano"
                entries={groups.disrupted}
                teams={serverTeams}
                competitions={serverCompetitions}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
                expandedId={expandedId}
                onToggleDetail={setExpandedId}
              />
              <ServerAgendaGroup
                title="Arhiva"
                entries={groups.archive}
                teams={serverTeams}
                competitions={serverCompetitions}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
                expandedId={expandedId}
                onToggleDetail={setExpandedId}
              />
            </div>
          ) : null}
          {!hasServer && schedule ? (
            <>
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
            </>
          ) : null}
          {hasServer && schedule ? (
            <section aria-label="DEMO agenda">
              <h2>DEMO agenda (izolovano)</h2>
              <p className="meta">Sintetičke utakmice, odvojene od proverene agende iznad. Isti filter važi i ovde.</p>
              <AgendaGroup
                title="Predstojeće (DEMO)"
                entries={demoGroups.upcoming}
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
                title="Termin naknadno (DEMO)"
                entries={demoGroups.toBeAnnounced}
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
                title="Odloženo ili otkazano (DEMO)"
                entries={demoGroups.disrupted}
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
                title="Arhiva (DEMO)"
                entries={demoGroups.archive}
                schedule={schedule}
                timeZone={timeZone}
                now={now}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={onToggleManual}
                expandedId={expandedId}
                onToggleDetail={setExpandedId}
              />
            </section>
          ) : null}
          {schedule ? (
            <>
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
            </>
          ) : null}
          <div className="note" data-draft-dirty={draftNote.trim().length > 0 ? 'true' : 'false'}>
            <label htmlFor="draft-note">Beleška uz događaj</label>
            <textarea
              id="draft-note"
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

/**
 * Faza 05: tačno poreklo unificirane agende — poslednja uspešna provera
 * proverenih snimaka. Bez uspešnog pronalaženja nema sekcije.
 */
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

/** Jedan red unificirane serverske agende: bez DEMO oznake, sa izvorom i razlozima. */
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

