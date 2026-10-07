import { useEffect, useState } from 'react';

import { selectableTeams } from '../../../../packages/domain/src/selectable-teams.ts';
import { REMINDER_MINUTE_OPTIONS, timeZoneForDisplay } from '../../../../packages/domain/src/user-account.ts';
import type { AccountSnapshot } from '../logic/account-controller.ts';
import { sportLabel } from '../logic/clubs.ts';
import type { AccountSetupState } from '../logic/use-account.ts';

export interface AccountPrefsInput {
  timeZone: string;
  reminderMinutes: number;
  notifyScheduleChange: boolean;
  notifyCancellation: boolean;
}

export interface AccountPanelProps {
  setup: AccountSetupState;
  account: AccountSnapshot;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleFavorite: (teamId: string) => void;
  onSavePrefs: (prefs: AccountPrefsInput) => void;
  onDeleteAccount: () => void;
}

const ZONES = ['Europe/Belgrade', 'Europe/Zagreb', 'Europe/London', 'UTC'];

export function AccountPanel(props: AccountPanelProps) {
  const { account } = props;
  return (
    <section className="account" aria-label="Nalog">
      <h2>Nalog</h2>
      {account.status === 'unconfigured' ? (
        <p>{account.message ?? 'Google prijava nije podešena na ovom izdanju. Niko nije prijavljen. Funkcije aplikacije su zaključane.'}</p>
      ) : null}
      {account.status === 'signed-out' || account.status === 'offline' ? (
        <>
          <p>
            {account.status === 'offline'
              ? 'Nema mreže. Prijava nije uspela. Funkcije aplikacije ostaju zaključane.'
              : 'Prijavi se Google nalogom da nastaviš.'}
          </p>
          {account.message ? <p className="warning" role="alert">{account.message}</p> : null}
          {props.setup === 'ready' ? (
            <button type="button" className="primary" onClick={props.onSignIn}>Prijavi se Google nalogom</button>
          ) : null}
          <p className="meta">Prijava se otvara u Google prozoru.</p>
          <p className="meta">Pilot test je trenutno dostupan samo nalogu mls.ivanovic@gmail.com.</p>
        </>
      ) : null}
      {account.status === 'working' ? <p>Prijava je u toku. Nalog još nije otvoren.</p> : null}
      {account.status === 'error' ? (
        <>
          <p className="warning" role="alert">{account.message ?? 'Prijava nije uspela.'}</p>
          {props.setup === 'ready' ? (
            <button type="button" className="primary" onClick={props.onSignIn}>Pokušaj ponovo</button>
          ) : null}
        </>
      ) : null}
      {account.status === 'signed-in' ? (
        <>
          <p className="meta">Prijavljen: {account.email ?? 'nalog bez vidljive adrese'}</p>
          <button type="button" onClick={props.onSignOut}>Odjavi se</button>
          <p className="meta">Odjava odmah čisti prikaz i privatnu memoriju ovog uređaja.</p>
          {account.message ? <p className="warning" role="status">{account.message}</p> : null}
          {account.profile ? (
            <>
              <FavoritesBlock
                favoriteTeamIds={account.favoriteTeamIds}
                onToggle={props.onToggleFavorite}
              />
              <PrefsForm
                key={account.uid}
                timeZone={timeZoneForDisplay(account.profile.timeZone)}
                reminderMinutes={account.profile.reminderMinutes}
                notifyScheduleChange={account.profile.notifyScheduleChange}
                notifyCancellation={account.profile.notifyCancellation}
                revision={account.profile.updatedAt}
                onSave={props.onSavePrefs}
              />
              <p className="meta">
                Praćenja: {account.followedTeamIds.length}. Ručni izbori: {account.manualFixtureIds.length}.
                Agenda koristi samo praćenja i ručne izbore; omiljeni klubovi nikad ne ulaze u utakmice.
              </p>
              <DeleteAccountBlock onDelete={props.onDeleteAccount} />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function DeleteAccountBlock(props: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <>
        <h3>Brisanje naloga</h3>
        <button type="button" onClick={() => setConfirming(true)}>Obriši nalog i sve podatke</button>
      </>
    );
  }
  return (
    <>
      <h3>Brisanje naloga</h3>
      <p className="warning" role="alert">
        Brišu se profil, praćenja, ručni izbori i veze uređaja, pa Auth nalog.
        Brava brisanja ostaje dok je server ne očisti; isti nalog ne može da
        napravi nove podatke dok brava postoji. Ako prijava zastari,
        ponovna prijava samo nastavlja brisanje.
      </p>
      <div className="filters" role="group" aria-label="Potvrda brisanja">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            props.onDelete();
          }}
        >
          {busy ? 'Brisanje je u toku.' : 'Potvrdi brisanje'}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Otkaži</button>
      </div>
    </>
  );
}

function FavoritesBlock(props: { favoriteTeamIds: readonly string[]; onToggle: (teamId: string) => void }) {
  const teams = selectableTeams();
  return (
    <>
      <h3>Omiljeni klubovi</h3>
      <p className="meta">Brzo nalaženje omiljenog kluba. Omiljeno nije praćenje i ne dodaje utakmice u agendu.</p>
      <ul className="club-list">
        {teams.map((team) => {
          const active = props.favoriteTeamIds.includes(team.id);
          return (
            <li key={team.id}>
              <div>
                <strong>{team.name}</strong>
                <p className="meta">{sportLabel(team.sport)} · {team.city}</p>
              </div>
              <button type="button" aria-pressed={active} onClick={() => props.onToggle(team.id)}>
                {active ? 'Omiljeni klub' : 'Dodaj u omiljene'}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PrefsForm(props: {
  timeZone: string;
  reminderMinutes: number;
  notifyScheduleChange: boolean;
  notifyCancellation: boolean;
  revision: string;
  onSave: (prefs: AccountPrefsInput) => void;
}) {
  const [timeZone, setTimeZone] = useState(props.timeZone);
  const [reminderMinutes, setReminderMinutes] = useState(props.reminderMinutes);
  const [notifyScheduleChange, setNotifyScheduleChange] = useState(props.notifyScheduleChange);
  const [notifyCancellation, setNotifyCancellation] = useState(props.notifyCancellation);
  const [dirty, setDirty] = useState(false);
  // Osveženi profil sa servera puni formu samo dok korisnik nije
  // počeo izmenu: sačuvana revizija ne gazi započet unos.
  useEffect(() => {
    if (!dirty) {
      setTimeZone(props.timeZone);
      setReminderMinutes(props.reminderMinutes);
      setNotifyScheduleChange(props.notifyScheduleChange);
      setNotifyCancellation(props.notifyCancellation);
    }
  }, [props.revision]);
  // Važeća zona van skraćene liste prikazuje se kao izabrana opcija:
  // select nikad ne laže Beograd dok se čuva druga zona.
  const zoneOptions = ZONES.includes(timeZone) ? ZONES : [timeZone, ...ZONES];
  return (
    <>
      <h3>Podešavanja naloga</h3>
      <p className="meta">Čuvaju se na serveru uz tvoj nalog. Podrazumevani podsetnik je 30 minuta.</p>
      <label htmlFor="account-zone">Vremenska zona</label>
      <select
        id="account-zone"
        value={timeZone}
        onChange={(event) => {
          setTimeZone(event.target.value);
          setDirty(true);
        }}
      >
        {zoneOptions.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      <fieldset>
        <legend>Podsetnik pre početka</legend>
        {REMINDER_MINUTE_OPTIONS.map((minutes) => (
          <label key={minutes} className="choice">
            <input
              type="radio"
              name="account-reminder"
              checked={reminderMinutes === minutes}
              onChange={() => {
                setReminderMinutes(minutes);
                setDirty(true);
              }}
            />
            {minutes === 0 ? 'Isključeno' : `${minutes} minuta`}
          </label>
        ))}
      </fieldset>
      <label className="choice">
        <input
          type="checkbox"
          checked={notifyScheduleChange}
          onChange={(event) => {
            setNotifyScheduleChange(event.target.checked);
            setDirty(true);
          }}
        />
        Obavesti me o promeni termina
      </label>
      <label className="choice">
        <input
          type="checkbox"
          checked={notifyCancellation}
          onChange={(event) => {
            setNotifyCancellation(event.target.checked);
            setDirty(true);
          }}
        />
        Obavesti me o otkazivanju
      </label>
      <button
        type="button"
        onClick={() => {
          props.onSave({ timeZone, reminderMinutes, notifyScheduleChange, notifyCancellation });
          setDirty(false);
        }}
      >
        Sačuvaj podešavanja
      </button>
      <p className="meta">Slanje obaveštenja na zatvorenu aplikaciju nije deo ove faze; izbor se samo čuva.</p>
    </>
  );
}
