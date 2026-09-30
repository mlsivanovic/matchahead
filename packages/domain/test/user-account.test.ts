import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { selectableTeams } from '../src/selectable-teams.ts';
import {
  PROFILE_FIELDS,
  agendaInputs,
  buildProfile,
  defaultProfile,
  deletionFlagKey,
  inclusionReasonsForFixture,
  readProfile,
  timeZoneForDisplay,
} from '../src/user-account.ts';

const NOW = '2026-09-30T12:00:00.000Z';
const LATER = '2026-09-30T12:05:00.000Z';
const FIXTURE = 'football:football:demo:demo-liga:demo-sezona:demo:fx-zvezda-sever';

test('omiljeni klub ne ulazi u followedTeamIds ni u razlog utakmice', () => {
  const inputs = agendaInputs({
    follows: [
      { teamId: 'football:rs:crvena-zvezda', active: true, createdAt: NOW, updatedAt: NOW },
      { teamId: 'football:rs:partizan', active: false, createdAt: NOW, updatedAt: NOW },
      { teamId: 'football:xx:demo-rival-sever', active: true, createdAt: NOW, updatedAt: NOW },
    ],
    manualSelections: [
      { fixtureId: FIXTURE, active: true, createdAt: NOW, updatedAt: NOW },
      { fixtureId: 'football:football:demo:demo-liga:demo-sezona:demo:fx-drugi', active: false, createdAt: NOW, updatedAt: NOW },
    ],
  });
  assert.deepEqual(inputs.followedTeamIds, ['football:rs:crvena-zvezda']);
  assert.deepEqual(inputs.manualFixtureIds, [FIXTURE]);

  const reasons = inclusionReasonsForFixture({
    fixtureId: FIXTURE,
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:xx:demo-rival-sever',
    followedTeamIds: inputs.followedTeamIds,
    manualFixtureIds: inputs.manualFixtureIds,
  });
  assert.deepEqual(reasons, [
    { kind: 'followed_team', teamId: 'football:rs:crvena-zvezda' },
    { kind: 'manual_selection', fixtureId: FIXTURE },
  ]);

  const favoriteOnly = inclusionReasonsForFixture({
    fixtureId: FIXTURE,
    homeTeamId: 'basketball:rs:partizan',
    awayTeamId: null,
    followedTeamIds: [],
    manualFixtureIds: [],
  });
  assert.deepEqual(favoriteOnly, []);
});

test('profil prima najviše četiri dozvoljena tima i odbija protivnika', () => {
  const ids = selectableTeams().map((team) => team.id);
  const profile = buildProfile({
    timeZone: 'Europe/Belgrade',
    favoriteTeamIds: ids,
    reminderMinutes: 30,
    notifyScheduleChange: true,
    notifyCancellation: false,
    createdAt: NOW,
    updatedAt: LATER,
  });
  assert.equal(profile.favoriteTeamIds.length, 4);
  assert.equal(profile.locale, 'sr');
  assert.throws(() => buildProfile({ ...profile, favoriteTeamIds: ['football:xx:demo-rival-sever'] }), /team_not_selectable/);
  assert.equal(readProfile({ ...profile, email: 'hidden@example.com' }), null);
  assert.equal(readProfile({ ...profile, reminderMinutes: '30' }), null);
});

test('podrazumevani profil ne prati klub i nepoznata zona postaje Beograd', () => {
  const profile = defaultProfile(NOW, 'nije zona', 30);
  assert.equal(profile.timeZone, 'Europe/Belgrade');
  assert.deepEqual(profile.favoriteTeamIds, []);
  assert.equal(profile.notifyScheduleChange, true);
  assert.equal(timeZoneForDisplay('Fake/Zone'), 'Europe/Belgrade');
  assert.equal(timeZoneForDisplay('Europe/Belgrade'), 'Europe/Belgrade');
  const raw = buildProfile({
    timeZone: 'Europe/Belgrade',
    favoriteTeamIds: [],
    reminderMinutes: 15,
    notifyScheduleChange: true,
    notifyCancellation: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(readProfile({ ...raw, timeZone: 'Fake/Zone' })?.timeZone, 'Europe/Belgrade');
});

test('pravila i katalog dele ista četiri tima i ista polja profila', () => {
  const rules = readFileSync(new URL('../../../firebase/firestore.rules', import.meta.url), 'utf8');
  for (const team of selectableTeams()) assert.equal(rules.includes(`'${team.id}'`), true);
  assert.equal(rules.includes('demo-rival'), false);
  for (const field of PROFILE_FIELDS) assert.equal(rules.includes(`'${field}'`), true);
  assert.equal(rules.includes('notifJobs'), true);
  assert.equal(rules.includes('notificationDeliveries'), true);
  assert.equal(deletionFlagKey('ana_1').startsWith('matchahead.deletion.'), true);
});
