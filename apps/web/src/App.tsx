import { useEffect, useState, useSyncExternalStore } from 'react';

import { APP_BUILD } from './build.ts';
import { routeHash, routeNavLabel, parseRoute, type RouteId } from './logic/routes.ts';
import { parseDemoSchedule, type DemoSchedule } from './logic/schedule.ts';
import {
  browserStore,
  clearUserLocalContent,
  readDevicePrefs,
  readDraftNote,
  readFollowedTeamIds,
  writeDevicePrefs,
  writeDraftNote,
  writeFollowedTeamIds,
  type DevicePrefs,
} from './logic/user-local.ts';
import { applyReadyUpdate, composingFromDocument, getUpdateSnapshot, registerProductServiceWorker, setUpdateBlocker, subscribeUpdate } from './pwa/register-sw.ts';
import { ClubsScreen, HomeScreen, installFlags, MineScreen, SettingsScreen } from './ui/screens.tsx';

const NAV: RouteId[] = ['home', 'mine', 'clubs', 'settings'];

export function App() {
  const route = useHashRoute();
  const update = useSyncExternalStore(subscribeUpdate, getUpdateSnapshot, getUpdateSnapshot);
  const [schedule, setSchedule] = useState<DemoSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => readDevicePrefs(browserStore(localStorage)));
  const [followed, setFollowed] = useState<string[]>(() => readFollowedTeamIds(browserStore(sessionStorage)));
  const [draftNote, setDraftNote] = useState(() => readDraftNote(browserStore(sessionStorage)));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState(installFlags);

  useEffect(() => {
    setUpdateBlocker(() => composingFromDocument(document));
    const registration = registerProductServiceWorker(import.meta.env.BASE_URL);
    return () => {
      void registration;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = `${import.meta.env.BASE_URL}data/demo-schedule.json`;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error('DEMO raspored nije sačuvan na ovom uređaju. Otvori aplikaciju jednom dok si na mreži.');
        return parseDemoSchedule(await response.json());
      })
      .then((next) => {
        if (!cancelled) setSchedule(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'DEMO raspored nije učitan.');
      });
    return () => {
      cancelled = true;
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

  function toggleFollow(teamId: string) {
    const next = followed.includes(teamId) ? followed.filter((id) => id !== teamId) : [...followed, teamId];
    writeFollowedTeamIds(browserStore(sessionStorage), next);
    setFollowed(readFollowedTeamIds(browserStore(sessionStorage)));
  }

  function changeDraft(value: string) {
    writeDraftNote(browserStore(sessionStorage), value);
    setDraftNote(value);
  }

  function changePrefs(next: DevicePrefs) {
    writeDevicePrefs(browserStore(localStorage), next);
    setPrefs(next);
  }

  function clearSession() {
    clearUserLocalContent(browserStore(localStorage), browserStore(sessionStorage), null);
    setFollowed([]);
    setDraftNote('');
  }

  return (
    <div className="app">
      <a className="skip" href="#sadrzaj">Preskoči na sadržaj</a>
      <header className="top">
        <p className="brand">MatchAhead <span className="demo">DEMO</span></p>
        <p className="meta" data-app-build={APP_BUILD}>Sintetički raspored</p>
      </header>
      {update.ready ? (
        <div className="update" role="status" data-update-ready="true">
          <p>Nova verzija je spremna.</p>
          {update.blockedMessage ? <p>{update.blockedMessage}</p> : null}
          <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyReadyUpdate()}>
            Učitaj novu verziju
          </button>
        </div>
      ) : null}
      <main id="sadrzaj" data-screen={route} tabIndex={-1}>
        {route === 'home' ? (
          <HomeScreen schedule={schedule} error={error} now={now} timeZone={prefs.timeZone} online={online} followed={followed} />
        ) : null}
        {route === 'mine' ? (
          <MineScreen
            schedule={schedule}
            timeZone={prefs.timeZone}
            now={now}
            followed={followed}
            draftNote={draftNote}
            onDraft={changeDraft}
          />
        ) : null}
        {route === 'clubs' ? <ClubsScreen followed={followed} onToggle={toggleFollow} /> : null}
        {route === 'settings' ? (
          <SettingsScreen
            prefs={prefs}
            onPrefs={changePrefs}
            onClear={clearSession}
            install={{
              standalone: installMode.standalone,
              ios: installMode.ios,
              canPrompt: installEvent !== null && !installMode.standalone,
              onInstall: () => {
                void installEvent?.prompt().then(() => setInstallEvent(null));
              },
            }}
          />
        ) : null}
      </main>
      <nav className="nav" aria-label="Glavna navigacija">
        {NAV.map((item) => (
          <a key={item} href={routeHash(item)} aria-current={item === route ? 'page' : undefined}>{routeNavLabel(item)}</a>
        ))}
      </nav>
    </div>
  );
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

