import { useEffect, useMemo, useRef, useState } from 'react';
import './PersonalAgenda.css';
import {
  fixtureTitle,
  kickoffText,
  localDateInZone,
  scheduleStatusLabel,
  type AgendaEntry,
} from '../logic/agenda.ts';
import { calendarEligible } from '../logic/calendar.ts';
import { tabHash } from '../logic/routes.ts';
import type { LastGoodSchedule } from '../logic/schedule-store.ts';
import {
  buildUnifiedServerAgenda,
  unifiedServerCompetitions,
  unifiedServerTeams,
} from '../logic/server-agenda.ts';
import { ModalPanel } from './ModalPanel.tsx';
import { useCalendarExport } from './CalendarExport.tsx';
import {
  AGENDA_PERIOD_OPTIONS,
  AGENDA_SPORT_OPTIONS,
  AGENDA_VIEW_OPTIONS,
  activeAgendaFilterCount,
  catalogRowState,
  changeAgendaPage,
  changeAgendaQuery,
  changeSport,
  clearPrivateAgendaState,
  clubOptionsForAgenda,
  competitionOptionsForAgenda,
  DEFAULT_AGENDA_QUERY,
  entriesForSport,
  fallbackSelectionCount,
  groupPageByDay,
  initialAgendaListState,
  matchesForQuery,
  nextFixtureIds,
  paginateItems,
  reasonLabel,
  revalidateSelectedIds,
  selectAllEligible,
  toggleAgendaSelection,
  type AgendaQuery,
  type NamedRef,
} from './PersonalAgendaHelpers.ts';

export interface PersonalAgendaProps {
  active: boolean;
  now: number;
  timeZone: string;
  online: boolean;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  draftNote: string;
  onDraft: (value: string) => void;
  serverSnapshots?: readonly LastGoodSchedule[];
  accountIdentity: string;
}

const EMPTY_SNAPSHOTS: readonly LastGoodSchedule[] = [];

interface SingleExportNotice {
  fixtureId: string;
  accountIdentity: string;
  text: string;
}

function singleExportNoticeText(created: number, existing: number): string | null {
  const added = created > 0;
  const duplicate = existing > 0;
  if (added && duplicate) return 'Dodato u kalendar. Već je u kalendaru.';
  if (added) return 'Dodato u kalendar.';
  if (duplicate) return 'Već je u kalendaru.';
  return null;
}

