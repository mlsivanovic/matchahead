import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import { TokenRejected, verifyFirebaseIdToken } from '../src/auth.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const now = Date.parse('2027-01-15T12:00:00Z');

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(header: unknown, payload: unknown): string {
  const head = segment(header);
  const body = segment(payload);
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  signer.end();
  return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}

const claims = {
  aud: 'matchahead',
  iss: 'https://securetoken.google.com/matchahead',
  sub: 'user-1',
  iat: Math.floor(now / 1000),
  exp: Math.floor(now / 1000) + 3600,
};

test('RS256 token sa pravom publikom prolazi, none i tuđa publika ne prolaze', () => {
  const token = sign({ alg: 'RS256', kid: 'k1' }, claims);
  assert.deepEqual(
    verifyFirebaseIdToken({ token, certs: { k1: pem }, projectId: 'matchahead', nowMs: now }),
    { uid: 'user-1' },
  );

  const none = `${segment({ alg: 'none', kid: 'k1' })}.${segment(claims)}.`;
  assert.throws(
    () => verifyFirebaseIdToken({ token: none, certs: { k1: pem }, projectId: 'matchahead', nowMs: now }),
    TokenRejected,
  );
  const other = sign({ alg: 'RS256', kid: 'k1' }, { ...claims, aud: 'drugi-projekat' });
  assert.throws(
    () => verifyFirebaseIdToken({ token: other, certs: { k1: pem }, projectId: 'matchahead', nowMs: now }),
    TokenRejected,
  );
  const hs = `${segment({ alg: 'HS256', kid: 'k1' })}.${segment(claims)}.aaaa`;
  assert.throws(
    () => verifyFirebaseIdToken({ token: hs, certs: { k1: pem }, projectId: 'matchahead', nowMs: now }),
    TokenRejected,
  );
});
