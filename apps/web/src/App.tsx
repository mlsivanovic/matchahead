import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { timeZoneForDisplay } from '../../../packages/domain/src/user-account.ts';
import { APP_BUILD } from './build.ts';
import { AccountController } from './logic/account-controller.ts';
import { ensureInstallationId } from './logic/firebase-app.ts';
import { routeHash, routeNavLabel, parseRoute, type RouteId } from './logic/routes.ts';
import { currentScheduleIdToken } from './logic/schedule-auth.ts';
import { readScheduleServerConfig } from './logic/schedule-config.ts';
import { parseDemoSchedule, type DemoSchedule } from './logic/schedule.ts';
import { ScheduleFinder, useScheduleFinder } from './ui/ScheduleFinder.tsx';
import { useAccount } from './logic/use-account.ts';
import {
  browserStore,
  clearUserLocalContent,
  readDevicePrefs,
  readDraftNote,
  readFollowedTeamIds,
  readManualFixtureIds,
  writeDevicePrefs,
  writeDraftNote,
  writeFollowedTeamIds,
  writeManualFixtureIds,
  type DevicePrefs,
} from './logic/user-local.ts';
import { applyReadyUpdate, composingFromDocument, getUpdateSnapshot, registerProductServiceWorker, setUpdateBlocker, subscribeUpdate } from './pwa/register-sw.ts';
import { AccountPanel } from './ui/AccountPanel.tsx';
import { PersonalAgendaHome, PersonalAgendaScreen } from './ui/PersonalAgenda.tsx';
import { ClubsScreen, installFlags, SettingsScreen } from './ui/screens.tsx';

const NAV: RouteId[] = ['home', 'mine', 'clubs', 'settings'];

export function App() {
  const route = useHashRoute();
  const update = useSyncExternalStore(subscribeUpdate, getUpdateSnapshot, getUpdateSnapshot);
  const [schedule, setSchedule] = useState<DemoSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => readDevicePrefs(browserStore(localStorage)));
  const [localFollowed, setLocalFollowed] = useState<string[]>(() => readFollowedTeamIds(browserStore(sessionStorage)));
  const [localManuals, setLocalManuals] = useState<string[]>(() => readManualFixtureIds(browserStore(sessionStorage)));
  const [draftNote, setDraftNote] = useState(() => readDraftNote(browserStore(sessionStorage)));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState(installFlags);

  const controller = useMemo(() => new AccountController(), []);
  const installationId = useMemo(() => ensureInstallationId(browserStore(localStorage)), []);
  // Faza 05: trajno poslednje dobro stanje je na uređaju (localStorage),
  // javni podaci koji preživljavaju zamenu naloga. Nema periodičnog poziva.
  const scheduleStore = useMemo(() => browserStore(localStorage), []);
  const scheduleServer = useMemo(() => {
    const env = import.meta.env as unknown as { VITE_SCHEDULE_API_URL?: string };
    return readScheduleServerConfig({ VITE_SCHEDULE_API_URL: env.VITE_SCHEDULE_API_URL });
  }, []);
  const finder = useScheduleFinder({
    apiBase: scheduleServer.kind === 'ready' ? scheduleServer.baseUrl : null,
    getIdToken: currentScheduleIdToken,
    store: scheduleStore,
    now,
    online,
  });
  const { setup, account, signIn, signOut, deleteAccount } = useAccount({
    controller,
    fallbackTimeZone: prefs.timeZone,
    installationId,
    onLocalClear: (uid) => {
      clearUserLocalContent(browserStore(localStorage), browserStore(sessionStorage), uid);
      setLocalFollowed([]);
      setLocalManuals([]);
      setDraftNote('');
    },
  });

  const signedIn = account.status === 'signed-in';
  // Agenda prima samo aktivna praćenja i ručne izbore; omiljeni klubovi nikad ne ulaze u utakmice.
  const followed = signedIn ? account.followedTeamIds : localFollowed;
  const manualFixtureIds = signedIn ? account.manualFixtureIds : localManuals;
  // Zona profila je overlay prikaza i ne upisuje se u globalna podešavanja uređaja.
  const displayTimeZone = signedIn && account.profile
    ? timeZoneForDisplay(account.profile.timeZone)
    : prefs.timeZone;
  // Zamena naloga prekida tekući autentifikovani zahtev: prekinuto se
  // nikad ne upisuje. Javni snimci na uređaju ostaju (nisu podaci naloga),
  // a agenda i dalje čita samo praćenja/ručne izbore tekućeg naloga.
  const accountIdentity = `${account.status}:${account.uid ?? ''}`;
  useEffect(() => {
    finder.abortPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdentity]);
  // Agendu grade samo provereni snimci: blokada i DEMO se u njoj ne
  // prikazuju kao pouzdane utakmice (DEMO ionako nije u trajnom stanju).
  const verifiedSnapshots = useMemo(
    () => finder.snapshots.filter((snapshot) => snapshot.kind === 'verified-schedule'),
    [finder.snapshots],
  );

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
    if (signedIn) {
      void controller.toggleFollow(teamId);
      return;
    }
    // Funkcionalna dopuna: brzi uzastopni klikovi (dvoklik) ne smeju da se
    // pregaze zastarelim zatvaranjem — svaki klik dopunjuje prethodni.
    setLocalFollowed((previous) => {
      const next = previous.includes(teamId) ? previous.filter((id) => id !== teamId) : [...previous, teamId];
      writeFollowedTeamIds(browserStore(sessionStorage), next);
      return readFollowedTeamIds(browserStore(sessionStorage));
    });
  }

  function toggleManual(fixtureId: string) {
    if (signedIn) {
      void controller.toggleManual(fixtureId);
      return;
    }
    setLocalManuals((previous) => {
      const next = previous.includes(fixtureId)
        ? previous.filter((id) => id !== fixtureId)
        : [...previous, fixtureId];
      writeManualFixtureIds(browserStore(sessionStorage), next);
      return readManualFixtureIds(browserStore(sessionStorage));
    });
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
    setLocalFollowed([]);
    setLocalManuals([]);
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
          <PersonalAgendaHome
            schedule={schedule}
            error={error}
            now={now}
            timeZone={displayTimeZone}
            online={online}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={toggleManual}
            serverSnapshots={verifiedSnapshots}
          />
        ) : null}
        {route === 'mine' ? (
          <PersonalAgendaScreen
            schedule={schedule}
            now={now}
            timeZone={displayTimeZone}
            online={online}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={toggleManual}
            draftNote={draftNote}
            onDraft={changeDraft}
            serverSnapshots={verifiedSnapshots}
          />
        ) : null}
        {route === 'clubs' ? (
          <ClubsScreen
            followed={followed}
            onToggle={toggleFollow}
            finder={(
              <ScheduleFinder
                state={finder}
                timeZone={displayTimeZone}
                followed={followed}
                manualFixtureIds={manualFixtureIds}
                onToggleManual={toggleManual}
              />
            )}
          />
        ) : null}
        {route === 'settings' ? (
          <SettingsScreen
            prefs={prefs}
            onPrefs={changePrefs}
            onClear={clearSession}
            account={(
              <AccountPanel
                setup={setup}
                account={account}
                onSignIn={signIn}
                onSignOut={signOut}
                onToggleFavorite={(teamId) => {
                  void controller.toggleFavorite(teamId);
                }}
                onSavePrefs={(next) => {
                  void controller.savePrefs(next);
                }}
                onDeleteAccount={deleteAccount}
              />
            )}
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
