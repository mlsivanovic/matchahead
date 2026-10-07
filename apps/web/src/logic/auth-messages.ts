export const UNCONFIGURED_MESSAGE = 'Google prijava nije podešena na ovom izdanju. Niko nije prijavljen. Funkcije aplikacije su zaključane.';
export const EMULATOR_REJECTED_MESSAGE = 'Adresa emulatora nije lokalna. Prijava nije pokrenuta.';
export const OFFLINE_MESSAGE = 'Nema mreže. Prijava nije uspela. Funkcije aplikacije ostaju zaključane.';
export const ACCESS_DENIED_MESSAGE = 'Ovaj Google nalog nema pristup. Dozvoljen je samo verifikovan nalog mls.ivanovic@gmail.com. Odjavljen si, a aplikacija nije otvorena.';
export const WORKING_MESSAGE = 'Prijava je u toku. Nalog još nije otvoren.';
export const RECENT_LOGIN_MESSAGE = 'Brisanje naloga traži novu prijavu. Stari podaci nisu prikazani.';
export const DELETED_MESSAGE = 'Nalog je obrisan.';

const SAFE_CODES: Record<string, string> = {
  'auth/popup-closed-by-user': 'Prozor prijave je zatvoren. Nalog nije otvoren.',
  'auth/cancelled-popup-request': 'Prijava je otkazana. Nalog nije otvoren.',
  'auth/popup-blocked': 'Pregledač je blokirao prozor prijave. Nalog nije otvoren.',
  'auth/network-request-failed': 'Nema mreže ili prijava ne odgovara. Prijava nije uspela.',
  'auth/requires-recent-login': RECENT_LOGIN_MESSAGE,
  'auth/user-disabled': 'Ovaj nalog je onemogućen. Prijava nije uspela.',
  'auth/operation-not-allowed': 'Google prijava nije uključena. Nalog nije otvoren.',
  'auth/unauthorized-domain': 'Ovaj domen nije ovlašćen za prijavu. Nalog nije otvoren.',
  'permission-denied': 'Upis je odbijen. Podaci nisu sačuvani.',
  unavailable: 'Baza ne odgovara. Podaci nisu sačuvani.',
  unauthenticated: 'Nisi prijavljen. Upis nije sačuvan.',
};

export function firebaseErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

export function safeFirebaseMessage(code: string | null): string {
  if (code && SAFE_CODES[code]) return SAFE_CODES[code];
  return 'Radnja nije uspela. Podaci nisu predstavljeni kao sačuvani.';
}
