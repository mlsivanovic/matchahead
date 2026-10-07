import { useState, type ReactNode } from 'react';

import type { Sport } from '../../../../packages/domain/src/types.ts';
import { APP_BUILD } from '../build.ts';
import { clubChoices, sportLabel } from '../logic/clubs.ts';
import { isStandaloneDisplay, needsIosInstallHelp } from '../logic/install.ts';
import type { DevicePrefs } from '../logic/user-local.ts';

export function ClubsScreen(props: {
  followed: readonly string[];
  onToggle: (teamId: string) => void;
  finder?: ReactNode;
}) {
  const [sport, setSport] = useState<Sport>('football');
  const [query, setQuery] = useState('');
  const choices = clubChoices(sport, query);
  return (
    <section>
      <h1>Klubovi</h1>
      <p className="lead">U prvoj verziji možeš pratiti samo četiri kluba. Protivnici iz utakmica nisu u ovom spisku.</p>
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
      {props.finder ?? null}
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
      <p>Lokalna beleška ostaje u ovoj sesiji i briše se sa ovog uređaja. Nije nalog.</p>
      <button type="button" onClick={props.onClear}>Obriši lokalni sadržaj ove sesije</button>
      <p className="meta" data-app-build={APP_BUILD}>Izdanje {APP_BUILD}. Zona prikaza: {props.prefs.timeZone}.</p>
    </section>
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
