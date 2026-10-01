export const FIREBASE_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface VerifiedToken {
  uid: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export class TokenRejected extends Error {
  constructor() {
    super('Token nije prihvaćen.');
    this.name = 'TokenRejected';
  }
}

export interface JwtHeader {
  alg?: string;
  kid?: string;
}

export interface JwtClaims {
  aud?: string | string[];
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
}

export interface JwtParts {
  header: JwtHeader;
  claims: JwtClaims;
  signingInput: string;
  signature: Uint8Array;
}

export function readJwt(token: string): JwtParts {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new TokenRejected();
  const header = parseJson<JwtHeader>(parts[0] ?? '');
  const claims = parseJson<JwtClaims>(parts[1] ?? '');
  if (!header || !claims) throw new TokenRejected();
  return {
    header,
    claims,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlToBytes(parts[2] ?? ''),
  };
}

export function uidFromClaims(claims: JwtClaims, projectId: string, nowMs: number): string {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(projectId)) throw new TokenRejected();
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new TokenRejected();
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) throw new TokenRejected();
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) throw new TokenRejected();
  if (typeof claims.iat !== 'number' || claims.iat * 1000 > nowMs + 60_000) throw new TokenRejected();
  return claims.sub;
}

export function base64UrlToBytes(value: string): Uint8Array {
  try {
    const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new TokenRejected();
  }
}

function parseJson<T>(segment: string): T | null {
  try {
    const bytes = base64UrlToBytes(segment);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
