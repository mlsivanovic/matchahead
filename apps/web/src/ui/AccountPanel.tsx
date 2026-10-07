import { useState } from 'react';

import { timeZoneForDisplay } from '../../../../packages/domain/src/user-account.ts';
import type { AccountSnapshot } from '../logic/account-controller.ts';
import type { AccountSetupState } from '../logic/use-account.ts';
import type { ThemePreference } from '../logic/theme.ts';
import { ThemePicker } from './ThemePicker.tsx';

export interface AccountPrefsInput {
  timeZone: string;
  reminderMinutes: number;
  notifyScheduleChange: boolean;
  notifyCancellation: boolean;
}

export interface LoginPromptProps {
  setup: AccountSetupState;
  account: AccountSnapshot;
  onSignIn: () => void;
  theme: ThemePreference;
  onTheme: (value: ThemePreference) => void;
}

const PILOT = 'Pilot je otvoren samo za nalog mls.ivanovic@gmail.com.';

function loginNotice(account: AccountSnapshot): { text: string; alert: boolean } | null {
  if (account.status === 'unconfigured') return { text: 'Prijava trenutno nije dostupna.', alert: false };
  if (account.status === 'offline') return { text: 'Nema mreže. Prijava nije uspela.', alert: true };
  if (account.status === 'working') return { text: 'Prijava je u toku.', alert: false };
  if (account.status === 'error') return { text: account.message ?? 'Prijava nije uspela.', alert: true };
  if (account.message) return { text: account.message, alert: true };
  return null;
}

export function LoginPrompt(props: LoginPromptProps) {
  const notice = loginNotice(props.account);
  const pilotInNotice = notice?.text.includes('mls.ivanovic@gmail.com') === true;
  const canContinue = props.setup === 'ready' && props.account.status !== 'working' && props.account.status !== 'unconfigured';
  return (
    <>
      <ThemePicker value={props.theme} onChange={props.onTheme} />
      {notice ? (
        <p className={notice.alert ? 'warning' : undefined} role={notice.alert ? 'alert' : 'status'}>{notice.text}</p>
      ) : null}
      {canContinue ? (
        <button type="button" className="primary" onClick={props.onSignIn}>Nastavi sa Google</button>
      ) : null}
      {pilotInNotice ? null : <p className="meta">{PILOT}</p>}
    </>
  );
}

export interface AccountPanelProps {
  account: AccountSnapshot;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

export function AccountPanel(props: AccountPanelProps) {
  const { account } = props;
  return (
    <section className="account" aria-label="Nalog">
      <p className="meta">{account.email ?? 'Nalog bez vidljive adrese'}</p>
      {account.message ? <p className="warning" role="status">{account.message}</p> : null}
      <button type="button" onClick={props.onSignOut}>Odjavi se</button>
      <p className="meta">Odjava zatvara nalog na ovom uređaju.</p>
      <DeleteAccountBlock onDelete={props.onDeleteAccount} />
    </section>
  );
}

const ZONES = ['Europe/Belgrade', 'Europe/Zagreb', 'Europe/London', 'UTC'];

export function TimeZonePicker(props: {
  account: AccountSnapshot;
  deviceTimeZone: string;
  onSaveAccount: (prefs: AccountPrefsInput) => void;
  onSaveDevice: (timeZone: string) => void;
}) {
  const profile = props.account.profile;
  const value = profile ? timeZoneForDisplay(profile.timeZone) : props.deviceTimeZone;
  const options = ZONES.includes(value) ? ZONES : [value, ...ZONES];
  return (
    <>
      <p>{profile ? 'Vreme utakmica prikazuje se u ovoj zoni.' : 'Koristi se zona ovog uređaja dok nalog nije učitan.'}</p>
      <label htmlFor="account-zone">Vremenska zona</label>
      <select
        id="account-zone"
        value={value}
        onChange={(event) => {
          const timeZone = event.target.value;
          if (profile) {
            props.onSaveAccount({
              timeZone,
              reminderMinutes: profile.reminderMinutes,
              notifyScheduleChange: profile.notifyScheduleChange,
              notifyCancellation: profile.notifyCancellation,
            });
            return;
          }
          props.onSaveDevice(timeZone);
        }}
      >
        {options.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      {props.account.message ? <p className="warning" role="status">{props.account.message}</p> : null}
    </>
  );
}

function DeleteAccountBlock(props: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}>Obriši nalog</button>
    );
  }
  return (
    <>
      <p className="warning" role="alert">
        Brisanje trajno uklanja profil, praćene klubove i sačuvane izbore.
        Ne može da se opozove. Ako veza prekine, ponovna prijava nastavlja brisanje,
        a novi podaci se ne čuvaju dok se brisanje ne završi.
      </p>
      <div className="modal-actions">
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
