import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INITIAL_SEASON_ID } from '../../../../packages/domain/src/schedule-api.ts';
import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';
import type {
  FindFixturesHttpSuccess,
  FindFixturesResponseKind,
} from '../../../../packages/domain/src/schedule-api.ts';
import type { Fixture, ScheduleAvailability, Sport, Team } from '../../../../packages/domain/src/types.ts';
import {
  fixtureTitle,
  formatFetchedAt,
  kickoffText,
  statusLabel,
} from '../logic/agenda.ts';
import { sportLabel } from '../logic/clubs.ts';
import {
  postFindFixtures,
  ScheduleApiError,
} from '../logic/schedule-api.ts';
import { scheduleServerDisabledMessage } from '../logic/schedule-config.ts';
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

export interface ScheduleFinderDeps {
  apiBase: string | null;
  getIdToken: () => Promise<string | null>;
  store: KeyValueStore;
  now: number;
  online: boolean;
}

/** Provereno ili blokirano trajno stanje, ili efemerni DEMO samo za prikaz. */
export interface DisplayedSchedule {
  teamId: string;
  sport: string;
  seasonId: string;
  kind: FindFixturesResponseKind;
  response: FindFixturesHttpSuccess;
  checkedAt: string | null;
  storedAt: string;
}

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
  'synthetic-demo': 'DEMO',
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

export function useScheduleFinder(deps: ScheduleFinderDeps) {
  const { apiBase, getIdToken, store, now, online } = deps;
  const [sport, setSport] = useState<Sport>('football');
  const teams = useMemo(() => selectableTeams(sport), [sport]);
  const [teamId, setTeamId] = useState<string>(() => selectableTeams('football')[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // DEMO je efemeran: prikazuje se, ali se nikad ne upisuje u trajno
  // stanje i ne ulazi u agendu — ne sme da zameni provereno stanje.
  const [ephemeral, setEphemeral] = useState<{ teamId: string; response: FindFixturesHttpSuccess } | null>(null);
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
  const displayed: DisplayedSchedule | null = useMemo(() => {
    if (ephemeral && ephemeral.teamId === activeTeamId) {
      return {
        teamId: activeTeamId,
        sport,
        seasonId: INITIAL_SEASON_ID,
        kind: ephemeral.response.kind,
        response: ephemeral.response,
        checkedAt: ephemeral.response.result.checkedAt,
        storedAt: new Date().toISOString(),
      };
    }
    return lastGood;
  }, [ephemeral, activeTeamId, sport, lastGood]);

  function pickSport(next: Sport) {
    // Izbor sporta prekida let: kasni odgovor za stari sport se ne upisuje.
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
    setSport(next);
    const first = selectableTeams(next)[0];
    if (first) setTeamId(first.id);
    setError(null);
    setEphemeral(null);
  }

  function pickTeam(next: string) {
    // Izbor kluba prekida let: kasni odgovor za stari klub se ne upisuje.
    seq.current += 1;
    pending.current?.abort();
    pending.current = null;
    setTeamId(next);
    setError(null);
    setEphemeral(null);
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
    setEphemeral(null);
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
        // DEMO ostaje efemeran: prikazuje se, ali se nikad ne upisuje u
        // trajno stanje i ne ulazi u agendu.
        setEphemeral({ teamId: activeTeamId, response });
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
      setError(reason instanceof ScheduleApiError
        ? reason.message
        : 'Pronalaženje nije uspelo. Prikaz je iz poslednjeg sačuvanog stanja.');
    } finally {
      if (pending.current === controller && seq.current === current) {
        pending.current = null;
        setWorking(false);
        setTick((value) => value + 1);
      }
    }
  }, [apiBase, getIdToken, store, activeTeamId, sport, online]);

  return {
    sport, pickSport, teams, teamId: activeTeamId, pickTeam,
    seasonId: INITIAL_SEASON_ID, working, error, lastGood, displayed, cooldown, snapshots, find,
    abortPending, configured: apiBase !== null,
  };
}

export type ScheduleFinderState = ReturnType<typeof useScheduleFinder>;

export function ScheduleFinder(props: {
  state: ScheduleFinderState;
  timeZone: string;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
}) {
  const { state, timeZone } = props;
  return (
    <section aria-label="Raspored na zahtev">
      <h2>Raspored na zahtev</h2>
      <p className="lead">
        Izaberi klub i pritisni „Pronađi utakmice”. Raspored je za sezonu {state.seasonId}.
      </p>
      <div className="filters" role="group" aria-label="Sport">
        <button type="button" aria-pressed={state.sport === 'football'} onClick={() => state.pickSport('football')}>
          Fudbal
        </button>
        <button type="button" aria-pressed={state.sport === 'basketball'} onClick={() => state.pickSport('basketball')}>
          Košarka
        </button>
      </div>
      <div className="filters" role="group" aria-label="Klub">
        {state.teams.map((team) => (
          <button
            key={team.id}
            type="button"
            aria-pressed={state.teamId === team.id}
            onClick={() => state.pickTeam(team.id)}
          >
            {team.name}
          </button>
        ))}
      </div>
      {!state.configured ? (
        <p className="warning" role="status">Server rasporeda nije podešen u ovoj instalaciji. Pronalaženje nije dostupno; prikaz je iz sačuvanog stanja i DEMO rasporeda.</p>
      ) : null}
      <div className="filters">
        <button
          type="button"
          disabled={state.working || !state.configured}
          onClick={() => void state.find(false)}
        >
          {state.working ? 'Tražim…' : 'Pronađi utakmice'}
        </button>
        <button
          type="button"
          disabled={state.working || !state.configured || (!state.cooldown.allowed)}
          title={state.cooldown.allowed ? undefined : `Osvežavanje je moguće za ${formatCooldownWait(state.cooldown.waitMs)}.`}
          onClick={() => void state.find(true)}
        >
          Osveži raspored
        </button>
      </div>
      {!state.cooldown.allowed ? (
        <p className="meta">Osvežavanje je moguće za {formatCooldownWait(state.cooldown.waitMs)}. Keš poštuje najkraći razmak.</p>
      ) : null}
      {state.error ? <p className="warning" role="alert">{state.error}</p> : null}
      {state.displayed ? (
        <ScheduleResult
          lastGood={state.displayed}
          timeZone={timeZone}
          followed={props.followed}
          manualFixtureIds={props.manualFixtureIds}
          onToggleManual={props.onToggleManual}
        />
      ) : (
        <p className="meta">Još nema sačuvanog rasporeda za ovaj klub i sezonu.</p>
      )}
    </section>
  );
}

