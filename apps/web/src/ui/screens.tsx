import { useState, type ReactNode } from 'react';

import type { Sport } from '../../../../packages/domain/src/types.ts';
import { APP_BUILD } from '../build.ts';
import {
  fixturesForFollowed,
  fixturesForLocalDates,
  formatFetchedAt,
  localDateInZone,
  myMatchGroups,
  nextConfirmedFixtures,
  weekDatesAfter,
} from '../logic/agenda.ts';
import { clubChoices, sportLabel } from '../logic/clubs.ts';
import { isStandaloneDisplay, needsIosInstallHelp } from '../logic/install.ts';
import type { RouteId } from '../logic/routes.ts';
import { isScheduleStale, type DemoSchedule } from '../logic/schedule.ts';
import type { DevicePrefs } from '../logic/user-local.ts';
import { FixtureCard } from './FixtureCard.tsx';

export function HomeScreen(props: {
  schedule: DemoSchedule | null;
  error: string | null;
  now: number;
  timeZone: string;
  online: boolean;
  followed: readonly string[];
}) {
  const { schedule, error, now, timeZone, online, followed } = props;
  return (
    <section>
      <h1>Početna</h1>
      <p className="lead">Izaberi klub. DEMO raspored pokazuje samo izmišljene utakmice, dok pravi podaci nisu povezani.</p>
      <Freshness schedule={schedule} now={now} timeZone={timeZone} online={online} />
      {error ? <p className="warning" role="alert">{error}</p> : null}
      {schedule ? <HomeLists schedule={schedule} now={now} timeZone={timeZone} followed={followed} /> : null}
      {!schedule && !error ? <p>Učitavam DEMO raspored.</p> : null}
    </section>
  );
}

function HomeLists(props: {
  schedule: DemoSchedule;
  now: number;
  timeZone: string;
  followed: readonly string[];
}) {
  const { schedule, now, timeZone, followed } = props;
  const today = localDateInZone(now, timeZone);
  const next = nextConfirmedFixtures(schedule.fixtures, now);
  const todayFixtures = fixturesForLocalDates(schedule.fixtures, [today], timeZone);
  const weekFixtures = fixturesForLocalDates(schedule.fixtures, weekDatesAfter(today), timeZone);
  return (
    <>
      <h2>Sledeća utakmica</h2>
      {next.length === 0 ? <p>Nema predstojeće DEMO utakmice sa potvrđenim terminom.</p> : null}
      {next.map((fixture) => (
        <FixtureCard
          key={fixture.id}
          fixture={fixture}
          schedule={schedule}
          timeZone={timeZone}
          now={now}
          followed={followed.some((id) => fixture.homeTeamId === id || fixture.awayTeamId === id)}
        />
      ))}
      <h2>Danas</h2>
      <FixtureList fixtures={todayFixtures} schedule={schedule} timeZone={timeZone} now={now} followed={followed} empty="Nema DEMO utakmice za današnji datum." />
      <h2>Narednih sedam dana</h2>
      <FixtureList fixtures={weekFixtures} schedule={schedule} timeZone={timeZone} now={now} followed={followed} empty="Nema DEMO utakmice u narednih sedam dana." />
    </>
  );
}

function FixtureList(props: {
  fixtures: readonly import('../../../../packages/domain/src/types.ts').Fixture[];
  schedule: DemoSchedule;
  timeZone: string;
  now: number;
  followed: readonly string[];
  empty: string;
}) {
  if (props.fixtures.length === 0) return <p>{props.empty}</p>;
  return (
    <>
      {props.fixtures.map((fixture) => (
        <FixtureCard
          key={fixture.id}
          fixture={fixture}
          schedule={props.schedule}
          timeZone={props.timeZone}
          now={props.now}
          followed={props.followed.some((id) => fixture.homeTeamId === id || fixture.awayTeamId === id)}
        />
      ))}
    </>
  );
}

