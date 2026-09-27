import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
  writeDevicePrefs(local, { timeZone: 'UTC', reminderMinutes: 15 });

  assert.deepEqual(readFollowedTeamIds(session), ['football:rs:partizan']);
  clearUserLocalContent(local, session, 'ana');

  assert.equal(readDraftNote(session), '');
  assert.deepEqual(readFollowedTeamIds(session), []);
  assert.equal(local.getItem('matchahead.user.ana.note'), null);
  assert.equal(local.getItem('matchahead.user.boris.note'), 'boris beleška');
  assert.equal(readDevicePrefs(local).timeZone, 'UTC');
  assert.equal(local.getItem(DEVICE_PREFS_KEY)?.includes('UTC'), true);
});

test('podrazumevana zona je Beograd, a podsetnik 30', () => {
  const prefs = readDevicePrefs(memoryStore());
  assert.equal(prefs.timeZone, 'Europe/Belgrade');
  assert.equal(prefs.reminderMinutes, 30);
});
