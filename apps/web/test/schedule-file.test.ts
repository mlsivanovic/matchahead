import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isSelectableTeamId } from '../../../packages/domain/src/selectable-teams.ts';
import { isScheduleStale, parseDemoSchedule } from '../src/logic/schedule.ts';

const schedule = parseDemoSchedule(JSON.parse(readFileSync(new URL('../public/data/demo-schedule.json', import.meta.url), 'utf8')));

test('javni fajl je zastareo sintetički DEMO i nije dozvoljen unos', () => {
  assert.equal(schedule.kind, 'synthetic-demo');
  assert.equal(schedule.publication, 'forbidden');
  assert.equal(isScheduleStale(schedule.fetchedAt, Date.parse('2026-09-27T12:00:00Z'), schedule.staleAfterHours), true);
  assert.equal(isScheduleStale('2026-09-27T10:00:00Z', Date.parse('2026-09-27T12:00:00Z'), 12), false);
  assert.equal(schedule.fixtures.every((fixture) => fixture.demo && fixture.provider === 'demo'), true);
});

test('svaka utakmica dira selectableTeams, a protivnik nije ograničen katalogom', () => {
  assert.ok(schedule.fixtures.some((fixture) => fixture.awayTeamId !== null && !isSelectableTeamId(fixture.awayTeamId)));
  assert.ok(schedule.fixtures.some((fixture) => !isSelectableTeamId(fixture.homeTeamId)));
  assert.equal(schedule.fixtures.some((fixture) => fixture.startsAtUtc?.endsWith('T00:00:00Z')), false);
  const choiceIds = new Set(['football:rs:crvena-zvezda', 'football:rs:partizan', 'basketball:rs:crvena-zvezda', 'basketball:rs:partizan']);
  const opponentIds = schedule.teams.map((team) => team.id).filter((id) => !choiceIds.has(id));
  assert.ok(opponentIds.length >= 4);
  assert.equal(opponentIds.every((id) => !isSelectableTeamId(id)), true);
});

test('neoznačen raspored se odbija', () => {
  assert.throws(() => parseDemoSchedule({ ...schedule, kind: 'live' }), /DEMO/);
  assert.throws(() => parseDemoSchedule({ ...schedule, publication: 'allowed' }), /dozvoljen/);
});