export function ScheduleResult(props: {
  lastGood: DisplayedSchedule;
  timeZone: string;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggleManual: (fixtureId: string) => void;
}) {
  const { lastGood, timeZone } = props;
  const { response } = lastGood;
  const competitions = new Map(response.competitions.map((competition) => [competition.id, competition]));
  return (
    <div data-schedule-kind={lastGood.kind} data-provenance={lastGood.checkedAt ?? undefined}>
      <p className="meta">
        <strong>{KIND_LABEL[lastGood.kind]}</strong>
        {lastGood.kind === 'synthetic-demo' ? ' — sintetički podaci, nisu stvarne utakmice.' : null}
        {lastGood.kind === 'source-blocked' ? ' — blokirane utakmice se ne prikazuju kao proverene; važi poslednje sačuvano stanje.' : null}
      </p>
      {lastGood.checkedAt ? (
        <p>
          Poslednja uspešna provera:{' '}
          <time dateTime={lastGood.checkedAt}>{formatFetchedAt(lastGood.checkedAt, timeZone)}</time>.
        </p>
      ) : (
        <p>Još nema uspešne provere izvora.</p>
      )}
      {response.result.futureFixtures.length === 0 ? (
        <p>Nema pronađenih budućih utakmica. Prazan odgovor nije tvrdnja da utakmica nema.</p>
      ) : null}
      {response.result.futureFixtures.map((fixture) => (
        <ServerFixtureCard
          key={fixture.id}
          fixture={fixture}
          teams={response.teams}
          competitionName={competitions.get(fixture.competitionId)?.name ?? fixture.competitionId}
          timeZone={timeZone}
          demo={lastGood.kind === 'synthetic-demo'}
          tracked={props.followed.some((id) => fixture.homeTeamId === id || fixture.awayTeamId === id)
            || props.manualFixtureIds.includes(fixture.id)}
          onToggleManual={props.onToggleManual}
        />
      ))}
      <h3>Pokriće po takmičenju</h3>
      <ul className="club-list">
        {response.result.coverage.map((row) => (
          <li key={row.id} data-coverage={row.competitionId} data-availability={row.scheduleAvailability}>
            <div>
              <strong>{competitions.get(row.competitionId)?.name ?? row.competitionId}</strong>
              <p className="meta">
                {AVAILABILITY_LABEL[row.scheduleAvailability]} · {sportLabel(lastGood.sport as Sport)}
                {row.timePrecision ? ` · sat: ${row.timePrecision}` : ''}
                {row.requestsPerRefresh !== null ? ` · zahtevi: ${row.requestsPerRefresh}` : ''}
              </p>
              <p className="meta">{row.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
      <h3>Izvori i svežina</h3>
      <ul className="club-list">
        {response.manifests.map((manifest) => (
          <li key={`${manifest.provider}:${manifest.competitionId}`}>
            <div>
              <strong>{manifest.provider} · {competitions.get(manifest.competitionId)?.name ?? manifest.competitionId}</strong>
              <p className="meta" data-manifest-success={manifest.lastSuccessAt ?? ''}>
                {manifest.lastSuccessAt
                  ? `Poslednji uspeh: ${formatFetchedAt(manifest.lastSuccessAt, timeZone)}`
                  : 'Nema uspešne provere.'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {response.changes.length > 0 ? (
        <p className="meta">Promene od prošlog stanja: {response.changes.map((change) => change.kind).join(', ')}.</p>
      ) : null}
    </div>
  );
}

export function ServerFixtureCard(props: {
  fixture: Fixture;
  teams?: readonly Team[];
  competitionName: string;
  timeZone: string;
  demo: boolean;
  tracked: boolean;
  onToggleManual: (fixtureId: string) => void;
}) {
  const { fixture, timeZone } = props;
  const teams = props.teams ?? selectableTeams(fixture.sport);
  return (
    <article className="card">
      <p className="kicker">
        {props.demo ? <span className="demo">DEMO</span> : null}
        <span>{sportLabel(fixture.sport)}</span>
        <span>{props.competitionName}</span>
      </p>
      <h3>{fixtureTitle(fixture, teams)}</h3>
      <p>{kickoffText(fixture, timeZone)}</p>
      <p className="meta">
        {statusLabel(fixture.status)}
        {fixture.venue ? ` · ${fixture.venue}` : ''}
        {fixture.round ? ` · ${fixture.round}` : ''}
      </p>
      <p className="meta">
        Izvor:{' '}
        <a href={fixture.sourceUrl} data-source-url={fixture.sourceUrl} rel="noreferrer">
          {fixture.provider}
        </a>
      </p>
      <button
        type="button"
        aria-pressed={props.tracked}
        onClick={() => props.onToggleManual(fixture.id)}
      >
        {props.tracked ? 'Pratim u aplikaciji' : 'Prati'}
      </button>
    </article>
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
