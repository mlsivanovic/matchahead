/**
 * Firebase Installations FID.
 * Izvor: firebase-js-sdk packages/installations/src/helpers/generate-fid.ts
 * VALID_FID_PATTERN, pregledano 27. septembra 2026. na grani main.
 * Prvi znak je c, d, e ili f; ukupno 22 znaka. Nije OAuth token i nije stari FCM registration token.
 */
export const FID_PATTERN = /^[cdef][\w-]{21}$/;

export const FCM_SDK_VERSION = '12.19.0';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';
export const FCM_SEND_ORIGIN = 'https://fcm.googleapis.com';

export type InstallationClass = 'fid' | 'legacy_token' | 'invalid';

export function classifyInstallationId(value: unknown): InstallationClass {
  if (typeof value !== 'string') return 'invalid';
  if (FID_PATTERN.test(value)) return 'fid';
  if (value.includes(':') || value.length >= 80) return 'legacy_token';
  return 'invalid';
}

export function isFirebaseInstallationId(value: unknown): value is string {
  return classifyInstallationId(value) === 'fid';
}
