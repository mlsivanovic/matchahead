import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { timeZoneForDisplay } from '../../../packages/domain/src/user-account.ts';
import { APP_BUILD } from './build.ts';
import { AccountController } from './logic/account-controller.ts';
import { ensureInstallationId } from './logic/firebase-app.ts';
import { routeHash, routeNavLabel, parseRoute, type RouteId } from './logic/routes.ts';
import { currentScheduleIdToken } from './logic/schedule-auth.ts';
import { readScheduleServerConfig } from './logic/schedule-config.ts';
import { ScheduleFinder, useScheduleFinder } from './ui/ScheduleFinder.tsx';
import { useAccount } from './logic/use-account.ts';
import {
  browserStore,
  clearUserLocalContent,
  readDevicePrefs,
  readDraftNote,
  writeDevicePrefs,
  writeDraftNote,
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
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => readDevicePrefs(browserStore(localStorage)));
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
  const { setup, account, signIn, signOut, deleteAccount } = useAccount({
    controller,
    fallbackTimeZone: prefs.timeZone,
    installationId,
    onLocalClear: (uid) => {
      clearUserLocalContent(browserStore(localStorage), browserStore(sessionStorage), uid);
      setDraftNote('');
    },
  });
  // Kapija ostaje dok profil nije otvoren. Dok traje prijava nema
  // zahteva za raspored: apiBase je null, a finder se ne crta.
  const unlocked = account.status === 'signed-in';
  const finder = useScheduleFinder({
    apiBase: unlocked && scheduleServer.kind === 'ready' ? scheduleServer.baseUrl : null,
    getIdToken: currentScheduleIdToken,
    store: scheduleStore,
    now,
    online,
  });

  // Agenda prima samo aktivna praćenja i ručne izbore; omiljeni klubovi nikad ne ulaze u utakmice.
  const followed = unlocked ? account.followedTeamIds : [];
  const manualFixtureIds = unlocked ? account.manualFixtureIds : [];
  // Zona profila je overlay prikaza i ne upisuje se u globalna podešavanja uređaja.
  const displayTimeZone = unlocked && account.profile
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
  // Graditelj agende bira samo proverene utakmice, ali prima i blokirane
  // snimke radi politike opoziva i jasnog praznog stanja posle blokade.
  const serverSnapshots = finder.snapshots;
  const verifiedSchedule = serverSnapshots.some((snapshot) => snapshot.kind === 'verified-schedule');

  useEffect(() => {
    setUpdateBlocker(() => composingFromDocument(document));
    // Dev server nema izgrađen sw.js. Registracija na /matchahead/sw.js
    // tada dobija HTML i baci MIME grešku. Produkcija i dalje registruje.
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

  function toggleFollow(teamId: string) {
    if (!unlocked) return;
    void controller.toggleFollow(teamId);
  }

  function toggleManual(fixtureId: string) {
    if (!unlocked) return;
    void controller.toggleManual(fixtureId);
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
    setDraftNote('');
  }

  const accountPanel = (
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
  );

  return (
    <div className="app">
      <a className="skip" href="#sadrzaj">Preskoči na sadržaj</a>
      <header className="top">
        <p className="brand">MatchAhead</p>
        <p className="meta" data-app-build={APP_BUILD}>
          {unlocked
            ? (verifiedSchedule ? 'Raspored iz javnih izvora' : 'Raspored sa servera, kada je provera dostupna')
            : 'Tvoj sportski raspored'}
        </p>
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
      <main
        id="sadrzaj"
        data-screen={unlocked ? route : 'gate'}
        data-standalone={installMode.standalone ? 'true' : 'false'}
        data-ios-install={installMode.ios ? 'true' : 'false'}
        tabIndex={-1}
      >
        {unlocked ? null : (
          <section className="login-gate">
            <h1>Prijava</h1>
            <p className="lead">Prati klubove i sačuvaj utakmice u svom Google kalendaru.</p>
            {accountPanel}
          </section>
        )}
        {unlocked && route === 'home' ? (
          <PersonalAgendaHome
            now={now}
            timeZone={displayTimeZone}
            online={online}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={toggleManual}
            serverSnapshots={serverSnapshots}
          />
        ) : null}
        {unlocked && route === 'mine' ? (
          <PersonalAgendaScreen
            now={now}
            timeZone={displayTimeZone}
            online={online}
            followed={followed}
            manualFixtureIds={manualFixtureIds}
            onToggleManual={toggleManual}
            draftNote={draftNote}
            onDraft={changeDraft}
            serverSnapshots={serverSnapshots}
          />
        ) : null}
        {unlocked && route === 'clubs' ? (
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
        {unlocked && route === 'settings' ? (
          <SettingsScreen
            prefs={prefs}
            onPrefs={changePrefs}
            onClear={clearSession}
            account={accountPanel}
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
      {unlocked ? (
        <nav className="nav" aria-label="Glavna navigacija">
          {NAV.map((item) => (
            <a key={item} href={routeHash(item)} aria-current={item === route ? 'page' : undefined}>{routeNavLabel(item)}</a>
          ))}
        </nav>
      ) : null}
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
