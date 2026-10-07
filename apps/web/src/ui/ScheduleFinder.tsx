import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_SEASON_ID } from '../../../../packages/domain/src/schedule-api.ts';
import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';
import type { FindFixturesResponseKind } from '../../../../packages/domain/src/schedule-api.ts';
import type { Fixture, ScheduleAvailability, Sport } from '../../../../packages/domain/src/types.ts';
import {
  fixtureTitle,
  formatFetchedAt,
  kickoffText,
  reasonsForFixture,
  scheduleStatusLabel,
} from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';
import {
  postFindFixtures,
  ScheduleApiError,
} from '../logic/schedule-api.ts';
import { scheduleServerDisabledMessage, syntheticScheduleRejectedMessage } from '../logic/schedule-config.ts';
import {
  unifiedServerTeams,
  unifiedVerifiedFixtures,
} from '../logic/server-agenda.ts';
import {
  listLastGood,
  purgeRevokedSnapshots,
  readLastGood,
  refreshCooldown,
  writeLastAttemptAt,
  writeLastGood,
  type LastGoodSchedule,
} from '../logic/schedule-store.ts';
import type { KeyValueStore } from '../logic/user-local.ts';
import { ModalPanel } from './ModalPanel.tsx';
import { catalogRowState, reasonLabel } from './PersonalAgendaHelpers.ts';

export interface ScheduleFinderDeps {
  apiBase: string | null;
  getIdToken: () => Promise<string | null>;
  store: KeyValueStore;
  now: number;
  online: boolean;
}

/** Samo provereno ili blokirano trajno stanje. Sintetički odgovor se ne prikazuje. */
export type DisplayedSchedule = LastGoodSchedule;

const AVAILABILITY_LABEL: Record<ScheduleAvailability, string> = {
  published: 'Objavljeno',
  unpublished: 'Neobjavljeno',
  source_error: 'Greška izvora',
  not_participant: 'Ne učestvuje',
  unknown: 'Nepoznato',
};

const KIND_LABEL: Record<FindFixturesResponseKind, string> = {
  'verified-schedule': 'Proveren raspored',
  'source-blocked': 'Izvor blokiran',
  'synthetic-demo': 'Izvor nije dostupan',
};

export function scheduleKindLabel(kind: FindFixturesResponseKind): string {
  return KIND_LABEL[kind];
}

export function scheduleAvailabilityLabel(value: ScheduleAvailability): string {
  return AVAILABILITY_LABEL[value];
}

export function formatCooldownWait(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60000));
  return minutes === 1 ? '1 minut' : `${minutes} minuta`;
}

/** Korisniku ne pokazuj putanju odgovora ni status servera. Poslednji dobar raspored ostaje jasan. */
function visibleScheduleError(reason: unknown): string {
  if (reason instanceof ScheduleApiError && reason.code === 'wrong-response') {
    return 'Dobijeni raspored nije ispravan. Prikaz je iz poslednjeg sačuvanog stanja.';
  }
  if (reason instanceof ScheduleApiError && reason.code === 'server') {
    return 'Server rasporeda nije dostupan. Prikaz je iz poslednjeg sačuvanog stanja.';
  }
  if (reason instanceof ScheduleApiError) return reason.message;
  return 'Pronalaženje nije uspelo. Prikaz je iz poslednjeg sačuvanog stanja.';
}

