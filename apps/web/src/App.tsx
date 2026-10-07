import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { timeZoneForDisplay } from '../../../packages/domain/src/user-account.ts';
import { APP_BUILD } from './build.ts';
import { AccountController } from './logic/account-controller.ts';
import { ensureInstallationId } from './logic/firebase-app.ts';
import { NAV_TABS, parseRoute, tabForRoute, tabHash, tabLabel, type RouteId } from './logic/routes.ts';
import { currentScheduleIdToken } from './logic/schedule-auth.ts';
import { readScheduleServerConfig } from './logic/schedule-config.ts';
import { applyDocumentTheme, rememberThemePreference, type ThemePreference } from './logic/theme.ts';
import { useScheduleFinder } from './ui/ScheduleFinder.tsx';
import { useAccount } from './logic/use-account.ts';
import {
  browserStore,
  clearUserLocalContent,
  memoryStore,
  readDevicePrefs,
  readDraftNote,
  writeDevicePrefs,
  writeDraftNote,
  type DevicePrefs,
  type KeyValueStore,
} from './logic/user-local.ts';
import { applyReadyUpdate, composingFromDocument, getUpdateSnapshot, registerProductServiceWorker, setUpdateBlocker, subscribeUpdate } from './pwa/register-sw.ts';
import { LoginPrompt, type AccountPrefsInput } from './ui/AccountPanel.tsx';
import { PersonalAgenda } from './ui/PersonalAgenda.tsx';
import { ClubsScreen, installFlags, SettingsScreen } from './ui/screens.tsx';

