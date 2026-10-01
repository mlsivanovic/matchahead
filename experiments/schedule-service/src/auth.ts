import { createVerify } from 'node:crypto';

import {
  FIREBASE_CERT_URL,
  TokenRejected,
  readJwt,
  uidFromClaims,
  type TokenVerifier,
  type VerifiedToken,
} from './auth-claims.ts';

export { FIREBASE_CERT_URL, TokenRejected };
export type { TokenVerifier, VerifiedToken };

/**
 * Firebase ID token, RS256, preko javnog sertifikata Google-a.
 * `alg: none` i tuđa publika se odbijaju pre bilo kakvog poverenja.
 * Ovo je Node proba. Worker koristi `auth-web.ts` i ne uvozi ovaj fajl.
 */
export function verifyFirebaseIdToken(input: {
  token: string;
  certs: Readonly<Record<string, string>>;
  projectId: string;
  nowMs: number;
}): VerifiedToken {
  const jwt = readJwt(input.token);
  if (jwt.header.alg !== 'RS256' || typeof jwt.header.kid !== 'string') throw new TokenRejected();
  const pem = input.certs[jwt.header.kid];
  if (!pem) throw new TokenRejected();
  const verifier = createVerify('RSA-SHA256');
  verifier.update(jwt.signingInput);
  verifier.end();
  let valid = false;
  try {
    valid = verifier.verify(pem, jwt.signature);
  } catch {
    throw new TokenRejected();
  }
  if (!valid) throw new TokenRejected();
  return { uid: uidFromClaims(jwt.claims, input.projectId, input.nowMs) };
}

export function createFirebaseVerifier(input: {
  projectId: string;
  fetchCerts: () => Promise<Readonly<Record<string, string>>>;
  nowMs?: () => number;
}): TokenVerifier {
  let cached: { certs: Readonly<Record<string, string>>; until: number } | null = null;
  return {
    async verify(token) {
      const now = input.nowMs?.() ?? Date.now();
      if (!cached || cached.until <= now) {
        cached = { certs: await input.fetchCerts(), until: now + 60 * 60 * 1000 };
      }
      return verifyFirebaseIdToken({
        token,
        certs: cached.certs,
        projectId: input.projectId,
        nowMs: now,
      });
    },
  };
}

