import assert from 'node:assert/strict';
import test from 'node:test';

import { ALLOWED_GOOGLE_EMAIL, googleAccessClaim, isAllowedGoogleAccess } from '../src/logic/access-allowlist.ts';
import { ACCESS_DENIED_MESSAGE } from '../src/logic/auth-messages.ts';
import { AccountController } from '../src/logic/account-controller.ts';

const allowed = {
  email: ALLOWED_GOOGLE_EMAIL,
  emailVerified: true,
  providerIds: ['google.com'],
};

test('samo verifikovan Google nalog mls.ivanovic@gmail.com prolazi klijentsku dozvolu', () => {
  assert.equal(isAllowedGoogleAccess(allowed), true);
  assert.equal(isAllowedGoogleAccess({ ...allowed, email: '  MLS.Ivanovic@gmail.com ' }), true);
  assert.equal(isAllowedGoogleAccess(googleAccessClaim({
    email: ALLOWED_GOOGLE_EMAIL,
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }],
  })), true);
});

test('drugi nalog, neverifikovan email i tuđ provajder ne prolaze', () => {
  assert.equal(isAllowedGoogleAccess({ ...allowed, email: 'ana@example.com' }), false);
  assert.equal(isAllowedGoogleAccess({ ...allowed, email: null }), false);
  assert.equal(isAllowedGoogleAccess({ ...allowed, emailVerified: false }), false);
  assert.equal(isAllowedGoogleAccess({ ...allowed, providerIds: ['password'] }), false);
  assert.equal(isAllowedGoogleAccess({ ...allowed, providerIds: [] }), false);
});

test('odbijeni nalog ne otvara profil, a poruka preživljava null događaj', async () => {
  const controller = new AccountController({
    load: async () => {
      throw new Error('profil tuđeg naloga ne sme da se učita');
    },
    setFollow: async () => undefined,
    setManual: async () => undefined,
    saveProfile: async () => undefined,
    removeDevice: async () => undefined,
    isDeletionOpen: async () => false,
    deleteOwned: async () => undefined,
  }, () => '2026-10-06T00:00:00.000Z');
  controller.beginSignIn('Prijava je u toku.');
  controller.holdAccessDenied(ACCESS_DENIED_MESSAGE);
  await controller.handleIdentity(null, null, { offline: false, fallbackTimeZone: 'Europe/Belgrade' });
  const snap = controller.snapshot();
  assert.equal(snap.status, 'signed-out');
  assert.equal(snap.uid, null);
  assert.equal(snap.profile, null);
  assert.deepEqual(snap.followedTeamIds, []);
  assert.equal(snap.message, ACCESS_DENIED_MESSAGE);
  controller.noticeFailure('Prozor prijave je zatvoren. Nalog nije otvoren.', {
    uid: null,
    seq: 1,
    endedEpoch: 0,
  });
  assert.equal(controller.snapshot().message, ACCESS_DENIED_MESSAGE);
});