export function App() {
  const route = useHashRoute();
  const tab = tabForRoute(route);
  useTabScroll(tab);
  const update = useSyncExternalStore(subscribeUpdate, getUpdateSnapshot, getUpdateSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => readDevicePrefs(openStore('local')));
  const [draftNote, setDraftNote] = useState(() => readDraftNote(openStore('session')));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState(installFlags);

  const controller = useMemo(() => new AccountController(), []);
  const installationId = useMemo(() => ensureInstallationId(openStore('local')), []);
  const scheduleStore = useMemo(() => openStore('local'), []);
  const scheduleServer = useMemo(() => {
    const env = import.meta.env as unknown as { VITE_SCHEDULE_API_URL?: string };
    return readScheduleServerConfig({ VITE_SCHEDULE_API_URL: env.VITE_SCHEDULE_API_URL });
  }, []);
  const { setup, account, signIn, signOut, deleteAccount } = useAccount({
    controller,
    fallbackTimeZone: prefs.timeZone,
    installationId,
    onLocalClear: (uid) => {
      clearUserLocalContent(openStore('local'), openStore('session'), uid);
      setDraftNote('');
    },
  });
  const unlocked = account.status === 'signed-in';
  const finder = useScheduleFinder({
    apiBase: unlocked && scheduleServer.kind === 'ready' ? scheduleServer.baseUrl : null,
    getIdToken: currentScheduleIdToken,
    store: scheduleStore,
    now,
    online,
  });

  const followed = unlocked ? account.followedTeamIds : [];
  const manualFixtureIds = unlocked ? account.manualFixtureIds : [];
  const displayTimeZone = unlocked && account.profile
    ? timeZoneForDisplay(account.profile.timeZone)
    : prefs.timeZone;
  const accountIdentity = `${account.status}:${account.uid ?? ''}`;
  useEffect(() => {
    finder.abortPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdentity]);
  const serverSnapshots = finder.snapshots;

  useEffect(() => {
    setUpdateBlocker(() => composingFromDocument(document));
    if (!import.meta.env.PROD) return;
    const registration = registerProductServiceWorker(import.meta.env.BASE_URL);
    return () => {
      void registration;
    };
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const timer = window.setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstallMode(installFlags());
    };
    const media = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstallMode(installFlags());
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onMode);
    };
  }, []);

  function changeTheme(theme: ThemePreference) {
    rememberThemePreference(theme);
    const next = { ...prefs, theme };
    writeDevicePrefs(openStore('local'), next);
    setPrefs(next);
    let systemDark = false;
    try {
      systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      systemDark = false;
    }
    applyDocumentTheme(document, theme, systemDark);
  }

  function changePrefs(next: DevicePrefs) {
    writeDevicePrefs(openStore('local'), next);
    setPrefs(next);
  }

  function changeDraft(value: string) {
    writeDraftNote(openStore('session'), value);
    setDraftNote(value);
  }

  function clearSession() {
    clearUserLocalContent(openStore('local'), openStore('session'), null);
    setDraftNote('');
  }

  function saveAccount(next: AccountPrefsInput) {
    void controller.savePrefs(next);
  }

  const install = {
    standalone: installMode.standalone,
    ios: installMode.ios,
    canPrompt: installEvent !== null && !installMode.standalone,
    onInstall: () => {
      void installEvent?.prompt().then(() => setInstallEvent(null));
    },
  };

  return (
    <div className="app" data-app-build={APP_BUILD}>
      <a
        className="skip"
        href="#sadrzaj"
        onClick={(event) => {
          // Href ostaje rezervni skok bez JS. Podrazumevani klik bi #sadrzaj pretvorio u početnu rutu.
          event.preventDefault();
          const main = document.getElementById('sadrzaj');
          if (!(main instanceof HTMLElement)) return;
          main.focus();
          main.scrollIntoView();
        }}
      >Preskoči na sadržaj</a>
      {unlocked ? (
        <header className="top">
          <p className="brand">MatchAhead</p>
        </header>
      ) : null}
      {update.ready ? (
        <div className="update" role="status" data-update-ready="true">
          <p>Nova verzija je spremna.</p>
          {update.blockedMessage ? <p>{update.blockedMessage}</p> : null}
          <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyReadyUpdate()}>
            Učitaj novu verziju
          </button>
        </div>
      ) : null}
      <main
        id="sadrzaj"
        data-screen={unlocked ? route : 'gate'}
        data-tab={unlocked ? tab : 'gate'}
        data-standalone={installMode.standalone ? 'true' : 'false'}
        data-ios-install={installMode.ios ? 'true' : 'false'}
        tabIndex={-1}
      >
        {unlocked ? null : (
          <section className="login-gate">
            <h1>MatchAhead</h1>
            <p>Prati klubove i dodaj utakmice u Google kalendar.</p>
            <LoginPrompt
              setup={setup}
              account={account}
              onSignIn={signIn}
              theme={prefs.theme}
              onTheme={changeTheme}
            />
          </section>
        )}
        {unlocked ? (
          <>
            <div hidden={tab !== 'matches'}>
              <PersonalAgenda
                active={tab === 'matches'}
                now={now}
                timeZone={displayTimeZone}
                online={online}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={(fixtureId) => {
                  void controller.toggleManual(fixtureId);
                }}
                draftNote={draftNote}
                onDraft={changeDraft}
                serverSnapshots={serverSnapshots}
                accountIdentity={accountIdentity}
              />
            </div>
            <div hidden={tab !== 'clubs'}>
              <ClubsScreen
                active={tab === 'clubs'}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggle={(teamId) => {
                  void controller.toggleFollow(teamId);
                }}
                onToggleManual={(fixtureId) => {
                  void controller.toggleManual(fixtureId);
                }}
                finder={finder}
                timeZone={displayTimeZone}
                now={now}
                online={online}
              />
            </div>
            <div hidden={tab !== 'settings'}>
              <SettingsScreen
                active={tab === 'settings'}
                prefs={prefs}
                onPrefs={changePrefs}
                onTheme={changeTheme}
                onClear={clearSession}
                account={account}
                onSignOut={signOut}
                onSaveAccount={saveAccount}
                onDeleteAccount={deleteAccount}
                install={install}
              />
            </div>
          </>
        ) : null}
      </main>
      {unlocked ? (
        <nav className="nav" aria-label="Glavna navigacija">
          {NAV_TABS.map((item) => (
            <a key={item} href={tabHash(item)} aria-current={item === tab ? 'page' : undefined}>{tabLabel(item)}</a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function openStore(area: 'local' | 'session'): KeyValueStore {
  try {
    return browserStore(area === 'local' ? localStorage : sessionStorage);
  } catch {
    return memoryStore();
  }
}

function useHashRoute(): RouteId {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return parseRoute(hash);
}

/** Pamti skrol pre promene hasha da sakriveni tab ne pregazi sačuvano mesto. */
function useTabScroll(tab: string) {
  const positions = useRef<Record<string, number>>({});
  const tabRef = useRef(tab);
  const ignore = useRef(false);
  useEffect(() => {
    const onHash = () => {
      const scroller = document.scrollingElement;
      if (scroller) positions.current[tabRef.current] = scroller.scrollTop;
      ignore.current = true;
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const scroller = document.scrollingElement;
    if (!scroller) return;
    const onScroll = () => {
      if (ignore.current) return;
      positions.current[tabRef.current] = scroller.scrollTop;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const scroller = document.scrollingElement;
    if (!scroller) return;
    tabRef.current = tab;
    scroller.scrollTop = positions.current[tab] ?? 0;
    ignore.current = false;
  }, [tab]);
}
