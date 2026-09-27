import assert from 'node:assert/strict';
import test from 'node:test';

import { selectableTeams } from '../../../packages/domain/src/selectable-teams.ts';
import { clubChoices } from '../src/logic/clubs.ts';

test('izbor su samo četiri kluba iz selectableTeams', () => {
  const all = clubChoices('all', '');
  assert.deepEqual(all.map((team) => team.id), selectableTeams().map((team) => team.id));
  assert.equal(clubChoices('football', '').length, 2);
  assert.equal(clubChoices('basketball', '').length, 2);
});

test('pretraga nalazi Zvezdu i Partizan, ne protivnika i ne drugi klub', () => {
  assert.equal(clubChoices('football', 'zvezda').length, 1);
  assert.equal(clubChoices('all', 'партизан').length, 2);
  assert.equal(clubChoices('basketball', 'црвена').length, 1);
  assert.equal(clubChoices('all', 'DEMO Rival').length, 0);
  assert.equal(clubChoices('football', 'vojvodina').length, 0);
});