export function useScheduleFinder(deps: ScheduleFinderDeps) {
  const { apiBase, getIdToken, store, now, online } = deps;
  const [sport, setSport] = useState<Sport>('football');
  const teams = useMemo(() => selectableTeams(sport), [sport]);
  const [teamId, setTeamId] = useState<string>(() => selectableTeams('football')[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pending = useRef<AbortController | null>(null);
  // Monotoni redni broj: samo najsvežije pronalaženje sme da upiše ili prijavi
  // grešku. Zastareli odgovor (dvoklik, izbor kluba/sporta, zamena naloga)
  // nikad ne prepisuje noviji prikaz niti token.
  const seq = useRef(0);

  useEffect(() => () => {
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
  }, []);

  function abortPending() {
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
  }

  const activeTeamId = teams.some((team) => team.id === teamId) ? teamId : teams[0]?.id ?? '';
  const lastGood = useMemo(
    () => (activeTeamId ? readLastGood(store, activeTeamId, INITIAL_SEASON_ID) : null),
    [store, activeTeamId, tick],
  );
  const cooldown = useMemo(
    () => refreshCooldown(store, activeTeamId, INITIAL_SEASON_ID, now),
    [store, activeTeamId, now, tick],
  );
  const snapshots = useMemo(
    () => listLastGood(store, INITIAL_SEASON_ID),
    [store, tick],
  );
  const displayed: DisplayedSchedule | null = lastGood;

  function pickSport(next: Sport) {
    // Izbor sporta prekida let: kasni odgovor za stari sport se ne upisuje.
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
    setSport(next);
    const first = selectableTeams(next)[0];
    if (first) setTeamId(first.id);
    setError(null);
  }

  function pickTeam(next: string) {
    // Izbor kluba prekida let: kasni odgovor za stari klub se ne upisuje.
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
    setTeamId(next);
    setError(null);
  }

  function focusTeam(nextSport: Sport, nextTeamId: string) {
    // Otvaranje rasporeda ne šalje zahtev. Prekida tuđi let i ne upisuje ga.
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
    setSport(nextSport);
    setTeamId(nextTeamId);
    setError(null);
    setWorking(false);
  }

  const find = useCallback(async (refresh: boolean) => {
    // Dvoklik/ponovni klik: prethodni let se prekida i nikad ne prepisuje noviji.
    pending.current?.abort();
    pending.current = null;
    const current = seq.current + 1;
    seq.current = current;
    if (!apiBase) {
      setError(scheduleServerDisabledMessage());
      return;
    }
    if (refresh) {
      const gate = refreshCooldown(store, activeTeamId, INITIAL_SEASON_ID, Date.now());
      if (!gate.allowed) {
        setError(`Osvežavanje je moguće za ${formatCooldownWait(gate.waitMs)}. Prethodni prikaz je sačuvan.`);
        return;
      }
    }
    setWorking(true);
    setError(null);
    const attemptAt = new Date().toISOString();
    try {
      writeLastAttemptAt(store, activeTeamId, INITIAL_SEASON_ID, attemptAt);
    } catch {
      if (seq.current !== current) return;
      setWorking(false);
      setError('Neispravan izbor kluba.');
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const isCurrent = () => seq.current === current && pending.current === controller && !controller.signal.aborted;
    try {
      const idToken = await getIdToken();
      // Token uzet pre zamene naloga je zastareo: ne šalje se i ne upisuje.
      if (!isCurrent()) {
        throw new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.');
      }
      const response = await postFindFixtures({
        baseUrl: apiBase,
        idToken,
        sport,
        teamId: activeTeamId,
        seasonId: INITIAL_SEASON_ID,
        refresh,
        online,
        signal: controller.signal,
      });
      // Kasni odgovor posle odjave/zamene ili novijeg klika se nikad ne upisuje.
      if (!isCurrent()) {
        throw new ScheduleApiError('aborted', 'Nalog je promenjen; zahtev je prekinut i nije upisan.');
      }
      if (response.kind === 'synthetic-demo') {
        setError(syntheticScheduleRejectedMessage());
      } else {
        writeLastGood(store, {
          teamId: activeTeamId,
          sport,
          seasonId: INITIAL_SEASON_ID,
          kind: response.kind,
          response,
          checkedAt: response.result.checkedAt,
          storedAt: new Date().toISOString(),
        });
        // Opoziv važi odmah za celu sezonu, ne samo za ovaj klub.
        purgeRevokedSnapshots(store, response, INITIAL_SEASON_ID);
      }
    } catch (reason) {
      // Zastareli let ćuti: greška starog klika ne sme da pregazi noviji prikaz.
      if (seq.current !== current) return;
      setError(visibleScheduleError(reason));
    } finally {
      if (pending.current === controller && seq.current === current) {
        pending.current = null;
        setWorking(false);
        setTick((value) => value + 1);
      }
    }
  }, [apiBase, getIdToken, store, activeTeamId, sport, online]);

  return {
    sport, pickSport, teams, teamId: activeTeamId, pickTeam, focusTeam,
    seasonId: INITIAL_SEASON_ID, working, error, lastGood, displayed, cooldown, snapshots, find,
    abortPending, configured: apiBase !== null,
  };
}

export type ScheduleFinderState = ReturnType<typeof useScheduleFinder>;

export function ScheduleFinder(props: {
  state: ScheduleFinderState;
  timeZone: string;
  now: number;
  online: boolean;
  teamId: string;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
}) {
  const { state, timeZone } = props;
  const [about, setAbout] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const saved = state.displayed?.teamId === props.teamId ? state.displayed : null;
  const hasSchedule = saved !== null;
  const refreshBlocked = hasSchedule && !state.cooldown.allowed;
  const detail = saved?.response.result.futureFixtures.find((fixture) => fixture.id === detailId) ?? null;
  useEffect(() => {
    setDetailId(null);
    setAbout(false);
  }, [props.teamId]);
  return (
    <section aria-label="Raspored kluba">
      <div className="schedule-toolbar">
        <button
          type="button"
          className="primary"
          disabled={state.working || !state.configured || refreshBlocked}
          onClick={() => void state.find(hasSchedule)}
        >
          {state.working ? 'Tražim…' : hasSchedule ? 'Osveži' : 'Pronađi utakmice'}
        </button>
        {refreshBlocked ? (
          <p className="meta">Osvežavanje je moguće za {formatCooldownWait(state.cooldown.waitMs)}.</p>
        ) : null}
        {!state.configured ? <p className="warning" role="status">{scheduleServerDisabledMessage()}</p> : null}
        {state.error ? <p className="warning" role="alert">{state.error}</p> : null}
        {saved?.kind === 'source-blocked' ? (
          <p className="warning" role="status">Izvor je blokiran. Prikaz je iz poslednjeg sačuvanog rasporeda.</p>
        ) : null}
        {!props.online && saved ? <p className="warning">Van mreže. Prikazan je poslednji sačuvani raspored.</p> : null}
      </div>
      {saved ? (
        <ScheduleMatchList saved={saved} timeZone={timeZone} now={props.now} onOpen={setDetailId} />
      ) : (
        <p>Još nema sačuvanog rasporeda.</p>
      )}
      {saved ? (
        <button type="button" onClick={() => setAbout(true)}>O rasporedu</button>
      ) : null}
      {about && saved ? (
        <ModalPanel title="O rasporedu" onClose={() => setAbout(false)}>
          <ScheduleAbout saved={saved} timeZone={timeZone} />
        </ModalPanel>
      ) : null}
      {detail && saved ? (
        <ScheduleFixtureDetail
          fixture={detail}
          teams={saved.response.teams}
          competitions={saved.response.competitions}
          timeZone={timeZone}
          now={props.now}
          followed={props.followed}
          manualFixtureIds={props.manualFixtureIds}
          onToggleManual={props.onToggleManual}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </section>
  );
}

function ScheduleMatchList(props: {
  saved: DisplayedSchedule;
  timeZone: string;
  now: number;
  onOpen: (fixtureId: string) => void;
}) {
  const { saved, timeZone } = props;
  const competitions = new Map(saved.response.competitions.map((competition) => [competition.id, competition]));
  const fixtures = saved.response.result.futureFixtures;
  if (fixtures.length === 0) return <p>Nema pronađenih utakmica za ovaj klub.</p>;
  return (
    <div className="agenda-list" data-schedule-kind={saved.kind} data-provenance={saved.checkedAt ?? undefined}>
      {fixtures.map((fixture) => (
        <article key={fixture.id} className="match-row" data-fixture-id={fixture.id}>
          <div>
            <button type="button" className="match-open" onClick={() => props.onOpen(fixture.id)}>
              <span className="match-title">{fixtureTitle(fixture, saved.response.teams)}</span>
            </button>
            <p className="match-meta">
              {kickoffText(fixture, timeZone)}
              {' · '}
              {competitions.get(fixture.competitionId)?.name ?? fixture.competitionId}
            </p>
            <p className="match-status">{scheduleStatusLabel(fixture, props.now)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ScheduleFixtureDetail(props: {
  fixture: Fixture;
  teams: readonly { id: string; name: string }[];
  competitions: readonly { id: string; name: string }[];
  timeZone: string;
  now: number;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
  onClose: () => void;
}) {
  const { fixture } = props;
  const title = fixtureTitle(fixture, props.teams);
  const competition = props.competitions.find((item) => item.id === fixture.competitionId)?.name ?? fixture.competitionId;
  const manual = catalogRowState(fixture, props.followed, props.manualFixtureIds);
  const reasons = reasonsForFixture(fixture, props.followed, props.manualFixtureIds);
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
      {reasons.length > 0 ? (
        <ul className="agenda-reasons" aria-label="Razlozi praćenja">
          {reasons.map((reason, index) => (
            <li key={`${reason.kind}-${index}`}>{reasonLabel(reason, props.teams)}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" aria-pressed={manual.manuallySelected} onClick={() => props.onToggleManual(fixture.id)}>
        {manual.toggleLabel}
      </button>
      {manual.toggleNote ? <p className="meta">{manual.toggleNote}</p> : null}
    </ModalPanel>
  );
}

function ScheduleAbout(props: { saved: DisplayedSchedule; timeZone: string }) {
  const { saved, timeZone } = props;
  const competitions = new Map(saved.response.competitions.map((competition) => [competition.id, competition]));
  return (
    <>
      {saved.checkedAt ? (
        <p>
          Poslednja provera:{' '}
          <time dateTime={saved.checkedAt}>{formatFetchedAt(saved.checkedAt, timeZone)}</time>.
        </p>
      ) : (
        <p>Još nema uspešne provere.</p>
      )}
      <h3>Takmičenja</h3>
      <ul className="club-list">
        {saved.response.result.coverage.map((row) => (
          <li key={row.id} data-coverage={row.competitionId} data-availability={row.scheduleAvailability}>
            <div>
              <strong>{competitions.get(row.competitionId)?.name ?? row.competitionId}</strong>
              <p className="meta">
                {AVAILABILITY_LABEL[row.scheduleAvailability]} · {sportLabel(saved.sport as Sport)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <h3>Izvori</h3>
      <ul className="club-list">
        {saved.response.manifests.map((manifest) => (
          <li key={`${manifest.provider}:${manifest.competitionId}`}>
            <div>
              <strong>{manifest.provider}</strong>
              <p className="meta">{competitions.get(manifest.competitionId)?.name ?? manifest.competitionId}</p>
              <p className="meta" data-manifest-success={manifest.lastSuccessAt ?? ''}>
                {manifest.lastSuccessAt
                  ? `Poslednji uspeh: ${formatFetchedAt(manifest.lastSuccessAt, timeZone)}`
                  : 'Nema uspešne provere.'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Kompatibilnost: jedinstveni skup iz server-agenda (najviša revizija po
 * id-u, derbi jednom, bez opozvanih izvora). Zadržano ime za postojeće uvoze.
 */
export function serverFixturesForAgenda(snapshots: readonly LastGoodSchedule[]): Fixture[] {
  return unifiedVerifiedFixtures(snapshots);
}

export function serverTeamsForAgenda(snapshots: readonly LastGoodSchedule[]): Array<{ id: string; name: string }> {
  return unifiedServerTeams(snapshots);
}