export function PersonalAgenda(props: PersonalAgendaProps) {
  const snapshots = props.serverSnapshots ?? EMPTY_SNAPSHOTS;
  const agenda = useMemo(() => ({
    entries: buildUnifiedServerAgenda(snapshots, props.followed, props.manualFixtureIds),
    teams: unifiedServerTeams(snapshots),
    competitions: unifiedServerCompetitions(snapshots),
  }), [snapshots, props.followed, props.manualFixtureIds]);
  const [list, setList] = useState(initialAgendaListState);
  const [selecting, setSelecting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; single: boolean } | null>(null);
  // Hook keeps the previous calendar.message. This preview shows it only after its own runExport.
  const [confirmAttemptStarted, setConfirmAttemptStarted] = useState(false);
  const [singleNotice, setSingleNotice] = useState<SingleExportNotice | null>(null);
  const calendar = useCalendarExport({
    entries: agenda.entries,
    teams: agenda.teams,
    competitions: agenda.competitions,
    timeZone: props.timeZone,
    note: props.draftNote,
    accountIdentity: props.accountIdentity,
  });
  const identityRef = useRef(props.accountIdentity);
  identityRef.current = props.accountIdentity;
  const confirmEpoch = useRef(0);

  useEffect(() => {
    confirmEpoch.current += 1;
    setList((state) => clearPrivateAgendaState(state));
    setSelecting(false);
    setFiltersOpen(false);
    setConfirm(null);
    setConfirmAttemptStarted(false);
    setDetailId(null);
    setSingleNotice(null);
  }, [props.accountIdentity]);

  useEffect(() => {
    if (!props.active) {
      setFiltersOpen(false);
      setDetailId(null);
      setConfirm(null);
      setConfirmAttemptStarted(false);
    }
  }, [props.active]);

  const visible = matchesForQuery(agenda.entries, list.query, props.now, props.timeZone);
  const paged = paginateItems(visible, list.page);
  useEffect(() => {
    if (paged.page !== list.page) setList((state) => changeAgendaPage(state, paged.page));
  }, [paged.page, list.page]);

  const today = localDateInZone(props.now, props.timeZone);
  const days = groupPageByDay(paged.items, props.timeZone, today);
  const nextIds = new Set(nextFixtureIds(agenda.entries, props.now));
  const selectedNow = revalidateSelectedIds(list.selectedIds, visible);
  const filterCount = activeAgendaFilterCount(list.query);
  const sportEntries = entriesForSport(agenda.entries, list.query.sport);
  const clubs = clubOptionsForAgenda(sportEntries, agenda.teams);
  const competitions = competitionOptionsForAgenda(sportEntries, agenda.competitions);
  const detail = detailId ? agenda.entries.find((entry) => entry.fixture.id === detailId) ?? null : null;
  const detailNotice = detail && singleNotice && !selecting && !confirm
    && singleNotice.fixtureId === detail.fixture.id
    && singleNotice.accountIdentity === props.accountIdentity
    ? singleNotice.text
    : null;
  const confirmStatus = confirmAttemptStarted ? calendar.message : '';

  function applyQuery(query: AgendaQuery) {
    setList((state) => changeAgendaQuery(state, query));
    setConfirm(null);
  }

  function openBatch() {
    const ids = revalidateSelectedIds(list.selectedIds, visible);
    if (ids.length === 0) return;
    setSingleNotice(null);
    setConfirmAttemptStarted(false);
    setConfirm({ ids, single: false });
  }

  function openSingle(fixtureId: string) {
    const ids = revalidateSelectedIds([fixtureId], agenda.entries);
    if (ids.length === 0) return;
    setConfirmAttemptStarted(false);
    setConfirm({ ids, single: true });
  }

  function dismissConfirm() {
    confirmEpoch.current += 1;
    calendar.cancel();
    setConfirm(null);
    setConfirmAttemptStarted(false);
  }

  async function runExport() {
    if (!confirm || calendar.busy) return;
    const requested = confirm.ids;
    const single = confirm.single;
    const identity = identityRef.current;
    const epoch = confirmEpoch.current;
    setSingleNotice(null);
    setConfirmAttemptStarted(true);
    const result = await calendar.exportIds(requested);
    if (result.aborted || identity !== identityRef.current || epoch !== confirmEpoch.current) return;
    const done = new Set(requested.filter((id) => !result.remaining.includes(id)));
    setList((state) => ({ ...state, selectedIds: state.selectedIds.filter((id) => !done.has(id)) }));
    if (result.failed > 0) {
      setConfirmAttemptStarted(true);
      setConfirm({ ids: result.remaining, single });
      return;
    }
    setConfirm(null);
    const fixtureId = requested.length === 1 ? requested[0] : undefined;
    const text = single && fixtureId ? singleExportNoticeText(result.created, result.existing) : null;
    if (single && fixtureId && text) setSingleNotice({ fixtureId, accountIdentity: identity, text });
  }

  return (
    <section aria-label="Utakmice">
      <div className="agenda-toolbar">
        <h1>Utakmice</h1>
        {!props.online ? <p className="warning">Van mreže. Prikazan je poslednji sačuvan raspored.</p> : null}
        <div className="agenda-filters" role="group" aria-label="Sport">
          {AGENDA_SPORT_OPTIONS.map(([sport, label]) => (
            <button
              key={sport}
              type="button"
              aria-pressed={list.query.sport === sport}
              onClick={() => applyQuery(changeSport(list.query, sport))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="agenda-filters" role="group" aria-label="Period">
          {AGENDA_PERIOD_OPTIONS.map(([period, label]) => (
            <button
              key={period}
              type="button"
              aria-pressed={list.query.period === period}
              onClick={() => applyQuery({ ...list.query, period })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="agenda-actions">
          <button type="button" onClick={() => setFiltersOpen(true)}>
            {filterCount > 0 ? `Filteri (${filterCount})` : 'Filteri'}
          </button>
          {filterCount > 0 ? (
            <button type="button" onClick={() => applyQuery(DEFAULT_AGENDA_QUERY)}>
              Poništi
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((value) => {
                if (value) setList((state) => ({ ...state, selectedIds: [] }));
                return !value;
              });
              setConfirm(null);
            }}
          >
            Izaberi
          </button>
          {selecting ? (
            <button
              type="button"
              disabled={calendar.busy || selectEligibleCount(visible) === 0}
              onClick={() => setList((state) => selectAllEligible(state, visible))}
            >
              Izaberi sve
            </button>
          ) : null}
        </div>
        <div className="agenda-pagination">
          <button type="button" disabled={paged.page <= 1} onClick={() => setList((state) => changeAgendaPage(state, paged.page - 1))}>
            Prethodna
          </button>
          <span>Strana {paged.page} od {paged.pages}</span>
          <button type="button" disabled={paged.page >= paged.pages} onClick={() => setList((state) => changeAgendaPage(state, paged.page + 1))}>
            Sledeća
          </button>
        </div>
      </div>
      {!agenda.entries.length ? (
        <p>Nema praćenih utakmica. <a href={tabHash('clubs')}>Prati klub</a></p>
      ) : null}
      {agenda.entries.length > 0 && !visible.length ? (
        <div>
          <p>Nema utakmica za ovaj izbor.</p>
          {filterCount > 0 ? (
            <button type="button" onClick={() => applyQuery(DEFAULT_AGENDA_QUERY)}>Poništi</button>
          ) : null}
        </div>
      ) : null}
      <div className="agenda-list" data-server-agenda="unified">
        {days.map((day) => (
          <section key={day.key}>
            <h2 className="agenda-day">{day.label}</h2>
            {day.entries.map((entry) => (
              <MatchRow
                key={entry.fixture.id}
                entry={entry}
                teams={agenda.teams}
                competitions={agenda.competitions}
                timeZone={props.timeZone}
                now={props.now}
                next={nextIds.has(entry.fixture.id)}
                selecting={selecting}
                checked={list.selectedIds.includes(entry.fixture.id)}
                busy={calendar.busy}
                onChecked={(on) => setList((state) => toggleAgendaSelection(state, entry.fixture.id, on))}
                onOpen={() => setDetailId(entry.fixture.id)}
              />
            ))}
          </section>
        ))}
      </div>
      {props.active && selecting ? (
        <div className="calendar-bar" role="region" aria-label="Google kalendar">
          <p>{selectedNow.length} izabrano</p>
          <button type="button" className="primary" disabled={calendar.busy || selectedNow.length === 0 || !props.online} onClick={openBatch}>
            Dodaj u kalendar
          </button>
          {!props.online ? <p className="meta">Za dodavanje u kalendar potrebna je mreža.</p> : null}
          {calendar.message && (!confirm || confirmAttemptStarted) ? <p role="status">{calendar.message}</p> : null}
        </div>
      ) : null}
      {props.active && filtersOpen ? (
        <ModalPanel title="Filteri" onClose={() => setFiltersOpen(false)}>
          <label htmlFor="agenda-club">Klub</label>
          <select
            id="agenda-club"
            value={list.query.clubId}
            onChange={(event) => applyQuery({ ...list.query, clubId: event.target.value })}
          >
            <option value="all">Svi klubovi</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
          <label htmlFor="agenda-competition">Takmičenje</label>
          <select
            id="agenda-competition"
            value={list.query.competitionId}
            onChange={(event) => applyQuery({ ...list.query, competitionId: event.target.value })}
          >
            <option value="all">Sva takmičenja</option>
            {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
          </select>
          <div className="filters" role="group" aria-label="Prikaz">
            {AGENDA_VIEW_OPTIONS.map(([view, label]) => (
              <button
                key={view}
                type="button"
                aria-pressed={list.query.view === view}
                onClick={() => applyQuery({ ...list.query, view })}
              >
                {label}
              </button>
            ))}
          </div>
          {filterCount > 0 ? (
            <div className="modal-actions">
              <button type="button" onClick={() => applyQuery(DEFAULT_AGENDA_QUERY)}>
                Poništi
              </button>
            </div>
          ) : null}
        </ModalPanel>
      ) : null}
      {props.active && detail ? (
        <MatchDetail
          entry={detail}
          teams={agenda.teams}
          competitions={agenda.competitions}
          timeZone={props.timeZone}
          now={props.now}
          followed={props.followed}
          manualFixtureIds={props.manualFixtureIds}
          onToggleManual={props.onToggleManual}
          onClose={() => setDetailId(null)}
          onExport={() => openSingle(detail.fixture.id)}
          exportNotice={detailNotice}
        />
      ) : null}
      {props.active && confirm && confirm.ids.length > 0 ? (
        <ModalPanel title="Dodaj u kalendar" onClose={dismissConfirm}>
          <p>Broj događaja: {confirm.ids.length}.</p>
          <p>Upis je jednokratan. Kasnije promene rasporeda se ne ažuriraju same.</p>
          {fallbackSelectionCount(agenda.entries, confirm.ids) > 0 ? (
            <p className="warning" role="status">
              Utakmice bez poznate satnice upisuju se u 17:00. Proveri zvaničan termin.
            </p>
          ) : null}
          <div className="note" data-draft-dirty={props.draftNote.trim() ? 'true' : 'false'}>
            <label htmlFor="draft-note">Beleška</label>
            <textarea
              id="draft-note"
              value={props.draftNote}
              onChange={(event) => props.onDraft(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Opciona beleška"
            />
          </div>
          {confirmStatus ? <p role="status">{confirmStatus}</p> : null}
          <div className="modal-actions">
            <button type="button" className="primary" disabled={calendar.busy || !props.online} onClick={() => void runExport()}>
              {calendar.busy ? 'Dodavanje…' : confirmStatus && confirm.ids.length > 0 && /nije|nije dobijena|Pokušaj|Preostale/.test(confirmStatus) ? 'Pokušaj ponovo' : 'Dodaj u kalendar'}
            </button>
          </div>
          {!props.online ? <p className="meta">Za dodavanje u kalendar potrebna je mreža.</p> : null}
        </ModalPanel>
      ) : null}
    </section>
  );
}

function selectEligibleCount(entries: readonly AgendaEntry[]): number {
  return entries.filter((entry) => calendarEligible(entry.fixture)).length;
}

function MatchRow(props: {
  entry: AgendaEntry;
  teams: readonly NamedRef[];
  competitions: readonly NamedRef[];
  timeZone: string;
  now: number;
  next: boolean;
  selecting: boolean;
  checked: boolean;
  busy: boolean;
  onChecked: (on: boolean) => void;
  onOpen: () => void;
}) {
  const { fixture } = props.entry;
  const title = fixtureTitle(fixture, props.teams);
  const competition = props.competitions.find((item) => item.id === fixture.competitionId)?.name ?? fixture.competitionId;
  const eligible = calendarEligible(fixture);
  return (
    <article className="match-row" data-fixture-id={fixture.id}>
      {props.selecting ? (
        <label>
          <input
            type="checkbox"
            checked={eligible && props.checked}
            disabled={props.busy || !eligible}
            aria-label={`Izaberi ${title}`}
            onChange={(event) => props.onChecked(event.target.checked)}
          />
        </label>
      ) : null}
      <div>
        <button type="button" className="match-open" onClick={props.onOpen}>
          <span className="match-title">{title}</span>
        </button>
        <p className="match-meta">{kickoffText(fixture, props.timeZone)} · {competition}</p>
        <p className="match-status">
          <span>{scheduleStatusLabel(fixture, props.now)}</span>
          {props.next ? <span className="next-badge">Sledeća</span> : null}
        </p>
      </div>
    </article>
  );
}

function MatchDetail(props: {
  entry: AgendaEntry;
  teams: readonly NamedRef[];
  competitions: readonly NamedRef[];
  timeZone: string;
  now: number;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  onClose: () => void;
  onExport: () => void;
  exportNotice: string | null;
}) {
  const { fixture } = props.entry;
  const title = fixtureTitle(fixture, props.teams);
  const competition = props.competitions.find((item) => item.id === fixture.competitionId)?.name ?? fixture.competitionId;
  const manual = catalogRowState(fixture, props.followed, props.manualFixtureIds);
  const eligible = calendarEligible(fixture);
  return (
    <ModalPanel title={title} onClose={props.onClose}>
      <p className="match-meta">{kickoffText(fixture, props.timeZone)}</p>
      <p className="match-status">{scheduleStatusLabel(fixture, props.now)}</p>
      <dl>
        <div>
          <dt>Takmičenje</dt>
          <dd>{competition}</dd>
        </div>
        <div>
          <dt>Sezona</dt>
          <dd>{fixture.seasonId}</dd>
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
        <div>
          <dt>Izvor</dt>
          <dd>
            <a href={fixture.sourceUrl} data-source-url={fixture.sourceUrl} rel="noreferrer">{fixture.provider}</a>
          </dd>
        </div>
      </dl>
      <ul className="agenda-reasons" aria-label="Razlozi praćenja">
        {props.entry.reasons.map((reason, index) => (
          <li key={`${reason.kind}-${index}`}>{reasonLabel(reason, props.teams)}</li>
        ))}
      </ul>
      <button type="button" aria-pressed={manual.manuallySelected} onClick={() => props.onToggleManual(fixture.id)}>
        {manual.toggleLabel}
      </button>
      {manual.toggleNote ? <p className="meta">{manual.toggleNote}</p> : null}
      {props.exportNotice ? <p role="status">{props.exportNotice}</p> : null}
      {eligible ? (
        <div className="modal-actions">
          <button type="button" className="primary" onClick={props.onExport}>Dodaj u kalendar</button>
        </div>
      ) : null}
    </ModalPanel>
  );
}
