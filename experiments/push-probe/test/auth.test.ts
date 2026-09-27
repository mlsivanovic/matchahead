import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pemToPkcs8, signServiceAccountJwt } from '../src/google-auth.ts';
import { FCM_SCOPE } from '../src/ids.ts';
import { bytesFromBase64Url, generatePrivateKeyPem } from './helpers.ts';

const material = await generatePrivateKeyPem();

test('JWT je RS256, samo FCM scope, i potpis se proverava javnim ključem', async () => {
  const signed = await signServiceAccountJwt({
    clientEmail: 'probe@matchahead-probe.iam.gserviceaccount.com',
    privateKeyPem: material.pem,
    nowSeconds: 1_700_000_000,
  });
  const [header, payload, signature] = signed.jwt.split('.');
  const headerJson = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(header))) as { alg: string };
  const payloadJson = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload))) as { scope: string; aud: string };
  assert.equal(headerJson.alg, 'RS256');
  assert.equal(payloadJson.scope, FCM_SCOPE);
  assert.equal(payloadJson.scope.includes('cloud-platform'), false);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    material.publicKey,
    bytesFromBase64Url(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  assert.equal(verified, true);
  assert.equal(signed.signMs >= 0, true);
});

test('PEM sa esc-novim redovima se čita, a PKCS1 oblik se odbija', () => {
  const escaped = material.pem.replaceAll('\n', '\\n');
  assert.equal(pemToPkcs8(escaped).byteLength > 0, true);
  assert.throws(() => pemToPkcs8('-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----'));
});
