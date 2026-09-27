import { FCM_SCOPE, TOKEN_AUDIENCE } from './ids.ts';
import { encodeBase64Url } from './secret.ts';

export interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
  scope: string;
}

export interface TokenCacheKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export const TOKEN_CACHE_KEY = 'oauth:fcm-access-token';

export function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem.replaceAll('\\n', '\n').trim();
  if (!normalized.includes('BEGIN PRIVATE KEY') || normalized.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('invalid_private_key');
  }
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export async function signServiceAccountJwt(input: {
  clientEmail: string;
  privateKeyPem: string;
  nowSeconds: number;
  scope?: string;
}): Promise<{ jwt: string; signMs: number }> {
  const started = performance.now();
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(input.privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    iss: input.clientEmail,
    scope: input.scope ?? FCM_SCOPE,
    aud: TOKEN_AUDIENCE,
    iat: input.nowSeconds,
    exp: input.nowSeconds + 3600,
  })));
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  ));
  return {
    jwt: `${unsigned}.${encodeBase64Url(signature)}`,
    signMs: performance.now() - started,
  };
}

export function readCachedToken(raw: string | null, nowMs: number): CachedAccessToken | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.accessToken !== 'string' || typeof record.expiresAtMs !== 'number') return null;
  if (record.scope !== FCM_SCOPE) return null;
  if (record.expiresAtMs <= nowMs + 60_000) return null;
  return {
    accessToken: record.accessToken,
    expiresAtMs: record.expiresAtMs,
    scope: FCM_SCOPE,
  };
}

export function serializeCachedToken(token: CachedAccessToken): string {
  return JSON.stringify({
    accessToken: token.accessToken,
    expiresAtMs: token.expiresAtMs,
    scope: token.scope,
  });
}
