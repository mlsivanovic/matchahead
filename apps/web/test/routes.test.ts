import assert from 'node:assert/strict';
import test from 'node:test';

import { isMatchesRoute, parseRoute, routeHash, routeNavLabel, tabForRoute, tabHash, tabLabel } from '../src/logic/routes.ts';

test('hash rute pokrivaju četiri ekrana', () => {
  assert.equal(parseRoute(''), 'home');
  assert.equal(parseRoute('#/'), 'home');
  assert.equal(parseRoute('#/pocetna'), 'home');
  assert.equal(parseRoute('#/moje'), 'mine');
  assert.equal(parseRoute('#/utakmice'), 'mine');
  assert.equal(parseRoute('#/klubovi'), 'clubs');
  assert.equal(parseRoute('#/podesavanja'), 'settings');
  assert.equal(parseRoute('#/klubovi/'), 'clubs');
  assert.equal(parseRoute('#/nepoznato'), 'home');
});

test('link ostaje hash, bez serverske putanje', () => {
  assert.equal(routeHash('clubs'), '#/klubovi');
  assert.equal(routeHash('home'), '#/');
});

test('navigacija prikazuje Utakmice umesto Moje', () => {
  assert.equal(routeNavLabel('mine'), 'Utakmice');
  assert.equal(routeNavLabel('home'), 'Početna');
  assert.equal(routeNavLabel('clubs'), 'Klubovi');
  assert.equal(routeNavLabel('settings'), 'Podešavanja');
});

test('tri taba: početna i stare utakmice su isti ekran', () => {
  assert.equal(tabForRoute('home'), 'matches');
  assert.equal(tabForRoute('mine'), 'matches');
  assert.equal(isMatchesRoute('home'), true);
  assert.equal(isMatchesRoute(parseRoute('#/pocetna')), true);
  assert.equal(isMatchesRoute(parseRoute('#/utakmice')), true);
  assert.equal(tabHash('matches'), '#/utakmice');
  assert.equal(tabHash('clubs'), '#/klubovi');
  assert.equal(tabHash('settings'), '#/podesavanja');
  assert.deepEqual((['matches', 'clubs', 'settings'] as const).map(tabLabel), ['Utakmice', 'Klubovi', 'Podešavanja']);
  assert.equal(tabLabel(tabForRoute(parseRoute('#/moje'))), 'Utakmice');
});
