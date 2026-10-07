import { useEffect, useState } from 'react';

import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';
import type { Sport, Team } from '../../../../packages/domain/src/types.ts';
import { APP_BUILD } from '../build.ts';
import { sportLabel } from '../logic/clubs.ts';
import { isStandaloneDisplay, needsIosInstallHelp } from '../logic/install.ts';
import type { ThemePreference } from '../logic/theme.ts';
import type { DevicePrefs } from '../logic/user-local.ts';
import { AccountPanel, TimeZonePicker, type AccountPrefsInput } from './AccountPanel.tsx';
import type { AccountSnapshot } from '../logic/account-controller.ts';
import { ModalPanel } from './ModalPanel.tsx';
import { ScheduleFinder, type ScheduleFinderState } from './ScheduleFinder.tsx';
import { ThemePicker } from './ThemePicker.tsx';

type SettingsPane = 'appearance' | 'timezone' | 'notifications' | 'account' | 'install' | 'about';

const SETTINGS: readonly { id: SettingsPane; label: string }[] = [
  { id: 'appearance', label: 'Izgled' },
  { id: 'timezone', label: 'Vremenska zona' },
  { id: 'notifications', label: 'Obaveštenja' },
  { id: 'account', label: 'Nalog' },
  { id: 'install', label: 'Instalacija i pomoć' },
  { id: 'about', label: 'O aplikaciji' },
];

export function ClubsScreen(props: {
  active: boolean;
  followed: readonly string[];
  manualFixtureIds: readonly string[];
  onToggle: (teamId: string) => void;
  onToggleManual: (fixtureId: string) => void;
  finder: ScheduleFinderState;
  timeZone: string;
  now: number;
  online: boolean;
}) {
  const teams = selectableTeams();
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!props.active) setOpenId(null);
  }, [props.active]);
  const openTeam = teams.find((team) => team.id === openId) ?? null;
  const groups: { sport: Sport; title: string }[] = [
    { sport: 'football', title: 'Fudbal' },
    { sport: 'basketball', title: 'Košarka' },
  ];
  return (
    <section>
      <h1>Klubovi</h1>
      {groups.map((group) => (
        <section key={group.sport} aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul className="club-list">
            {teams.filter((team) => team.sport === group.sport).map((team) => (
              <ClubRow
                key={team.id}
                team={team}
                followed={props.followed.includes(team.id)}
                onToggle={() => props.onToggle(team.id)}
                onOpen={() => {
                  props.finder.focusTeam(team.sport, team.id);
                  setOpenId(team.id);
                }}
              />
            ))}
          </ul>
        </section>
      ))}
      {props.active && openTeam ? (
        <ModalPanel title={openTeam.name} onClose={() => setOpenId(null)}>
          <ScheduleFinder
            state={props.finder}
            timeZone={props.timeZone}
            now={props.now}
            online={props.online}
            teamId={openTeam.id}
            followed={props.followed}
            manualFixtureIds={props.manualFixtureIds}
            onToggleManual={props.onToggleManual}
          />
        </ModalPanel>
      ) : null}
    </section>
  );
}

function ClubRow(props: { team: Team; followed: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className="club-row" data-team-id={props.team.id}>
      <div>
        <strong>{props.team.name}</strong>
        <p className="meta">{sportLabel(props.team.sport)} · {props.team.city}</p>
      </div>
      <button type="button" aria-pressed={props.followed} onClick={props.onToggle}>
        {props.followed ? 'Pratim' : 'Prati'}
      </button>
      <button type="button" className="club-open" onClick={props.onOpen}>Raspored</button>
    </li>
  );
}

export function SettingsScreen(props: {
  active: boolean;
  prefs: DevicePrefs;
  onPrefs: (prefs: DevicePrefs) => void;
  onTheme: (theme: ThemePreference) => void;
  onClear: () => void;
  account: AccountSnapshot;
  onSignOut: () => void;
  onSaveAccount: (prefs: AccountPrefsInput) => void;
  onDeleteAccount: () => void;
  install: {
    standalone: boolean;
    ios: boolean;
    canPrompt: boolean;
    onInstall: () => void;
  };
}) {
  const [pane, setPane] = useState<SettingsPane | null>(null);
  useEffect(() => {
    if (!props.active) setPane(null);
  }, [props.active]);
  const current = SETTINGS.find((item) => item.id === pane) ?? null;
  return (
    <section>
      <h1>Podešavanja</h1>
      <ul className="settings-list">
        {SETTINGS.map((item) => (
          <li key={item.id}>
            <button type="button" className="settings-row" onClick={() => setPane(item.id)}>
              <span>{item.label}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {props.active && current ? (
        <ModalPanel title={current.label} onClose={() => setPane(null)}>
          <SettingsBody pane={current.id} {...props} />
        </ModalPanel>
      ) : null}
    </section>
  );
}

function SettingsBody(props: {
  pane: SettingsPane;
  prefs: DevicePrefs;
  onTheme: (theme: ThemePreference) => void;
  onPrefs: (prefs: DevicePrefs) => void;
  onClear: () => void;
  account: AccountSnapshot;
  onSignOut: () => void;
  onSaveAccount: (prefs: AccountPrefsInput) => void;
  onDeleteAccount: () => void;
  install: {
    standalone: boolean;
    ios: boolean;
    canPrompt: boolean;
    onInstall: () => void;
  };
}) {
  if (props.pane === 'appearance') {
    return <ThemePicker value={props.prefs.theme} onChange={props.onTheme} />;
  }
  if (props.pane === 'timezone') {
    return (
      <TimeZonePicker
        account={props.account}
        deviceTimeZone={props.prefs.timeZone}
        onSaveAccount={props.onSaveAccount}
        onSaveDevice={(timeZone) => props.onPrefs({ ...props.prefs, timeZone })}
      />
    );
  }
  if (props.pane === 'notifications') {
    return <p>Još nisu dostupna.</p>;
  }
  if (props.pane === 'account') {
    return (
      <AccountPanel
        account={props.account}
        onSignOut={props.onSignOut}
        onDeleteAccount={props.onDeleteAccount}
      />
    );
  }
  if (props.pane === 'install') return <InstallHelp install={props.install} />;
  return (
    <>
      <p data-app-build={APP_BUILD}>Izdanje {APP_BUILD}.</p>
      <button type="button" onClick={props.onClear}>Obriši lokalnu belešku</button>
    </>
  );
}

function InstallHelp(props: {
  install: {
    standalone: boolean;
    ios: boolean;
    canPrompt: boolean;
    onInstall: () => void;
  };
}) {
  return (
    <div data-ios-install={props.install.ios ? 'true' : 'false'} data-standalone={props.install.standalone ? 'true' : 'false'}>
      {props.install.standalone ? <p>Aplikacija je instalirana.</p> : null}
      {props.install.canPrompt ? (
        <button type="button" className="primary" data-install="prompt" onClick={props.install.onInstall}>Instaliraj</button>
      ) : null}
      {props.install.ios && !props.install.standalone ? (
        <p>U Safari-ju izaberi deljenje, pa Dodaj na početni ekran.</p>
      ) : null}
      {!props.install.standalone && !props.install.canPrompt && !props.install.ios ? (
        <p>Instalacija se nudi iz menija pregledača.</p>
      ) : null}
    </div>
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
