/**
 * Ime starog keša sintetičkog DEMO fajla. Aktivacija ga briše da
 * instalirana aplikacija ne zadrži data/demo-schedule.json.
 */
export const PUBLIC_SCHEDULE_CACHE = 'matchahead-public-schedule';

const SENSITIVE_URL = [
  /accounts\.google\.com/i,
  /googleapis\.com/i,
  /identitytoolkit/i,
  /securetoken/i,
  /firebaseinstallations/i,
  /fcm\.googleapis\.com/i,
  /\/oauth(?:\/|$|\?)/i,
  /[?&](?:access_token|id_token|code)=/i,
];

/**
 * Google prijava, OAuth i tuđi API odgovori ne ulaze u keš.
 * Isti worker kasnije prima FCM, ali ni tada ne kešira te odgovore.
 */
export function isSensitiveUrl(url: string): boolean {
  return SENSITIVE_URL.some((pattern) => pattern.test(url));
}

/** Produkcija više ne isporučuje javni DEMO raspored. */
export function isPublicScheduleUrl(_url: string): boolean {
  return false;
}

/**
 * Faza 05: privatni API servera rasporeda nikad ne ulazi u keš.
 * Odgovori sa /api/ uvek idu direktno na mrežu (network-only),
 * isto kao OAuth i tuđi API odgovori.
 */
export function isPrivateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://local');
    return parsed.pathname === '/api' || parsed.pathname.startsWith('/api/');
  } catch {
    return url.includes('/api/');
  }
}

/**
 * Workbox precache (`workbox-`) čisti sama biblioteka, tek kad novi omotač
 * postoji. Stari imenovani DEMO keš se briše. Neuspeo odgovor ne dira
 * workbox precache omotača.
 */
export function shouldDeleteCacheOnActivate(cacheName: string): boolean {
  if (cacheName === PUBLIC_SCHEDULE_CACHE) return true;
  if (cacheName.startsWith('workbox-')) return false;
  return cacheName.startsWith('matchahead-shell-');
}
