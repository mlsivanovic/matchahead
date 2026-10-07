/**
 * Faza 05: provera find-and-refresh UI u pravom browseru na širini telefona.
 * Kontrolisani lokalni fixture server (nikakav pravi sportski izvor) služi
 * sva tri režima odgovora, greške i pogrešan oblik; tačno poreklo
 * (checkedAt) proverava se do milisekunde. Nema periodičnog poziva:
 * svaki mrežni zahtev potiče od klika, što server i broji.
 * Potrebni su lokalni Auth/Firestore emulatori na 9098/8081:
 * firebase emulators:start --config firebase/browser-emulators.json --project demo-matchahead --only auth,firestore
 * Calendar API upisi presreću se u browseru uz zaobilaženje service workera.
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
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/chromium';
const basePath = '/repo/';
const SEASON = '2026-2027';
const CHECKED_AT = '2026-10-01T08:00:00.000Z';
const SUCCESS_AT = '2026-10-01T08:00:00.000Z';
// Ovi kontrolisani rasporedi imaju mečeve 4/5. oktobra. Zamrzni samo
// browser kalendar; Node rokovi i produkcioni sat ostaju stvarni.
const BROWSER_NOW = Date.parse('2026-10-01T12:00:00.000Z');

async function freezeBrowserCalendar(page) {
  await page.evaluateOnNewDocument((now) => {
    const NativeDate = Date;
    globalThis.Date = new Proxy(NativeDate, {
      construct(target, args, newTarget) {
        return Reflect.construct(target, args.length ? args : [now], newTarget);
      },
      apply() {
        return new NativeDate(now).toString();
      },
      get(target, property, receiver) {
        return property === 'now' ? () => now : Reflect.get(target, property, receiver);
      },
    });
  }, BROWSER_NOW);
}

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

async function waitForRequests(count, timeoutMs = 15000) {
  const start = Date.now();
  while (apiState.requests.length < count) {
    if (Date.now() - start > timeoutMs) throw new Error(`server nije video ${count} zahteva`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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
    scheduledLocalDate: '2026-10-06',
    venue: null,
    round: null,
    providerFixtureId: 'fx-tbd',
    // Trajna revizija počinje od 1; nula nije sačuvana revizija.
    revision: 1,
  });
}

/**
 * Zajednički derbi: isti stabilni id, isti sadržaj i revizija u snimcima oba
 * fudbalska kluba. Unificirana agenda ga sme pokazati tačno jednom, kao
 * najraniju sledeću utakmicu.
 */
function derbyFixture() {
  return {
    id: `football:primer-liga:Superliga:${SEASON}:primer-liga:fx-derby`,
    sport: 'football',
    competitionId: 'Superliga',
    seasonId: SEASON,
    homeTeamId: 'football:rs:crvena-zvezda',
    awayTeamId: 'football:rs:partizan',
    startsAtUtc: '2026-10-04T17:00:00.000Z',
    scheduledLocalDate: '2026-10-04',
    sourceTimeZone: 'Europe/Belgrade',
    timeConfirmed: true,
    previousStartsAtUtc: null,
    previousScheduledLocalDate: null,
    status: 'scheduled',
    venue: 'Derbi arena',
    round: 'Derbi',
    sourceUrl: 'https://primer-liga.example/raspored/superliga-26-27-derbi',
    provider: 'primer-liga',
    providerFixtureId: 'fx-derby',
    fetchedAt: CHECKED_AT,
    sourceUpdatedAt: null,
    contentHash: 'derby-2',
    revision: 2,
  };
}

function teamEntry(id) {
  const teamSport = id.startsWith('basketball') ? 'basketball' : 'football';
  const teamName = id.includes('partizan') ? 'Partizan' : 'Crvena zvezda';
  const club = teamSport === 'football' ? `FK ${teamName}` : `KK ${teamName}`;
  return {
    id, sport: teamSport, name: club, shortName: teamName, country: 'RS', city: 'Beograd',
    aliases: [teamName], providerIds: {},
  };
}

