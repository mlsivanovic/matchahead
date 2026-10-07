import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { isScheduleStale, parseDemoSchedule } from '../src/logic/schedule.ts';

test('produkcija nema DEMO raspored ni generator', () => {
  assert.equal(existsSync(new URL('../public/data/demo-schedule.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../scripts/write-demo-schedule.ts', import.meta.url)), false);
});

test('prag zastarelosti i dalje računa časove', () => {
  assert.equal(isScheduleStale('2026-09-27T00:00:00Z', Date.parse('2026-09-27T12:00:00Z'), 12), false);
  assert.equal(isScheduleStale('2026-09-26T00:00:00Z', Date.parse('2026-09-27T12:00:00Z'), 12), true);
});

test('neoznačen raspored se odbija', () => {
  assert.throws(() => parseDemoSchedule({ kind: 'live' }), /DEMO/);
  assert.throws(() => parseDemoSchedule({
    kind: 'synthetic-demo',
    notProductionData: true,
    provider: 'demo',
    publication: 'allowed',
  }), /dozvoljen/);
});
