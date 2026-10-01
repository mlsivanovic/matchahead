import {
  TokenRejected,
  base64UrlToBytes,
  readJwt,
  uidFromClaims,
  type JwtClaims,
  type TokenVerifier,
  type VerifiedToken,
} from './auth-claims.ts';

/**
 * RS256 provera preko WebCrypto. Prima SPKI PEM ili X.509 sertifikat,
 * kakav Google objavljuje na javnom URL-u. Ne koristi `node:crypto`.
 */
export async function verifyFirebaseIdTokenWeb(input: {
  token: string;
  certs: Readonly<Record<string, string>>;
  projectId: string;
  nowMs: number;
}): Promise<VerifiedToken> {
  const jwt = readJwt(input.token);
  if (jwt.header.alg !== 'RS256' || typeof jwt.header.kid !== 'string') throw new TokenRejected();
  const pem = input.certs[jwt.header.kid];
  if (!pem) throw new TokenRejected();
  const key = await importRsaKey(pem);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    jwt.signature,
    new TextEncoder().encode(jwt.signingInput),
  );
  if (!valid) throw new TokenRejected();
  return { uid: uidFromClaims(jwt.claims, input.projectId, input.nowMs) };
}

export function createWebFirebaseVerifier(input: {
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
      return verifyFirebaseIdTokenWeb({
        token,
        certs: cached.certs,
        projectId: input.projectId,
        nowMs: now,
      });
    },
  };
}

export function spkiDerFromPem(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
  if (pem.includes('BEGIN PUBLIC KEY')) return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
  if (!pem.includes('BEGIN CERTIFICATE')) throw new TokenRejected();
  const spki = extractSpki(der);
  return spki.buffer.slice(spki.byteOffset, spki.byteOffset + spki.byteLength);
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    spkiDerFromPem(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

interface Tlv {
  tag: number;
  start: number;
  valueStart: number;
  end: number;
}

function extractSpki(bytes: Uint8Array): Uint8Array {
  const outer = readTlv(bytes, 0);
  const top = children(bytes, outer);
  const tbs = top[0];
  if (!tbs || tbs.tag !== 0x30) throw new TokenRejected();
  const fields = children(bytes, tbs);
  const offset = fields[0]?.tag === 0xa0 ? 6 : 5;
  const spki = fields[offset];
  if (!spki || spki.tag !== 0x30) throw new TokenRejected();
  return bytes.subarray(spki.start, spki.end);
}

function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset] ?? 0;
  const lengthByte = bytes[offset + 1] ?? 0;
  let length = lengthByte;
  let header = 2;
  if ((lengthByte & 0x80) !== 0) {
    const count = lengthByte & 0x7f;
    length = 0;
    for (let index = 0; index < count; index += 1) length = (length << 8) | (bytes[offset + 2 + index] ?? 0);
    header = 2 + count;
  }
  return { tag, start: offset, valueStart: offset + header, end: offset + header + length };
}

function children(bytes: Uint8Array, tlv: Tlv): Tlv[] {
  const found: Tlv[] = [];
  let cursor = tlv.valueStart;
  while (cursor < tlv.end) {
    const child = readTlv(bytes, cursor);
    found.push(child);
    cursor = child.end;
  }
  return found;
}

export type { JwtClaims };