function envelopeFor(teamId, mode) {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  const otherTeamId = sport === 'football'
    ? (teamId.includes('partizan') ? 'football:rs:crvena-zvezda' : 'football:rs:partizan')
    : (teamId.includes('partizan') ? 'basketball:rs:crvena-zvezda' : 'basketball:rs:partizan');
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
    // Imenik učesnika: traženi klub i protivnik sa spiska.
    teams: [teamEntry(teamId), teamEntry(otherTeamId)],
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
  if (mode === 'verified' || mode === 'verified-allowed') {
    const confirmed = fixtureFor(teamId);
    const tbd = unknownTimeFixture(teamId);
    base.kind = 'verified-schedule';
    if (teamId === 'football:rs:crvena-zvezda' || teamId === 'football:rs:partizan') {
      const derby = derbyFixture();
      base.result.futureFixtures = [derby, confirmed, tbd];
      base.result.nextFixture = derby;
      base.result.nextConfirmedFixture = derby;
    } else {
      base.result.futureFixtures = [confirmed, tbd];
      base.result.nextFixture = confirmed;
      base.result.nextConfirmedFixture = confirmed;
    }
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'confirmed', scheduleAvailability: 'published',
        freeAccessConfirmed: null, futureFixturesAvailable: true, timePrecision: 'unconfirmed_clock',
        postponementObserved: null, cancellationObserved: null, publication: 'allowed',
        requestsPerRefresh: 2, evidence: 'Liga objavila raspored uz dozvolu.', checkedAt: '2026-10-01',
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
    if (mode === 'verified-allowed') {
      // Stvarni server za objavljenu ligu nosi allowed: osnova za opoziv tok.
      base.result.coverage[0].publication = 'allowed';
    }
  } else if (mode === 'revoked') {
    // Opoziv prava: izvoru je uskraćena objava, server ne vraća njegove utakmice.
    base.kind = 'source-blocked';
    base.result.checkedAt = null;
    base.result.lastSuccessAt = null;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'unknown',
        freeAccessConfirmed: null, futureFixturesAvailable: null, timePrecision: null,
        postponementObserved: null, cancellationObserved: null, publication: 'forbidden',
        requestsPerRefresh: 0, evidence: 'Organizator uskratio pravo objave; raniji snimak ovog izvora se ne vraća.', checkedAt: '2026-10-01',
      },
    ];
  } else if (mode === 'blocked') {
    const retained = fixtureFor(teamId);
    base.kind = 'source-blocked';
    // Zastareli snimak: izvor vratio grešku, ali poslednji dobar snimak
    // ostaje uz dokaz poslednje uspešne provere i dozvoljenu pokrivenost.
    // Blokada bez dokaza ne sme nositi utakmice (videti 'revoked' režim).
    base.result.checkedAt = CHECKED_AT;
    base.result.lastSuccessAt = SUCCESS_AT;
    base.result.futureFixtures = [retained];
    base.result.nextFixture = retained;
    base.result.nextConfirmedFixture = retained;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'source_error',
        freeAccessConfirmed: null, futureFixturesAvailable: null, timePrecision: null,
        postponementObserved: null, cancellationObserved: null, publication: 'allowed',
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
        postponementObserved: null, cancellationObserved: null, publication: 'allowed',
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
    VITE_SCHEDULE_API_URL: apiUrl ?? '',
    VITE_FIREBASE_API_KEY: 'demo',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-matchahead.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-matchahead',
    VITE_FIREBASE_APP_ID: '1:0:web:demo',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '',
    VITE_FIREBASE_STORAGE_BUCKET: '',
    VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
    VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
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

/** Local Auth emulator only; never drive a live Google account. */
async function signInEmulator(browser, page, calendarExport = false) {
  if (!calendarExport) await page.waitForSelector('[data-screen="gate"]');
  const opened = new Promise((resolvePopup, rejectPopup) => {
    const timer = setTimeout(() => rejectPopup(new Error('Emulator popup nije otvoren')), 25000);
    page.once('popup', (popup) => { clearTimeout(timer); resolvePopup(popup); });
  });
  await page.evaluate((exporting) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(exporting ? 'Dodaj u Google kalendar' : 'Prijavi se Google'));
    if (!button) throw new Error('Nema Google prijave');
    button.click();
  }, calendarExport);
  const popup = await opened;
  await popup.waitForFunction(() => document.body.innerText.includes('Google.com'));
  if (!popup.url().startsWith('http://127.0.0.1:9098/')) throw new Error('Provera sme da koristi samo lokalni Auth emulator.');
  const selected = await popup.evaluate(() => {
    const button = [...document.querySelectorAll('button, li, [role="button"]')].find((item) => item.innerText?.includes('mls.ivanovic@gmail.com'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!selected) {
    await popup.evaluate(() => [...document.querySelectorAll('button')].find((item) => item.innerText.includes('Add new account')).click());
    await popup.waitForSelector('#email-input');
    await popup.$eval('#email-input', (input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'mls.ivanovic@gmail.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 800));
  if (!popup.isClosed()) await popup.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter((item) => item.innerText.includes('Sign in with Google.com'));
    const button = buttons.find((item) => item.offsetParent !== null) ?? buttons[0];
    if (button) button.click();
  });
  if (calendarExport) await page.waitForFunction(() => document.querySelector('.calendar-export [role=status]')?.textContent?.includes('Dodato:'));
  else await page.waitForFunction(() => document.querySelector('main')?.dataset.screen === 'clubs');
  if (!popup.isClosed()) await popup.close();
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
  await freezeBrowserCalendar(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

  await page.goto(`${originUI}/repo/#/klubovi`, { waitUntil: 'load' });
  await signInEmulator(browser, page);
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
  assert((await bodyText(page)).includes('Poslednja uspešna provera'), 'blokada nema dokaz provere zadržanog snimka');
  assert(
    (await page.$eval('[data-schedule-kind]', (element) => element.dataset.provenance)) === CHECKED_AT,
    'blokada ne nosi poreklo poslednjeg snimka',
  );
  console.log('PASS: source-blocked — pokrivenost, razlog, zadržana utakmica sa dokazom provere');

  apiState.mode = 'demo';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(() => document.body.innerText.includes('nije prihvaćen'));
  assert((await finderKind(page)) === 'source-blocked', 'sintetički odgovor zamenio sačuvano stanje');
  assert(!(await bodyText(page)).includes('DEMO'), 'korisnički tekst i dalje kaže DEMO');
  console.log('PASS: sintetički odgovor je odbijen i nije prikazan');

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

  // Drugi klub: isti derbi u oba snimka sme u agendu tačno jednom.
  await page.evaluate((name) => {
    const section = document.querySelector('section[aria-label="Raspored na zahtev"]');
    if (!section) throw new Error('nema sekcije rasporeda');
    const clubGroup = [...section.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Klub');
    if (!clubGroup) throw new Error('nema grupe klubova');
    const target = [...clubGroup.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes(name));
    if (!target) throw new Error(`nema kluba ${name}`);
    target.click();
  }, 'Partizan');
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  console.log('PASS: pronalaženje drugog kluba');

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.club-list button')];
    if (buttons.length < 2) throw new Error(`nema dva kluba za praćenje: ${buttons.length}`);
    buttons.filter((button) => (button.textContent ?? '').trim() === 'Prati').forEach((button) => button.click());
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.club-list button')].filter((button) => (button.textContent ?? '').includes('Pratim')).length >= 2,
  );

  await openRoute(page, '#/', 'home');
  await page.waitForSelector('[data-server-agenda]');
  const agendaProvenance = await page.$eval('[data-server-agenda]', (element) => element.dataset.provenance);
  assert(agendaProvenance === CHECKED_AT, `agenda poreklo nije tačno: ${agendaProvenance}`);
  assert((await bodyText(page)).includes('Pronađene utakmice'), 'nema serverske sekcije u agendi');
  // Derbi je najraniji (4. oktobar pre 5. oktobra): u Sledećoj je tačno jednom.
  // Isti red se normalno ponavlja i u nedeljnoj sekciji — unificirana agenda
  // ga drži kao jedan red po id-u, pa se ovde broji unutar sekcije Sledeća.
  const nextDerby = await page.evaluate(() => {
    const root = document.querySelector('[data-server-agenda]');
    if (!root) throw new Error('nema serverske agende');
    const head = [...root.querySelectorAll('h2')].find((element) => (element.textContent ?? '').includes('Sledeća utakmica'));
    if (!head) throw new Error('nema sekcije Sledeća utakmica');
    let count = 0;
    let node = head.nextElementSibling;
    while (node && node.tagName !== 'H2') {
      if (node.tagName === 'ARTICLE' && (node.textContent ?? '').includes('Derbi arena')) count += 1;
      node = node.nextElementSibling;
    }
    return count;
  });
  assert(nextDerby === 1, `derbi se u Sledećoj vidi ${nextDerby} puta, mora tačno jednom`);
  const homeText = await page.$eval('[data-server-agenda]', (element) => element.textContent ?? '');
  assert(homeText.includes('Derbi arena'), 'najranija sledeća utakmica nije derbi');
  assert(await overflow(page) <= 1, 'preliv na početnoj sa server agendom');
  console.log('PASS: početna — unificirana agenda, derbi jednom, najraniji next');

  await openRoute(page, '#/moje', 'mine');
  await page.waitForSelector('[data-server-agenda]');
  // Calendar API is fully intercepted: this test cannot create real Google events.
  const calendarEvents = new Map();
  let calendarPosts = 0;
  let failSecondOnce = true;
  // Bypass the worker so its network-only forwarding cannot evade page interception.
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (!request.url().startsWith('https://www.googleapis.com/calendar/v3/')) {
      await request.continue();
      return;
    }
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await request.respond({ status: 204, headers });
    } else if (request.method() === 'GET') {
      const id = new URL(request.url()).pathname.split('/').at(-1);
      await request.respond({ status: calendarEvents.has(id) ? 200 : 404, headers, body: JSON.stringify(calendarEvents.get(id) ?? {}) });
    } else if (request.method() === 'POST') {
      calendarPosts += 1;
      assert(Boolean(request.headers().authorization), 'calendar request nema OAuth header');
      const event = JSON.parse(request.postData());
      if (failSecondOnce && calendarPosts === 2) {
        failSecondOnce = false;
        await request.respond({ status: 500, headers, body: '{}' });
      } else if (calendarEvents.has(event.id)) {
        await request.respond({ status: 409, headers, body: '{}' });
      } else {
        calendarEvents.set(event.id, event);
        await request.respond({ status: 200, headers, body: JSON.stringify(event) });
      }
    } else {
      await request.respond({ status: 405, headers, body: '{}' });
    }
  });
  const chooseAllCalendar = () => page.evaluate(() => [...document.querySelectorAll('.calendar-export button')].find((button) => button.textContent.includes('Izaberi sve')).click());
  await chooseAllCalendar();
  const eligibleCount = await page.$$eval('.calendar-selection input:checked', (inputs) => inputs.length);
  assert(eligibleCount >= 2, 'calendar nema više dostupnih utakmica');
  await page.type('#draft-note', 'Provera beleške');
  await signInEmulator(browser, page, true);
  assert(calendarEvents.size === 1, `delimičan upis: events=${calendarEvents.size}, posts=${calendarPosts}, status=${await page.$eval('.calendar-export [role=status]', (element) => element.textContent)}`);
  assert(await page.$$eval('.calendar-selection input:checked', (inputs) => inputs.length) === eligibleCount - 1, 'uspešna utakmica ostala u izboru posle greške');
  await signInEmulator(browser, page, true);
  await page.waitForFunction(() => document.querySelector('.calendar-export [role=status]')?.textContent?.includes('Već u kalendaru: 0.') && !document.querySelector('.calendar-selection input:checked'));
  assert(calendarEvents.size === eligibleCount, 'ponovni pokušaj nije dodao preostale događaje');
  assert([...calendarEvents.values()].every((event) => event.description.includes('Provera beleške')), 'beleška nije preneta');
  const fallbackEvent = [...calendarEvents.values()].find((event) => event.description.includes('Vreme nije poznato'));
  assert(fallbackEvent && new Date(fallbackEvent.start.dateTime).getUTCHours() === 15, 'nepoznata satnica nije 17h u Beogradu');
  await chooseAllCalendar();
  await signInEmulator(browser, page, true);
  await page.waitForFunction((count) => document.querySelector('.calendar-export [role=status]')?.textContent?.includes(`Dodato: 0. Već u kalendaru: ${count}.`), {}, eligibleCount);
  assert(calendarEvents.size === eligibleCount, 'ponovljeni izbor napravio duplikate');
  await page.setRequestInterception(false);
  await page.setBypassServiceWorker(false);
  page.removeAllListeners('request');
  console.log('PASS: kalendar — izbor svih, beleška, delimičan uspeh, nastavak, 17h i bez duplikata; svi Google upisi mockovani');

  await page.select('#agenda-club', 'football:rs:partizan');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await bodyText(page)).includes('Derbi arena'), 'filter kluba Partizan sakrio derbi');
  await page.select('#agenda-club', 'all');
  await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="Filter sporta"]');
    if (!group) throw new Error('nema filtera sporta');
    const target = [...group.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Košarka'));
    if (!target) throw new Error('nema filtera košarke');
    target.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await bodyText(page)).includes('Nema utakmica za ovaj izbor.'), 'filter košarke nije ispraznio serversku agendu');
  await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="Filter sporta"]');
    [...group.querySelectorAll('button')].find((button) => (button.textContent ?? '').trim() === 'Sve').click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.select('#agenda-competition', 'Superliga');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await bodyText(page)).includes('Derbi arena'), 'filter takmičenja Superliga sakrio derbi');
  await page.select('#agenda-competition', 'all');
  await new Promise((resolve) => setTimeout(resolve, 300));
  // Grupe statusa su disjunktne: derbi je u celoj agendi tačno jedan red.
  const mineDerby = await page.$$eval('[data-server-agenda] article.card', (cards) =>
    cards.filter((card) => (card.textContent ?? '').includes('Derbi arena')).length);
  assert(mineDerby === 1, `derbi se u Mojim vidi ${mineDerby} puta, mora tačno jednom`);
  const unknownCard = await page.$$eval('[data-server-agenda] article.card', (cards) =>
    cards.map((card) => card.textContent ?? '').find((text) => text.includes('Termin nije potvrđen')) ?? null);
  assert(unknownCard !== null, 'nema nepoznatog termina u agendi');
  assert(!/\d{1,2}:\d{2}/.test(unknownCard), `nepoznat termin nosi sat: ${unknownCard.slice(0, 120)}`);
  assert(await overflow(page) <= 1, 'preliv na mojim utakmicama');
  console.log('PASS: moje — filteri kluba i takmičenja, nepoznat termin bez 00:00');

  await openRoute(page, '#/klubovi', 'clubs');
  await page.waitForSelector('section[aria-label="Raspored na zahtev"]');
  await page.setOfflineMode(true);
  const offlineBefore = apiState.requests.length;
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForSelector('[role="alert"]');
  assert((await bodyText(page)).includes('Nema mreže'), 'nema offline poruke');
  assert((await finderKind(page)) === 'verified-schedule', 'offline obrisao prikaz');
  assert(apiState.requests.length === offlineBefore, 'offline pozvao server');
  await page.setOfflineMode(false);
  console.log('PASS: offline čuva prikaz bez poziva');

  const narrow = await browser.newPage();
  await freezeBrowserCalendar(narrow);
  narrow.setDefaultTimeout(15000);
  await narrow.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  const narrowText = async () => narrow.$eval('body', (element) => element.innerText);
  const narrowOverflow = async () => narrow.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // Nova kartica obnavlja Google sesiju i serverom sačuvana praćenja; snimci su deljeni.
  await narrow.goto(`${originUI}/repo/#/klubovi`, { waitUntil: 'load' });
  await narrow.waitForSelector('section[aria-label="Raspored na zahtev"]');
  await narrow.waitForFunction(() => [...document.querySelectorAll('.club-list button')].filter((button) => button.textContent?.includes('Pratim')).length >= 2);
  await narrow.evaluate((target) => {
    location.hash = target;
  }, '#/');
  await narrow.waitForSelector('[data-server-agenda]');
  const narrowDerby = await narrow.evaluate(() => {
    const root = document.querySelector('[data-server-agenda]');
    if (!root) throw new Error('nema serverske agende na 360px');
    const head = [...root.querySelectorAll('h2')].find((element) => (element.textContent ?? '').includes('Sledeća utakmica'));
    if (!head) throw new Error('nema sekcije Sledeća utakmica na 360px');
    let count = 0;
    let node = head.nextElementSibling;
    while (node && node.tagName !== 'H2') {
      if (node.tagName === 'ARTICLE' && (node.textContent ?? '').includes('Derbi arena')) count += 1;
      node = node.nextElementSibling;
    }
    return count;
  });
  assert(narrowDerby === 1, `derbi na 360px u Sledećoj: ${narrowDerby} puta`);
  assert(await narrowOverflow() <= 1, 'preliv na 360px početnoj');
  await narrow.evaluate((target) => {
    location.hash = target;
  }, '#/moje');
  await narrow.waitForFunction(
    () => document.querySelector('main')?.dataset.screen === 'mine'
      && document.querySelector('[data-server-agenda]') !== null,
  );
  assert(await narrowOverflow() <= 1, 'preliv na 360px mojim utakmicama');
  assert((await narrowText()).includes('Pronađene utakmice'), 'nema serverske agende na 360px');
  await narrow.close();
  console.log('PASS: 360px — oba kluba, derbi jednom, bez preliva');

  // Opoziv: allowed snimci oba kluba, pa forbidden za isti par briše svuda.
  // Prikaz je već verified pa se kraj ne čeka po vrsti, već po broju zahteva.
  apiState.mode = 'verified-allowed';
  await openRoute(page, '#/klubovi', 'clubs');
  await page.waitForSelector('section[aria-label="Raspored na zahtev"]');
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Raspored na zahtev"]');
    const clubGroup = [...section.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Klub');
    [...clubGroup.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Crvena zvezda')).click();
  });
  let pendingBefore = apiState.requests.length;
  await clickFinderButton(page, 'Pronađi utakmice');
  await waitForRequests(pendingBefore + 1);
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Raspored na zahtev"]');
    const clubGroup = [...section.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Klub');
    [...clubGroup.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Partizan')).click();
  });
  pendingBefore = apiState.requests.length;
  await clickFinderButton(page, 'Pronađi utakmice');
  await waitForRequests(pendingBefore + 1);
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  apiState.mode = 'revoked';
  await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Raspored na zahtev"]');
    const clubGroup = [...section.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Klub');
    [...clubGroup.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('Crvena zvezda')).click();
  });
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'source-blocked',
  );
  await openRoute(page, '#/', 'home');
  await page.waitForFunction(() => !document.querySelector('[data-server-agenda]'));
  assert((await bodyText(page)).includes('Agenda je prazna'), 'opoziv nije ispraznio agendu');
  const partizanStored = await page.evaluate(() => {
    const raw = localStorage.getItem('matchahead.device.schedule.football:rs:partizan:2026-2027');
    if (!raw) return -1;
    return JSON.parse(raw).response.result.futureFixtures.length;
  });
  assert(partizanStored === 0, `opoziv nije očistio drugi klub: ${partizanStored}`);
  console.log('PASS: opoziv briše izvor iz svih klupskih snimaka');

  const sawValid = apiState.requests.filter((entry) => entry.valid);
  assert(sawValid.length >= 10, `server video ${sawValid.length} ispravnih zahteva`);
  assert(sawValid.some((entry) => entry.refresh === false), 'nema find bez refresh');
  assert(sawValid.every((entry) => entry.authorized === true), 'prijavljen klijent nije poslao Authorization');
  console.log('PASS: svi zahtevi na klik, ugovor tela ispravan, uz token lokalnog emulatora');

  const plain = await browser.newPage();
  await freezeBrowserCalendar(plain);
  plain.setDefaultTimeout(15000);
  await plain.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await plain.goto(`${originNoCfg}/repo/#/klubovi`, { waitUntil: 'load' });
  await signInEmulator(browser, plain);
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
