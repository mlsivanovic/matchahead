/**
 * Faza 05: provera find-and-refresh UI u pravom browseru na širini telefona.
 * Kontrolisani lokalni fixture server (nikakav pravi sportski izvor) služi
 * sva tri režima odgovora, greške i pogrešan oblik; tačno poreklo
 * (checkedAt) proverava se do milisekunde. Nema periodičnog poziva:
 * svaki mrežni zahtev potiče od klika, što server i broji.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dirUI = '/tmp/matchahead-sched-ui';
const dirNoCfg = '/tmp/matchahead-sched-ui-nocfg';
const chromePath = '/usr/bin/google-chrome-stable';
const basePath = '/repo/';
const SEASON = '2026-2027';
const CHECKED_AT = '2026-10-01T08:00:00.000Z';
const SUCCESS_AT = '2026-10-01T08:00:00.000Z';

const TEAMS = [
  'football:rs:crvena-zvezda',
  'football:rs:partizan',
  'basketball:rs:crvena-zvezda',
  'basketball:rs:partizan',
];

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureFor(teamId, overrides = {}) {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  return {
    id: `${sport}:demo-liga:Superliga:${SEASON}:demo-liga:fx-1`,
    sport,
    competitionId: 'Superliga',
    seasonId: SEASON,
    homeTeamId: teamId,
    awayTeamId: sport === 'football' ? 'football:rs:partizan' : 'basketball:rs:partizan',
    startsAtUtc: '2026-10-05T17:00:00.000Z',
    scheduledLocalDate: '2026-10-05',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'Dvorana testa',
    round: '12. kolo',
    sourceUrl: 'https://primer-liga.example/raspored/superliga-26-27',
    provider: 'primer-liga',
    providerFixtureId: 'fx-1',
    fetchedAt: CHECKED_AT,
    sourceUpdatedAt: null,
    contentHash: 'abc',
    revision: 1,
    ...overrides,
  };
}

function unknownTimeFixture(teamId) {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  return fixtureFor(teamId, {
    id: `${sport}:demo-liga:Superliga:${SEASON}:demo-liga:fx-tbd`,
    startsAtUtc: null,
    timeConfirmed: false,
    status: 'time_tbd',
    scheduledLocalDate: null,
    venue: null,
    round: null,
    providerFixtureId: 'fx-tbd',
    revision: 0,
  });
}

function envelopeFor(teamId, mode) {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  const name = teamId.includes('partizan') ? 'Partizan' : 'Crvena zvezda';
  const club = sport === 'football' ? `FK ${name}` : `KK ${name}`;
  const base = {
    result: {
      teamId,
      sport,
      seasonId: SEASON,
      cacheStatus: 'fetched',
      upstreamRequests: 2,
      checkedAt: CHECKED_AT,
      lastAttemptAt: CHECKED_AT,
      lastSuccessAt: SUCCESS_AT,
      claimsNoMatches: false,
      futureFixtures: [],
      nextFixture: null,
      nextConfirmedFixture: null,
      coverage: [],
    },
    teams: [
      {
        id: teamId, sport, name: club, shortName: name, country: 'RS', city: 'Beograd',
        aliases: [name], providerIds: {},
      },
    ],
    competitions: [
      { id: 'Superliga', sport, name: 'Superliga', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
      { id: 'Kup', sport, name: 'Kup', scope: 'domestic', country: 'RS', aliases: [], providerIds: {} },
    ],
    manifests: [
      {
        provider: 'primer-liga', competitionId: 'Superliga', seasonId: SEASON,
        lastAttemptAt: CHECKED_AT, lastSuccessAt: SUCCESS_AT, lastChangeAt: null, staleAfterHours: 24,
      },
    ],
    changes: [],
  };
  if (mode === 'verified') {
    const confirmed = fixtureFor(teamId);
    const tbd = unknownTimeFixture(teamId);
    base.kind = 'verified-schedule';
    base.result.futureFixtures = [confirmed, tbd];
    base.result.nextFixture = confirmed;
    base.result.nextConfirmedFixture = confirmed;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'confirmed', scheduleAvailability: 'published',
        freeAccessConfirmed: null, futureFixturesAvailable: true, timePrecision: 'unconfirmed_clock',
        postponementObserved: null, cancellationObserved: null, publication: 'unknown',
        requestsPerRefresh: 2, evidence: 'Liga objavila raspored.', checkedAt: '2026-10-01',
      },
      {
        id: `${teamId}:Kup:${SEASON}:primer-liga`, teamId, competitionId: 'Kup', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'unpublished',
        freeAccessConfirmed: null, futureFixturesAvailable: null, timePrecision: null,
        postponementObserved: null, cancellationObserved: null, publication: 'unknown',
        requestsPerRefresh: 1, evidence: 'Žreb nije objavljen.', checkedAt: '2026-10-01',
      },
    ];
    base.changes = [{ fixtureId: confirmed.id, revision: 1, kind: 'new' }];
  } else if (mode === 'blocked') {
    const retained = fixtureFor(teamId);
    base.kind = 'source-blocked';
    // Prva blokada: još nema uspešnog snimka u ovom odgovoru (checkedAt null),
    // ali zadržana utakmica iz prethodnog stanja ostaje — nije otkazana.
    base.result.checkedAt = null;
    base.result.lastSuccessAt = null;
    base.result.futureFixtures = [retained];
    base.result.nextFixture = retained;
    base.result.nextConfirmedFixture = retained;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'source_error',
        freeAccessConfirmed: null, futureFixturesAvailable: null, timePrecision: null,
        postponementObserved: null, cancellationObserved: null, publication: 'unknown',
        requestsPerRefresh: 1, evidence: 'Izvor vratio grešku; prethodni raspored ostaje.', checkedAt: '2026-10-01',
      },
    ];
  } else if (mode === 'demo') {
    base.kind = 'synthetic-demo';
    const demoFixture = {
      ...fixtureFor(teamId),
      provider: 'demo',
      providerFixtureId: 'demo-1',
      sourceUrl: 'synthetic://demo/1',
    };
    base.result.futureFixtures = [demoFixture];
    base.result.nextFixture = demoFixture;
    base.result.nextConfirmedFixture = demoFixture;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:demo`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'demo', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'unknown',
        freeAccessConfirmed: null, futureFixturesAvailable: true, timePrecision: 'utc_confirmed',
        postponementObserved: null, cancellationObserved: null, publication: 'forbidden',
        requestsPerRefresh: 0, evidence: 'Sintetički režim za izolovanu proveru.', checkedAt: '2026-10-01',
      },
    ];
  }
  return base;
}

const apiState = { mode: 'verified', requests: [], throttledOnce: false };

function readJsonBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let text = '';
    request.on('data', (chunk) => {
      text += chunk;
      if (text.length > 65536) rejectPromise(new Error('preveliko telo'));
    });
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(text));
      } catch {
        rejectPromise(new Error('nije JSON'));
      }
    });
    request.on('error', rejectPromise);
  });
}

function startApiServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (url.pathname !== '/api/find-fixtures' || request.method !== 'POST') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'nepoznato', message: 'Nepoznata putanja.' } }));
      return;
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'los-zahtev', message: 'Telo nije JSON.' } }));
      return;
    }
    const valid = body && typeof body === 'object'
      && (body.sport === 'football' || body.sport === 'basketball')
      && TEAMS.includes(body.teamId)
      && body.seasonId === SEASON
      && typeof body.refresh === 'boolean';
    apiState.requests.push({
      mode: apiState.mode,
      authorized: Boolean(request.headers.authorization),
      valid,
      refresh: body?.refresh ?? null,
    });
    if (!valid) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'los-zahtev', message: 'Neispravan zahtev.' } }));
      return;
    }
    if (apiState.mode === 'error500') {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'pad', message: 'Kvar fixture servera.' } }));
      return;
    }
    if (apiState.mode === 'malformed') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ kind: 'uspeh', result: null }));
      return;
    }
    if (apiState.mode === 'throttled-once' && !apiState.throttledOnce) {
      apiState.throttledOnce = true;
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
      response.end(JSON.stringify({ error: { code: 'usporeno', message: 'Polako.' } }));
      return;
    }
    const envelope = envelopeFor(body.teamId, apiState.mode === 'throttled-once' ? 'verified' : apiState.mode);
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(envelope));
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function startStaticServer(dir) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith(basePath)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('nema pristupa korenu domena');
      return;
    }
    let relative = decodeURIComponent(url.pathname.slice(basePath.length));
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    const file = normalize(join(dir, relative));
    if (!file.startsWith(dir)) {
      response.writeHead(403).end('no');
      return;
    }
    try {
      const body = readFileSync(file);
      response.writeHead(200, {
        'content-type': mime[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      response.end(body);
    } catch {
      const fallback = readFileSync(join(dir, '404.html'));
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      response.end(fallback);
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function build(outDir, apiUrl) {
  rmSync(outDir, { recursive: true, force: true });
  run(process.execPath, [resolve(webRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], webRoot, {
    MATCHAHEAD_BASE: basePath,
    MATCHAHEAD_BUILD: 'sched-ui',
    ...(apiUrl ? { VITE_SCHEDULE_API_URL: apiUrl } : {}),
  });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function openRoute(page, hash, screen) {
  await page.evaluate((target) => {
    location.hash = target;
  }, hash);
  await page.waitForFunction(
    (expected) => document.querySelector('main')?.dataset.screen === expected
      && document.querySelector('main h1') !== null,
    {},
    screen,
  );
}

async function clickFinderButton(page, label) {
  await page.evaluate((text) => {
    const section = document.querySelector('section[aria-label="Raspored na zahtev"]');
    if (!section) throw new Error('nema sekcije rasporeda');
    const buttons = [...section.querySelectorAll('button')];
    const target = buttons.find((button) => (button.textContent ?? '').includes(text));
    if (!target) throw new Error(`nema dugmeta ${text}`);
    target.click();
  }, label);
}

async function finderKind(page) {
  return page.evaluate(() => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') ?? null);
}

async function bodyText(page) {
  return page.$eval('body', (element) => element.innerText);
}

run(process.execPath, ['--experimental-strip-types', '--test', ...readdirSync(join(webRoot, 'test')).filter((name) => name.endsWith('.test.ts')).map((name) => join(webRoot, 'test', name))], webRoot);
run(process.execPath, [resolve(webRoot, 'node_modules/typescript/bin/tsc'), '--noEmit'], webRoot);

const api = await startApiServer();
const apiUrl = `http://127.0.0.1:${api.port}`;
build(dirUI, apiUrl);
build(dirNoCfg, null);
const staticUI = await startStaticServer(dirUI);
const staticNoCfg = await startStaticServer(dirNoCfg);
const originUI = `http://127.0.0.1:${staticUI.port}`;
const originNoCfg = `http://127.0.0.1:${staticNoCfg.port}`;

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

  await page.goto(`${originUI}/repo/#/klubovi`, { waitUntil: 'load' });
  await page.waitForSelector('section[aria-label="Raspored na zahtev"]');
  assert((await bodyText(page)).includes('Raspored na zahtev'), 'nema sekcije rasporeda');
  assert((await finderKind(page)) === null, 'rezultat postoji pre klika');
  assert(await overflow(page) <= 1, 'preliv pre pronalaženja');
  console.log('PASS: sekcija rasporeda na klubovima, bez poziva pre klika');

  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  const provenance = await page.$eval('[data-schedule-kind]', (element) => element.dataset.provenance);
  assert(provenance === CHECKED_AT, `poreklo nije tačno: ${provenance}`);
  assert((await bodyText(page)).includes('Proveren raspored'), 'nema oznake režima');
  assert((await bodyText(page)).includes('Neobjavljeno'), 'nema neobjavljenog takmičenja');
  assert((await bodyText(page)).includes('Termin nije potvrđen'), 'nepoznat termin nije označen');
  const sources = await page.$$eval('[data-source-url]', (links) => links.map((link) => link.dataset.sourceUrl));
  assert(sources.length >= 1 && sources.every((href) => href.startsWith('https://primer-liga.example/')), `izvori: ${JSON.stringify(sources)}`);
  assert(await overflow(page) <= 1, 'preliv posle pronalaženja');
  console.log('PASS: pronalaženje — lista, izvori, neobjavljeno, nepoznat termin, tačno poreklo');

  const refreshDisabled = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('section[aria-label="Raspored na zahtev"] button')];
    return buttons.find((button) => (button.textContent ?? '').includes('Osveži raspored'))?.disabled ?? null;
  });
  assert(refreshDisabled === true, 'osvežavanje nije zaključano kuldaunom');
  assert((await bodyText(page)).includes('Osvežavanje je moguće za'), 'nema kuldaun poruke');
  assert((await finderKind(page)) === 'verified-schedule', 'kuldaun promenio prikaz');
  console.log('PASS: kuldaun osvežavanja poštuje najkraći razmak');

  apiState.mode = 'error500';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForSelector('[role="alert"]');
  assert((await finderKind(page)) === 'verified-schedule', 'pad servera obrisao prikaz');
  assert(provenance === (await page.$eval('[data-schedule-kind]', (element) => element.dataset.provenance)), 'poreklo pomereno posle pada');
  console.log('PASS: pad servera čuva poslednji dobar prikaz');

  apiState.mode = 'malformed';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(() => document.body.innerText.includes('neispravan odgovor'));
  assert((await finderKind(page)) === 'verified-schedule', 'pogrešan odgovor obrisao prikaz');
  console.log('PASS: pogrešan odgovor je greška, prikaz sačuvan');

  apiState.mode = 'blocked';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'source-blocked',
  );
  assert((await bodyText(page)).includes('Izvor blokiran'), 'nema oznake blokade');
  assert((await bodyText(page)).includes('Dvorana testa'), 'blokada nije zadržala prethodnu utakmicu');
  assert((await bodyText(page)).includes('Još nema uspešne provere izvora'), 'blokada izmišlja uspeh');
  assert(
    (await page.$eval('[data-schedule-kind]', (element) => element.dataset.provenance)) === undefined,
    'blokada nosi lažno poreklo',
  );
  console.log('PASS: source-blocked — pokrivenost, razlog, zadržana utakmica, bez lažnog uspeha');

  apiState.mode = 'demo';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'synthetic-demo',
  );
  assert((await bodyText(page)).includes('nisu stvarne utakmice'), 'DEMO nije jasno označen');
  console.log('PASS: synthetic-demo je vidljivo označen i efemeran');

  const hitsBefore = apiState.requests.length;
  apiState.mode = 'error500';
  await page.reload({ waitUntil: 'load' });
  // DEMO se ne upisuje: reload pokazuje poslednje trajno stanje (blokadu), bez novog poziva.
  await page.waitForSelector('[data-schedule-kind="source-blocked"]');
  assert(apiState.requests.length === hitsBefore, 'reload ponovo zvao server umesto trajnog stanja');
  console.log('PASS: reload čita trajno stanje bez novog poziva; DEMO nije zamenio provereno');

  apiState.mode = 'verified';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );

  await page.evaluate(() => {
    const first = document.querySelector('.club-list button');
    if (!first) throw new Error('nema kluba za praćenje');
    first.click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.club-list button')].some((button) => (button.textContent ?? '').includes('Pratim')));
  await openRoute(page, '#/moje', 'mine');
  await page.waitForSelector('[data-server-agenda]');
  const agendaProvenance = await page.$eval('[data-server-agenda]', (element) => element.dataset.provenance);
  assert(agendaProvenance === CHECKED_AT, `agenda poreklo nije tačno: ${agendaProvenance}`);
  assert((await bodyText(page)).includes('Pronađene utakmice'), 'nema serverske sekcije u agendi');
  assert(await overflow(page) <= 1, 'preliv na mojim utakmicama');
  await openRoute(page, '#/', 'home');
  await page.waitForSelector('[data-server-agenda]');
  console.log('PASS: agenda i početna pokazuju serverske utakmice sa poreklom');

  const sawValid = apiState.requests.filter((entry) => entry.valid);
  assert(sawValid.length >= 5, `server video ${sawValid.length} ispravnih zahteva`);
  assert(sawValid.some((entry) => entry.refresh === false), 'nema find bez refresh');
  assert(sawValid.every((entry) => entry.authorized === false), 'neprijavljen klijent poslao Authorization');
  console.log('PASS: svi zahtevi na klik, ugovor tela ispravan, bez lažnog tokena');

  const plain = await browser.newPage();
  plain.setDefaultTimeout(15000);
  await plain.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await plain.goto(`${originNoCfg}/repo/#/klubovi`, { waitUntil: 'load' });
  await plain.waitForSelector('section[aria-label="Raspored na zahtev"]');
  assert((await bodyText(plain)).includes('nije podešen'), 'onemogućeno stanje nije pošteno');
  const disabledCount = await plain.$$eval('section[aria-label="Raspored na zahtev"] button', (buttons) => buttons.filter((button) => button.disabled).length);
  assert(disabledCount >= 2, `dugmad nisu onemogućena: ${disabledCount}`);
  console.log('PASS: nekonfigurisan server je pošteno onemogućen');
} finally {
  await browser.close();
  staticUI.server.close();
  staticNoCfg.server.close();
  api.server.close();
}
console.log('SVE PROVERE RASPOREDA SU PROŠLE');