export function MineScreen(props: {
  schedule: DemoSchedule | null;
  timeZone: string;
  now: number;
  followed: readonly string[];
  draftNote: string;
  onDraft: (value: string) => void;
}) {
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const fixtures = props.schedule
    ? fixturesForFollowed(props.schedule.fixtures, props.followed).filter((fixture) => sport === 'all' || fixture.sport === sport)
    : [];
  const groups = myMatchGroups(fixtures);
  return (
    <section>
      <h1>Moje utakmice</h1>
      <p className="lead">Hronološki DEMO pregled klubova koje pratiš u ovoj sesiji. Jedna utakmica je jedan red.</p>
      <div className="filters" role="group" aria-label="Filter sporta">
        <FilterButton pressed={sport === 'all'} onClick={() => setSport('all')}>Svi</FilterButton>
        <FilterButton pressed={sport === 'football'} onClick={() => setSport('football')}>Fudbal</FilterButton>
        <FilterButton pressed={sport === 'basketball'} onClick={() => setSport('basketball')}>Košarka</FilterButton>
      </div>
      {props.followed.length === 0 ? <p>Nema praćenih klubova. Izaberi klub na ekranu Klubovi.</p> : null}
      {props.followed.length > 0 && fixtures.length === 0 ? <p>Nema DEMO utakmice za ovaj filter.</p> : null}
      <Group title="Potvrđen termin" fixtures={groups.confirmed} schedule={props.schedule} timeZone={props.timeZone} now={props.now} />
      <Group title="Termin nije potvrđen" fixtures={groups.unconfirmed} schedule={props.schedule} timeZone={props.timeZone} now={props.now} />
      <Group title="Odloženo ili otkazano" fixtures={groups.disrupted} schedule={props.schedule} timeZone={props.timeZone} now={props.now} />
      <div className="note" data-draft-dirty={props.draftNote.trim().length > 0 ? 'true' : 'false'}>
        <label htmlFor="draft-note">Beleška uz događaj</label>
        <textarea
          id="draft-note"
          value={props.draftNote}
          onChange={(event) => props.onDraft(event.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Unos ostaje u ovoj sesiji"
        />
        <p className="meta">Beleška nije na serveru. Odjava lokalne sesije je briše. Dok unos traje, nova verzija se ne učitava sama.</p>
      </div>
    </section>
  );
}

function Group(props: {
  title: string;
  fixtures: readonly import('../../../../packages/domain/src/types.ts').Fixture[];
  schedule: DemoSchedule | null;
  timeZone: string;
  now: number;
}) {
  if (!props.schedule || props.fixtures.length === 0) return null;
  return (
    <>
      <h2>{props.title}</h2>
      {props.fixtures.map((fixture) => (
        <FixtureCard
          key={fixture.id}
          fixture={fixture}
          schedule={props.schedule as DemoSchedule}
          timeZone={props.timeZone}
          now={props.now}
          followed
        />
      ))}
    </>
  );
}

export function ClubsScreen(props: {
  followed: readonly string[];
  onToggle: (teamId: string) => void;
}) {
  const [sport, setSport] = useState<Sport>('football');
  const [query, setQuery] = useState('');
  const choices = clubChoices(sport, query);
  return (
    <section>
      <h1>Klubovi</h1>
      <p className="lead">U prvoj verziji možeš pratiti samo četiri kluba. Protivnici iz DEMO utakmica nisu u ovom spisku.</p>
      <div className="filters" role="group" aria-label="Sport">
        <FilterButton pressed={sport === 'football'} onClick={() => setSport('football')}>Fudbal</FilterButton>
        <FilterButton pressed={sport === 'basketball'} onClick={() => setSport('basketball')}>Košarka</FilterButton>
      </div>
      <label htmlFor="club-search">Pretraga kluba</label>
      <input
        id="club-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        autoComplete="off"
        placeholder="Zvezda, Partizan"
      />
      {choices.length === 0 ? <p>Nema kluba za ovu pretragu. Katalog ima samo Crvenu zvezdu i Partizan.</p> : null}
      <ul className="club-list">
        {choices.map((team) => {
          const active = props.followed.includes(team.id);
          return (
            <li key={team.id}>
              <div>
                <strong>{team.name}</strong>
                <p className="meta">{sportLabel(team.sport)} · {team.city}</p>
              </div>
              <button type="button" aria-pressed={active} onClick={() => props.onToggle(team.id)}>
                {active ? 'Pratim u aplikaciji' : 'Prati'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SettingsScreen(props: {
  prefs: DevicePrefs;
  onPrefs: (prefs: DevicePrefs) => void;
  onClear: () => void;
  account?: ReactNode;
  install: {
    standalone: boolean;
    ios: boolean;
    canPrompt: boolean;
    onInstall: () => void;
  };
}) {
  const zones = ['Europe/Belgrade', 'Europe/Zagreb', 'Europe/London', 'UTC'];
  // Zona uređaja van skraćene liste čuva se kao izabrana opcija.
  const deviceZones = zones.includes(props.prefs.timeZone) ? zones : [props.prefs.timeZone, ...zones];
  return (
    <section>
      <h1>Podešavanja</h1>
      <h2>Instalacija</h2>
      {props.install.standalone ? <p data-standalone="true">Aplikacija je otvorena u samostalnom prozoru.</p> : null}
      {props.install.canPrompt ? (
        <button type="button" data-install="prompt" onClick={props.install.onInstall}>Instaliraj</button>
      ) : null}
      {!props.install.standalone && !props.install.canPrompt ? (
        <p>Ovaj pregledač još nije ponudio instalaciju. Na računaru je to stavka u meniju pregledača, kada su manifest i service worker spremni.</p>
      ) : null}
      <div className={props.install.ios ? 'callout' : undefined} data-ios-install={props.install.ios ? 'true' : 'false'}>
        <h3>iPhone i iPad</h3>
        <p>Otvori stranicu u Safari-ju, izaberi deljenje, pa Dodaj na početni ekran. MatchAhead ne može sam da doda ikonu. Dozvola za obaveštenja traži se tek iz tako dodate aplikacije, i to nije provereno.</p>
      </div>
      <h2>Obaveštenja</h2>
      <p>Push dok je aplikacija zatvorena nije proveren. Faza 02 je BLOCKED. Ova faza ne traži dozvolu i ne registruje drugi service worker.</p>
      <fieldset>
        <legend>Predloženi podsetnik</legend>
        <p className="meta">Slanje nije uključeno. Izbor ostaje na ovom uređaju.</p>
        {([15, 30, 60, 0] as const).map((minutes) => (
          <label key={minutes} className="choice">
            <input
              type="radio"
              name="reminder"
              checked={props.prefs.reminderMinutes === minutes}
              onChange={() => props.onPrefs({ ...props.prefs, reminderMinutes: minutes })}
            />
            {minutes === 0 ? 'Isključeno' : `${minutes} minuta`}
          </label>
        ))}
      </fieldset>
      <label htmlFor="zone">Vremenska zona</label>
      <select
        id="zone"
        value={props.prefs.timeZone}
        onChange={(event) => props.onPrefs({ ...props.prefs, timeZone: event.target.value })}
      >
        {deviceZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      {props.account ?? (
        <>
          <h2>Nalog</h2>
          <p>Google prijava nije deo ove faze. Lični unos ove sesije nije nalog i ne čuva se trajno po korisniku dok prijava ne postoji.</p>
        </>
      )}
      <h2>Lokalna sesija</h2>
      <p>Lokalna praćenja i ručni DEMO izbori ostaju samo u ovoj sesiji i jasno su lokalni.</p>
      <button type="button" onClick={props.onClear}>Obriši lokalni sadržaj ove sesije</button>
      <p className="meta" data-app-build={APP_BUILD}>Izdanje {APP_BUILD}. Zona prikaza: {props.prefs.timeZone}.</p>
    </section>
  );
}

export function Freshness(props: {
  schedule: DemoSchedule | null;
  now: number;
  timeZone: string;
  online: boolean;
}) {
  if (!props.schedule) return null;
  const stale = isScheduleStale(props.schedule.fetchedAt, props.now, props.schedule.staleAfterHours);
  return (
    <div className="freshness" data-stale={stale ? 'true' : 'false'} data-offline={props.online ? 'false' : 'true'}>
      <p>
        Poslednje osvežavanje:{' '}
        <time dateTime={props.schedule.fetchedAt}>{formatFetchedAt(props.schedule.fetchedAt, props.timeZone)}</time>
        .
      </p>
      {stale ? <p>Podaci su zastareli. Prag je {props.schedule.staleAfterHours} časova od poslednjeg zapisa u fajlu.</p> : <p>Zapis u fajlu je unutar praga od {props.schedule.staleAfterHours} časova. I dalje je sintetički DEMO.</p>}
      <p>{props.online ? 'Na mreži. Ovo nije svež sportski izvor.' : 'Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.'}</p>
      <p>{props.schedule.warning}</p>
    </div>
  );
}

function FilterButton(props: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={props.pressed} onClick={props.onClick}>{props.children}</button>
  );
}

export function installFlags(): { standalone: boolean; ios: boolean } {
  const standalone = isStandaloneDisplay(
    window.matchMedia('(display-mode: standalone)').matches,
    window.navigator.standalone === true,
  );
  return {
    standalone,
    ios: needsIosInstallHelp(window.navigator.userAgent, standalone),
  };
}

export function screenHeading(route: RouteId): string {
  if (route === 'home') return 'Početna';
  if (route === 'mine') return 'Moje utakmice';
  if (route === 'clubs') return 'Klubovi';
  return 'Podešavanja';
}
