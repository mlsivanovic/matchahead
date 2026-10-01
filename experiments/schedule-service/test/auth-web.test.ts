import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import { TokenRejected } from '../src/auth-claims.ts';
import { spkiDerFromPem, verifyFirebaseIdTokenWeb } from '../src/auth-web.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const spkiDer = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }));
const spkiPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const certPem = certificatePem(spkiDer);
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

test('WebCrypto prima X.509 sertifikat i odbija alg none', async () => {
  assert.deepEqual(new Uint8Array(spkiDerFromPem(certPem)), spkiDer);
  assert.deepEqual(new Uint8Array(spkiDerFromPem(spkiPem)), spkiDer);
  const token = sign({ alg: 'RS256', kid: 'k1' }, claims);
  assert.deepEqual(
    await verifyFirebaseIdTokenWeb({ token, certs: { k1: certPem }, projectId: 'matchahead', nowMs: now }),
    { uid: 'user-1' },
  );
  const none = `${segment({ alg: 'none', kid: 'k1' })}.${segment(claims)}.x`;
  await assert.rejects(
    () => verifyFirebaseIdTokenWeb({ token: none, certs: { k1: certPem }, projectId: 'matchahead', nowMs: now }),
    TokenRejected,
  );
});

function certificatePem(spki: Uint8Array): string {
  const oid = Uint8Array.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
  const sigAlg = seq(oid, Uint8Array.from([0x05, 0x00]));
  const version = tlv(0xa0, Uint8Array.from([0x02, 0x01, 0x02]));
  const serial = Uint8Array.from([0x02, 0x01, 0x01]);
  const validity = seq(tlv(0x17, text('260101000000Z')), tlv(0x17, text('270101000000Z')));
  const empty = seq();
  const tbs = seq(version, serial, sigAlg, empty, validity, empty, spki);
  const signature = tlv(0x03, concat(Uint8Array.of(0), new Uint8Array(8)));
  const der = seq(tbs, sigAlg, signature);
  const body = Buffer.from(der).toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derLen(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  const length = derLen(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
}

function seq(...parts: Uint8Array[]): Uint8Array {
  return tlv(0x30, concat(...parts));
}
