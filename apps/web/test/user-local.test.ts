import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browserStore,
  clearUserLocalContent,
  DEVICE_PREFS_KEY,
  memoryStore,
  readDevicePrefs,
  readDraftNote,
  readFollowedTeamIds,
  writeDevicePrefs,
  writeDraftNote,
  writeFollowedTeamIds,
  writeUserScopedNote,
} from '../src/logic/user-local.ts';

test('odjava briše samo taj uid i sesiju', () => {
  const local = memoryStore();
  const session = memoryStore();
  writeFollowedTeamIds(session, ['football:rs:partizan', 'football:xx:demo-rival-sever']);
  writeDraftNote(session, 'beleška');
  writeUserScopedNote(local, 'ana', 'ana beleška');
  writeUserScopedNote(local, 'boris', 'boris beleška');
  writeDevicePrefs(local, { timeZone: 'UTC', reminderMinutes: 15, theme: 'dark' });

  assert.deepEqual(readFollowedTeamIds(session), ['football:rs:partizan']);
  clearUserLocalContent(local, session, 'ana');

  assert.equal(readDraftNote(session), '');
  assert.deepEqual(readFollowedTeamIds(session), []);
  assert.equal(local.getItem('matchahead.user.ana.note'), null);
  assert.equal(local.getItem('matchahead.user.boris.note'), 'boris beleška');
  assert.equal(readDevicePrefs(local).timeZone, 'UTC');
  assert.equal(readDevicePrefs(local).theme, 'dark');
  assert.equal(local.getItem(DEVICE_PREFS_KEY)?.includes('UTC'), true);
});

test('podrazumevana zona je Beograd, podsetnik 30, tema Auto', () => {
  const prefs = readDevicePrefs(memoryStore());
  assert.equal(prefs.timeZone, 'Europe/Belgrade');
  assert.equal(prefs.reminderMinutes, 30);
  assert.equal(prefs.theme, 'auto');
});

test('neispravna tema ne briše zonu i postaje Auto', () => {
  const local = memoryStore({
    [DEVICE_PREFS_KEY]: JSON.stringify({ timeZone: 'UTC', reminderMinutes: 15, theme: 'plavo' }),
  });
  const prefs = readDevicePrefs(local);
  assert.equal(prefs.timeZone, 'UTC');
  assert.equal(prefs.reminderMinutes, 15);
  assert.equal(prefs.theme, 'auto');
});

test('odbijen storage ne baca', () => {
  const denied = {
    get length() {
      throw new Error('denied');
    },
    clear() {
      throw new Error('denied');
    },
    getItem() {
      throw new Error('denied');
    },
    key() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  } as unknown as Storage;
  const store = browserStore(denied);
  assert.equal(store.getItem('a'), null);
  assert.doesNotThrow(() => store.setItem('a', 'b'));
  assert.doesNotThrow(() => store.removeItem('a'));
  assert.deepEqual(store.keys(), []);
  assert.equal(readDevicePrefs(store).theme, 'auto');
  assert.doesNotThrow(() => writeDevicePrefs(store, { timeZone: 'UTC', reminderMinutes: 30, theme: 'light' }));
});
