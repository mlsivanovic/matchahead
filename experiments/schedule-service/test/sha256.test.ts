import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { sha256Hex, sha256Utf8 } from '../src/sha256.ts';
import { quotaHash } from '../src/quota-logic.ts';

test('SHA-256 se poklapa sa referentnim vektorom i ne ostavlja sirovi IP', () => {
  const abc = new TextEncoder().encode('abc');
  assert.equal(sha256Hex(abc), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const sample = 'so\0user-1';
  assert.equal(sha256Utf8(sample), createHash('sha256').update(sample).digest('hex'));
  const hashed = quotaHash('so', '127.0.0.1');
  assert.equal(hashed.includes('127.0.0.1'), false);
  assert.equal(hashed, createHash('sha256').update('so\u0000127.0.0.1').digest('hex'));
});
