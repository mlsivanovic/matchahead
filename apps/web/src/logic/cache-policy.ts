/** Keš javnog DEMO rasporeda. Aktivacija ga ne briše. */
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

export function isPublicScheduleUrl(url: string): boolean {
  return url.includes('/data/demo-schedule.json');
}

/**
 * Workbox precache (`workbox-`) čisti sama biblioteka, tek kad novi omotač
 * postoji. Imenovani raspored se ne briše ovde: neuspeo odgovor ne sme
 * da obriše poslednji sačuvani DEMO fajl.
 */
export function shouldDeleteCacheOnActivate(cacheName: string): boolean {
  if (cacheName === PUBLIC_SCHEDULE_CACHE) return false;
  if (cacheName.startsWith('workbox-')) return false;
  return cacheName.startsWith('matchahead-shell-');
}
