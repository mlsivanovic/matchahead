import assert from 'node:assert/strict';
import test from 'node:test';

import type { Firestore } from 'firebase/firestore';

import { buildProfile } from '../../../packages/domain/src/user-account.ts';
import { AccountController, type AccountRemote } from '../src/logic/account-controller.ts';

/**
 * Failure se vezuje za tiket konkretnog pokušaja: beginSignIn vrati tiket,
 * kasni rejection ga nosi u noticeFailure. Kontrolisani pending popup
 * redosled je isti kao stvarni callback u use-account.ts (klik zabeleži
 * tiket, novi nalog stigne observerom, pa tek onda rejection starog
 * popup-a).
 *
 * gate.applyError gleda samo generaciju tiketa i briše privatne podatke,
 * pa stari kod (bez tiketa) ovim redosledom prebacuje NOV nalog u grešku
 * i čisti mu praćenja. Novi kod odbacuje zastareli tiket.
 */

const NOW = '2026-09-30T12:00:00.000Z';
const DB = {} as unknown as Firestore;

function fakeRemote(): AccountRemote {
  return {
    async load(_db, uid, email) {
      return {
        profile: buildProfile({
          timeZone: 'Europe/Belgrade',
          favoriteTeamIds: [],
          reminderMinutes: 30,
          notifyScheduleChange: true,
          notifyCancellation: true,
          createdAt: NOW,
          updatedAt: NOW,
        }),
        followedTeamIds: uid === 'boris' ? ['tim:boris'] : [],
        favoriteTeamIds: [],
        manualFixtureIds: [],
        email,
      };
    },
    async setFollow() {},
    async setManual() {},
    async saveProfile() {},
    async removeDevice() {},
    async isDeletionOpen() {
      return false;
    },
    async deleteOwned() {},
  };
}

test('zakašnjela greška starog pokušaja ne kvari novi nalog', async () => {
  const controller = new AccountController(fakeRemote(), () => NOW);
  const attempt = controller.beginSignIn('Prijavljivanje…');
  await controller.handleIdentity(DB, { uid: 'boris', email: 'boris@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  assert.equal(controller.snapshot().uid, 'boris');
  // Kasni rejection starog popup pokušaja stiže po dolasku Borisa.
  controller.noticeFailure('Prozor prijave je zatvoren', attempt);
  const snap = controller.snapshot();
  assert.equal(snap.uid, 'boris');
  assert.equal(snap.status, 'signed-in');
  assert.equal(snap.message, null);
  assert.deepEqual(snap.followedTeamIds, ['tim:boris']);
});

test('greška važi za tiket tekućeg pokušaja', () => {
  const controller = new AccountController(fakeRemote(), () => NOW);
  const attempt = controller.beginSignIn('Prijavljivanje…');
  controller.noticeFailure('Prozor prijave je zatvoren', attempt);
  const snap = controller.snapshot();
  assert.equal(snap.status, 'error');
  assert.equal(snap.message, 'Prozor prijave je zatvoren');
});

test('stari failure posle novog klika ostaje bez dejstva', () => {
  const controller = new AccountController(fakeRemote(), () => NOW);
  const old = controller.beginSignIn('Prijavljivanje…');
  const current = controller.beginSignIn('Prijavljivanje…');
  // Zastareli rejection prvog pokušaja ne sme da prebaci novi u grešku.
  controller.noticeFailure('Prozor prijave je zatvoren', old);
  assert.equal(controller.snapshot().status, 'working');
  // Tekući pokušaj i dalje sme da prijavi svoju grešku.
  controller.noticeFailure('Prozor prijave je zatvoren', current);
  assert.equal(controller.snapshot().status, 'error');
});

test('stari failure posle dolaska i kraja identiteta ostaje bez dejstva', async () => {
  const controller = new AccountController(fakeRemote(), () => NOW);
  const attempt = controller.beginSignIn('Prijavljivanje…');
  await controller.handleIdentity(DB, { uid: 'boris', email: 'boris@example.com' }, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  // Null koji zaista završava Borisov identitet (odjava): epoha se diže.
  await controller.handleIdentity(null, null, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  controller.noticeFailure('Prozor prijave je zatvoren', attempt);
  const snap = controller.snapshot();
  assert.equal(snap.uid, null);
  assert.equal(snap.status, 'signed-out');
  assert.equal(snap.message, null);
});

test('null odjek bez vlasnika ne poništava tekući pokušaj', async () => {
  // Cancel putanja iz browsera: odjava je već očistila prikaz, kasni
  // null odjek stiže posle klika ali ne završava nikoga — greška
  // otkazanog popup-a i dalje važi.
  const controller = new AccountController(fakeRemote(), () => NOW);
  const attempt = controller.beginSignIn('Prijavljivanje…');
  await controller.handleIdentity(null, null, {
    offline: false,
    fallbackTimeZone: 'Europe/Belgrade',
  });
  controller.noticeFailure('Prozor prijave je zatvoren', attempt);
  const snap = controller.snapshot();
  assert.equal(snap.status, 'error');
  assert.equal(snap.message, 'Prozor prijave je zatvoren');
});
