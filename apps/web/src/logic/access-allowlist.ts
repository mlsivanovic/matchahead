/**
 * Klijentska dozvola posle uspešne Firebase prijave.
 *
 * Ovo nije lista test korisnika na OAuth consent ekranu u Google Cloud
 * konzoli. Taj ekran, dok je Publishing status Testing, sam odlučuje koga
 * Google pušta da završi dijalog. Ovaj modul ne upisuje tu listu, ne čita
 * je i ne tvrdi da je podešena. Ako Google dijalog odbije, Firebase javi
 * grešku pre ovog koda. Ako dijalog prođe, ovde se i dalje proverava nalog:
 * Google provajder, verifikovan email i tačno mls.ivanovic@gmail.com.
 * Svaki drugi nalog se odjavljuje bez otvaranja profila.
 */
export const ALLOWED_GOOGLE_EMAIL = 'mls.ivanovic@gmail.com';

export interface GoogleAccessClaim {
  email: string | null;
  emailVerified: boolean;
  providerIds: readonly string[];
}

export function isAllowedGoogleAccess(claim: GoogleAccessClaim): boolean {
  const email = claim.email?.trim().toLowerCase() ?? '';
  return email === ALLOWED_GOOGLE_EMAIL
    && claim.emailVerified === true
    && claim.providerIds.includes('google.com');
}

export function googleAccessClaim(user: {
  email: string | null;
  emailVerified: boolean;
  providerData: readonly { providerId: string }[];
}): GoogleAccessClaim {
  return {
    email: user.email,
    emailVerified: user.emailVerified,
    providerIds: user.providerData.map((entry) => entry.providerId),
  };
}
