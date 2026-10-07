import assert from 'node:assert/strict';
import test from 'node:test';

import { isPrivateApiUrl, isPublicScheduleUrl, isSensitiveUrl, PUBLIC_SCHEDULE_CACHE, shouldDeleteCacheOnActivate } from '../src/logic/cache-policy.ts';
import { isComposingElement, mayApplyUpdate } from '../src/logic/update-policy.ts';
import { isStandaloneDisplay, needsIosInstallHelp } from '../src/logic/install.ts';

test('OAuth i Google API se ne keširaju, a DEMO fajl više nije keš kandidat', () => {
  assert.equal(isSensitiveUrl('https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(isSensitiveUrl('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp'), true);
  assert.equal(isSensitiveUrl('https://securetoken.googleapis.com/v1/token'), true);
  assert.equal(isSensitiveUrl('https://fcm.googleapis.com/v1/projects/demo/messages:send'), true);
  assert.equal(isSensitiveUrl('https://example.github.io/repo/oauth/token?access_token=tajna'), true);
  assert.equal(isSensitiveUrl('https://example.github.io/repo/data/demo-schedule.json'), false);
  assert.equal(isPublicScheduleUrl('https://example.github.io/repo/data/demo-schedule.json'), false);
  assert.equal(isPublicScheduleUrl('https://example.github.io/repo/index.html'), false);
});

test('privatni /api/ odgovori su network-only', () => {
  assert.equal(isPrivateApiUrl('https://raspored.example/api/find-fixtures'), true);
  assert.equal(isPrivateApiUrl('https://raspored.example/api/'), true);
  assert.equal(isPrivateApiUrl('https://example.github.io/repo/data/demo-schedule.json'), false);
  assert.equal(isPrivateApiUrl('https://example.github.io/repo/index.html'), false);
});

test('aktivacija briše stari DEMO keš i čuva workbox precache', () => {
  assert.equal(shouldDeleteCacheOnActivate(PUBLIC_SCHEDULE_CACHE), true);
  assert.equal(shouldDeleteCacheOnActivate('workbox-precache-v2-https://example/repo/'), false);
  assert.equal(shouldDeleteCacheOnActivate('matchahead-shell-stari'), true);
  assert.equal(shouldDeleteCacheOnActivate('matchahead-device'), false);
});

test('nova verzija čeka dok traje unos', () => {
  assert.equal(mayApplyUpdate({ composing: true, draftDirty: false }), false);
  assert.equal(mayApplyUpdate({ composing: false, draftDirty: true }), false);
  assert.equal(mayApplyUpdate({ composing: false, draftDirty: false }), true);
  assert.equal(isComposingElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isComposingElement({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isComposingElement({ tagName: 'BUTTON' }), false);
});

test('iPhone traži ručni postupak, samostalni prozor ne', () => {
  assert.equal(needsIosInstallHelp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', false), true);
  assert.equal(needsIosInstallHelp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', true), false);
  assert.equal(needsIosInstallHelp('Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0.0.0', false), false);
  assert.equal(isStandaloneDisplay(true, false), true);
});
