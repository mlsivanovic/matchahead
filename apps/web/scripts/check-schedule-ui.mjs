/**
 * Provera schedule servisa i klijentskog interfejsa.
 *
 * Pokretanje (iz apps/web):
 *   node scripts/check-schedule-ui.mjs
 *
 * Potpuna provera bez regresija:
 * - Zamrznut sat preko Proxy(NativeDate) sa promenljivim vremenom i visibilitychange događajem.
 * - Klubovi: Raspored se otvara u modalnom panelu preko dugmeta „Raspored” na klubu.
 * - Testovi otpornosti:
 *   - pad 500 (provera slanja zahteva i očuvanja verified stanja)
 *   - pogrešan odgovor servera (malformed JSON, provera greške i očuvanja stanja)
 *   - blokiran izvor (source-blocked, pokrivenost, razlog, zadržana utakmica)
 *   - sintetički odgovor (synthetic-demo, odbacivanje i očuvanje prethodnog stanja)
 * - Jedinstvena agenda na početnoj: Derbi tačno jednom, oznaka „Sledeća”.
 * - Google kalendar: Izbor preko „Izaberi” / „Izaberi sve” i „Dodaj u kalendar” modalnog panela.
 * - Autentični Google OAuth popup tok kroz emulator na 9098, presretnuti Google Calendar API pozivi,
 *   provera broja upisa, prenosa beleške, satnice 17h za nepotvrđen sat, delimične greške, ponovnog pokušaja,
 *   kao i verifikacija da ponovljeni izvoz izaziva stvarne 409 POST i GET zahteve bez dupliranja događaja.
 * - Filteri sporta, kluba i takmičenja; rad van mreže (offline); širina 360px bez preliva; opoziv prava objave.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/chromium';
const dirUI = resolve('/tmp/matchahead-sched-ui-dist');
const dirNoCfg = resolve('/tmp/matchahead-sched-nocfg-dist');
const basePath = '/repo/';

const CHECKED_AT = '2026-10-01T08:00:00.000Z';
const SUCCESS_AT = '2026-10-01T08:00:00.000Z';
const SEASON = '2026-2027';
const TEAMS = [
  'football:rs:crvena-zvezda',
  'football:rs:partizan',
  'basketball:rs:crvena-zvezda',
  'basketball:rs:partizan',
];

// Ovi kontrolisani rasporedi imaju mečeve 4/5. oktobra. Zamrzni samo
// browser kalendar; Node rokovi i produkcioni sat ostaju stvarni.
const BROWSER_NOW = Date.parse('2026-10-01T12:00:00.000Z');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

async function freezeBrowserCalendar(page, initialNow = BROWSER_NOW) {
  await page.evaluateOnNewDocument((startNow) => {
    let now = startNow;
    const NativeDate = Date;
    globalThis.__advanceTime = (ms) => {
      now += ms;
      document.dispatchEvent(new Event('visibilitychange'));
    };
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
  }, initialNow);
}

async function advanceBrowserClock(page, ms = 20 * 60 * 1000) {
  await page.evaluate((duration) => {
    if (typeof globalThis.__advanceTime === 'function') {
      globalThis.__advanceTime(duration);
    }
  }, ms);
}

const apiState = {
  mode: 'verified',
  requests: [],
  throttledOnce: false,
};

function fixtureFor(teamId, overrides = {}) {
  const sport = teamId.startsWith('basketball') ? 'basketball' : 'football';
  const otherTeamId = sport === 'football'
    ? (teamId.includes('partizan') ? 'football:rs:crvena-zvezda' : 'football:rs:partizan')
    : (teamId.includes('partizan') ? 'basketball:rs:crvena-zvezda' : 'basketball:rs:partizan');
  return {
    id: `${sport}:primer-liga:Superliga:${SEASON}:primer-liga:fx-1`,
    sport,
    competitionId: 'Superliga',
    seasonId: SEASON,
    homeTeamId: teamId,
    awayTeamId: otherTeamId,
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
    revision: 1,
  });
}

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
      base.result.coverage[0].publication = 'allowed';
    }
  } else if (mode === 'revoked') {
    base.kind = 'source-blocked';
    base.result.checkedAt = null;
    base.result.lastSuccessAt = null;
    base.result.coverage = [
      {
        id: `${teamId}:Superliga:${SEASON}:primer-liga`, teamId, competitionId: 'Superliga', seasonId: SEASON,
        provider: 'primer-liga', providerCompetitionId: null, verdict: 'unverified', scheduleAvailability: 'unknown',
        freeAccessConfirmed: null, futureFixturesAvailable: null, timePrecision: null,
        postponementObserved: null, cancellationObserved: null, publication: 'forbidden',
        requestsPerRefresh: 0, evidence: 'Organizator uskratio pravo objave.', checkedAt: '2026-10-01',
      },
    ];
  } else if (mode === 'blocked') {
    const retained = fixtureFor(teamId);
    base.kind = 'source-blocked';
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

function startApiServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const origin = request.headers.origin ?? 'http://127.0.0.1';
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-headers', 'content-type,authorization');
    response.setHeader('access-control-allow-methods', 'POST,OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname !== '/api/find-fixtures' && url.pathname !== '/api/v1/find-fixtures') {
      response.writeHead(404).end('not found');
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf-8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'los-zahtev', message: 'Telo nije JSON.' } }));
      return;
    }
    const auth = request.headers.authorization ?? '';
    const hasBearer = auth.startsWith('Bearer ');
    const valid = ['football', 'basketball'].includes(body.sport)
      && TEAMS.includes(body.teamId)
      && body.seasonId === SEASON
      && typeof body.refresh === 'boolean';
    apiState.requests.push({
      at: Date.now(),
      body,
      valid,
      authorized: hasBearer,
      refresh: body.refresh,
      mode: apiState.mode,
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
    (expected) => (document.querySelector('main')?.dataset.screen === expected || document.querySelector('main')?.dataset.tab === expected)
      && document.querySelector('main h1') !== null,
    {},
    screen,
  );
}

async function openClubScheduleModal(page, clubName) {
  await page.waitForSelector('.club-list');
  const opened = await page.evaluate((wanted) => {
    const rows = [...document.querySelectorAll('li.club-row')];
    const match = rows.find((r) => (r.textContent ?? '').includes(wanted));
    if (!match) return false;
    const btn = match.querySelector('button.club-open');
    if (!btn) return false;
    btn.click();
    return true;
  }, clubName);
  if (!opened) throw new Error(`nema dugmeta Raspored za klub: ${clubName}`);
  await page.waitForSelector('section[aria-label="Raspored kluba"]');
}

async function clickFinderButton(page, label) {
  await page.evaluate((text) => {
    const section = document.querySelector('section[aria-label="Raspored kluba"]');
    if (!section) throw new Error('nema sekcije rasporeda kluba');
    const buttons = [...section.querySelectorAll('button')];
    const target = buttons.find((button) => (button.textContent ?? '').includes(text));
    if (!target) throw new Error(`nema dugmeta ${text}`);
    target.click();
  }, label);
}

async function closeModal(page, expectedRemaining = 0) {
  const initial = await page.$$eval('[data-modal-panel="true"]', (els) => els.length);
  if (initial === 0) return;
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (target) => document.querySelectorAll('[data-modal-panel="true"]').length === target,
    { timeout: 5000 },
    expectedRemaining,
  );
}

async function finderKind(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-schedule-kind]');
    if (el) return el.getAttribute('data-schedule-kind');
    const blockedWarning = [...document.querySelectorAll('section[aria-label="Raspored kluba"] p.warning')]
      .find((p) => p.textContent?.includes('Izvor je blokiran'));
    if (blockedWarning) return 'source-blocked';
    return null;
  });
}

async function bodyText(page) {
  return page.$eval('body', (element) => element.innerText);
}

/** Local Auth emulator only; never drive a live Google account. */
async function signInEmulator(browser, page, calendarExport = false) {
  if (!calendarExport) await page.waitForSelector('[data-screen="gate"]');
  const opened = new Promise((resolvePopup, rejectPopup) => {
    const timer = setTimeout(() => rejectPopup(new Error('Emulator popup nije otvoren')), 25000);
    const onTarget = async (target) => {
      try {
        if (target.type() !== 'page') return;
        const openedPage = await target.page();
        if (!openedPage) return;
        clearTimeout(timer);
        browser.off('targetcreated', onTarget);
        resolvePopup(openedPage);
      } catch { /* sledeći target */ }
    };
    browser.on('targetcreated', onTarget);
  });

  if (calendarExport) {
    await page.evaluate(() => {
      const button = document.querySelector('[data-modal-panel="true"] .modal-actions button.primary')
        ?? document.querySelector('[data-modal-panel="true"] button.primary');
      if (!button) throw new Error('Nema dugmeta potvrde dodavanja u kalendar');
      button.click();
    });
  } else {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        (item.textContent ?? '').includes('Nastavi sa Google') || (item.textContent ?? '').includes('Prijavi se Google')
      );
      if (!button) throw new Error('Nema dugmeta prijave');
      button.click();
    });
  }

  const popup = await opened;
  await popup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
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
    const buttons = [...document.querySelectorAll('button')].filter((item) => (item.innerText ?? '').includes('Sign in with Google.com') || (item.innerText ?? '').includes('Sign in'));
    const button = buttons.find((item) => item.offsetParent !== null) ?? buttons[0];
    if (button) button.click();
  });

  if (calendarExport) {
    await page.waitForFunction(
      () => {
        const text = document.querySelector('[data-modal-panel="true"] [role=status]')?.textContent ?? '';
        const barText = document.querySelector('.calendar-bar [role=status]')?.textContent ?? '';
        const combined = `${text} ${barText}`;
        return combined.includes('Dodato:') || combined.includes('nije dobijena') || combined.includes('Greška') || combined.includes('Već u kalendaru:');
      },
      { timeout: 20000 },
    );
    const dump = await page.evaluate(() => {
      const statuses = [...document.querySelectorAll('[role=status]')].map(s => s.textContent);
      return statuses.join(' | ');
    });
    console.log('STATUSES IN PAGE:', dump);
  } else {
    await page.waitForFunction(() => document.querySelector('nav') !== null, { timeout: 20000 });
  }
  if (!popup.isClosed()) await popup.close();
}

async function waitForRequests(count, timeoutMs = 15000) {
  const started = Date.now();
  while (apiState.requests.length < count) {
    if (Date.now() - started > timeoutMs) throw new Error(`isteklo čekanje na ${count} zahteva; trenutno: ${apiState.requests.length}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security'],
});

try {
  const page = await browser.newPage();
  await freezeBrowserCalendar(page);
  page.setDefaultTimeout(15000);
  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

  await page.goto(`${originUI}/repo/#/klubovi`, { waitUntil: 'load' });
  await signInEmulator(browser, page);
  await page.waitForSelector('.club-list');
  assert((await bodyText(page)).includes('Klubovi'), 'nema ekrana klubova');
  assert(await overflow(page) <= 1, 'preliv pre pronalaženja');

  // 1. Otvori raspored za Crvenu zvezdu u modalnom panelu
  await openClubScheduleModal(page, 'Crvena zvezda');
  assert((await bodyText(page)).includes('Raspored kluba') || (await bodyText(page)).includes('Pronađi utakmice'), 'nema sekcije rasporeda');
  assert((await finderKind(page)) === null, 'rezultat postoji pre klika');
  console.log('PASS: sekcija rasporeda u modalnom panelu kluba, bez poziva pre klika');

  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  const provenance = await page.$eval('[data-schedule-kind]', (element) => element.dataset.provenance);
  assert(provenance === CHECKED_AT, `poreklo nije tačno: ${provenance}`);
  assert((await bodyText(page)).includes('Termin nije potvrđen'), 'nepoznat termin nije označen');

  // Otvori detalje utakmice da proveriš izvor
  await page.evaluate(() => {
    const firstMatch = document.querySelector('section[aria-label="Raspored kluba"] .match-open');
    if (firstMatch) firstMatch.click();
  });
  await page.waitForSelector('[data-source-url]');
  const sourceUrl = await page.$eval('[data-source-url]', (link) => link.dataset.sourceUrl);
  assert(sourceUrl.startsWith('https://primer-liga.example/'), `izvor nije tačan: ${sourceUrl}`);
  await closeModal(page, 1); // zatvara detalje utakmice

  // Otvori "O rasporedu" modal
  await clickFinderButton(page, 'O rasporedu');
  await page.waitForFunction(() => document.body.innerText.includes('Neobjavljeno'));
  assert((await bodyText(page)).includes('Neobjavljeno'), 'nema neobjavljenog takmičenja u opisu');
  await closeModal(page, 1); // zatvara O rasporedu modal

  assert(await overflow(page) <= 1, 'preliv posle pronalaženja');
  console.log('PASS: pronalaženje — lista, izvori, neobjavljeno, nepoznat termin, tačno poreklo');

  const refreshDisabled = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('section[aria-label="Raspored kluba"] button')];
    return buttons.find((button) => (button.textContent ?? '').includes('Osveži'))?.disabled ?? null;
  });
  assert(refreshDisabled === true, 'osvežavanje nije zaključano kuldaunom');
  assert((await bodyText(page)).includes('Osvežavanje je moguće za'), 'nema kuldaun poruke');
  assert((await finderKind(page)) === 'verified-schedule', 'kuldaun promenio prikaz');
  console.log('PASS: kuldaun osvežavanja poštuje najkraći razmak');

  // 2. Testovi otpornosti uz stvarno pomeranje sata (20 min) i slanje zahteva
  // Pad servera 500
  apiState.mode = 'error500';
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  let countBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(countBefore + 1);
  await page.waitForSelector('[role="alert"]');
  assert((await finderKind(page)) === 'verified-schedule', 'pad servera obrisao provereno stanje');
  console.log('PASS: pad servera čuva poslednji dobar prikaz uz poruku greške');

  // Pogrešan odgovor servera (malformed)
  apiState.mode = 'malformed';
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  countBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(countBefore + 1);
  await page.waitForSelector('[role="alert"]');
  assert((await finderKind(page)) === 'verified-schedule', 'pogrešan odgovor obrisao prikaz');
  console.log('PASS: pogrešan odgovor servera je greška, prikaz sačuvan');

  // Blokiran izvor (source-blocked)
  apiState.mode = 'blocked';
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  countBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(countBefore + 1);
  await page.waitForFunction(
    () => document.body.innerText.includes('Izvor je blokiran')
      || document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'source-blocked',
  );
  assert((await finderKind(page)) === 'source-blocked', 'blokada nije prikazala source-blocked');
  console.log('PASS: source-blocked — pokrivenost, razlog, zadržana utakmica');

  // Sintetički odgovor (demo) je odbijen
  apiState.mode = 'demo';
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  countBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(countBefore + 1);
  await page.waitForFunction(() => document.body.innerText.includes('nije prihvaćen'));
  assert((await finderKind(page)) === 'source-blocked', 'sintetički odgovor zamenio sačuvano stanje');
  console.log('PASS: sintetički odgovor je odbijen, sačuvano stanje ostaje');

  // Vrati Crvenu zvezdu na verified
  apiState.mode = 'verified';
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  countBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(countBefore + 1);
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  await closeModal(page, 0); // zatvori modal Zvezde

  // 3. Partizan: pronađi raspored
  await openClubScheduleModal(page, 'Partizan');
  apiState.mode = 'verified';
  await clickFinderButton(page, 'Pronađi utakmice');
  await page.waitForFunction(
    () => document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'verified-schedule',
  );
  await closeModal(page, 0);
  console.log('PASS: pronalaženje drugog kluba (Partizan)');

  // 4. Prati oba fudbalska kluba
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.club-list button')];
    buttons.filter((button) => (button.textContent ?? '').trim() === 'Prati').forEach((button) => button.click());
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.club-list button')].filter((button) => (button.textContent ?? '').includes('Pratim')).length >= 2,
  );

  // 5. Prelazak na Utakmice: jedinstvena unificirana agenda
  await openRoute(page, '#/', 'home');
  await page.waitForSelector('[data-server-agenda="unified"]');
  assert((await bodyText(page)).includes('Utakmice'), 'nema agende');

  // Derbi je najraniji: u unificiranoj agendi postoji tačno jednom sa oznakom "Sledeća"
  const derbyCount = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.agenda-list .match-row')];
    return rows.filter((r) => r.getAttribute('data-fixture-id')?.includes('fx-derby')).length;
  });
  assert(derbyCount === 1, `derbi se vidi ${derbyCount} puta, mora tačno jednom`);
  const hasNextBadge = await page.evaluate(() => {
    const derbyRow = [...document.querySelectorAll('.agenda-list .match-row')].find((r) => r.getAttribute('data-fixture-id')?.includes('fx-derby'));
    return Boolean(derbyRow?.querySelector('.next-badge'));
  });
  assert(hasNextBadge, 'najraniji derbi nema Sledeća bedž');
  assert(await overflow(page) <= 1, 'preliv na početnoj sa server agendom');
  console.log('PASS: početna — unificirana agenda, derbi jednom, bedž Sledeća');

  // 6. Google Calendar export režim sa stvarnim popup tokom i Puppeteer presretanjem API poziva
  const calendarEvents = new Map();
  let calendarPosts = 0;
  let failSecondOnce = true;
  let duplicatePosts = 0;
  let duplicateGets = 0;

  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (!request.url().startsWith('https://www.googleapis.com/calendar/v3/')) {
      await request.continue();
      return;
    }
    console.log('INTERCEPTED CALENDAR REQ:', request.method(), request.url());
    const reqOrigin = request.headers().origin || `http://127.0.0.1:${staticUI.port}`;
    const headers = {
      'access-control-allow-origin': reqOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await request.respond({ status: 200, headers, body: '' });
      return;
    } else if (request.method() === 'GET') {
      duplicateGets += 1;
      const id = new URL(request.url()).pathname.split('/').at(-1);
      await request.respond({ status: calendarEvents.has(id) ? 200 : 404, headers, body: JSON.stringify(calendarEvents.get(id) ?? {}) });
      return;
    } else if (request.method() === 'POST') {
      calendarPosts += 1;
      assert(Boolean(request.headers().authorization), 'calendar request nema OAuth header');
      const event = JSON.parse(request.postData());
      if (failSecondOnce && calendarPosts === 2) {
        failSecondOnce = false;
        await request.respond({ status: 500, headers, body: '{}' });
      } else if (calendarEvents.has(event.id)) {
        duplicatePosts += 1;
        await request.respond({ status: 409, headers, body: '{}' });
      } else {
        calendarEvents.set(event.id, event);
        await request.respond({ status: 200, headers, body: JSON.stringify(event) });
      }
      return;
    } else {
      await request.respond({ status: 405, headers, body: '{}' });
      return;
    }
  });

  // Uključi režim izbora klikom na „Izaberi”
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
    if (btn) btn.click();
  });
  await page.waitForSelector('.agenda-actions button[aria-pressed="true"]');
  // Klik na „Izaberi sve”
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi sve'));
    if (btn) btn.click();
  });
  await page.waitForSelector('.calendar-bar');
  const selectedText = await page.$eval('.calendar-bar p', (p) => p.textContent);
  assert(selectedText.includes('izabrano'), `traka nema broj izabranih: ${selectedText}`);

  // Klik na „Dodaj u kalendar” u traci da otvori modal
  await page.evaluate(() => {
    const btn = document.querySelector('.calendar-bar button.primary');
    if (btn) btn.click();
  });
  await page.waitForSelector('[data-modal-panel="true"]');
  assert((await bodyText(page)).includes('Dodaj u kalendar'), 'nema modala dodavanja');

  // Unos opcione beleške
  await page.type('#draft-note', 'Provera beleške');

  // Prvi upis kroz stvarni OAuth emulator prozor (failSecondOnce izaziva parcijalni neuspeh)
  await signInEmulator(browser, page, true);
  assert(calendarEvents.size === 1, `delimičan upis: events=${calendarEvents.size}, posts=${calendarPosts}`);
  console.log('PASS: delimičan upis u kalendar prekinut na prvoj grešci, prva utakmica uspešna');

  // Ponovni pokušaj za preostale
  await signInEmulator(browser, page, true);
  assert(calendarEvents.size === 3, `ponovni pokušaj nije dodao preostale događaje: ${calendarEvents.size}`);
  assert([...calendarEvents.values()].every((event) => event.description?.includes('Provera beleške')), 'beleška nije preneta u događaje');
  const fallbackEvent = [...calendarEvents.values()].find((event) => event.description?.includes('Vreme nije poznato'));
  assert(fallbackEvent && new Date(fallbackEvent.start.dateTime).getUTCHours() === 15, 'nepoznata satnica nije 17h u Beogradu (15h UTC)');

  // Zatvori modal ako je još otvoren
  await closeModal(page, 0).catch(() => {});

  // Ponovljeni izbor svih: provera 409 Conflict i GET poziva bez duplikata
  const sizeBefore = calendarEvents.size;
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi sve'));
    if (btn) btn.click();
  });
  await page.evaluate(() => {
    const btn = document.querySelector('.calendar-bar button.primary');
    if (btn) btn.click();
  });
  await page.waitForSelector('[data-modal-panel="true"]');
  await signInEmulator(browser, page, true);
  assert(duplicatePosts === 3, `nema 409 POST poziva pri duplikatu: ${duplicatePosts}`);
  assert(duplicateGets === 3, `nema GET provere postojećeg događaja: ${duplicateGets}`);
  assert(calendarEvents.size === sizeBefore, 'ponovljeni izbor napravio duplikate');
  await closeModal(page, 0).catch(() => {});

  await page.setRequestInterception(false);
  await page.setBypassServiceWorker(false);
  page.removeAllListeners('request');
  console.log('PASS: kalendar — izbor svih, beleška, delimičan uspeh, nastavak, 17h, 409 conflict i potvrđeni GET pozivi bez duplikata');

  // Isključi režim izbora
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
    if (btn) btn.click();
  });

  // 7. Provera filtera
  // Filter po sportu Košarka
  await page.evaluate(() => {
    const sports = [...document.querySelectorAll('.agenda-filters button')];
    const b = sports.find((btn) => (btn.textContent ?? '').includes('Košarka'));
    if (b) b.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await bodyText(page)).includes('Nema utakmica za ovaj izbor.'), 'filter košarke nije ispraznio agendu');

  // Poništi filter
  await page.evaluate(() => {
    const sports = [...document.querySelectorAll('.agenda-filters button')];
    const b = sports.find((btn) => (btn.textContent ?? '').trim() === 'Sve');
    if (b) b.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert((await bodyText(page)).includes('FK Crvena zvezda') && (await bodyText(page)).includes('FK Partizan'), 'vraćanje na Sve nije vratilo derbi');

  // Filteri modal
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Filteri'));
    if (btn) btn.click();
  });
  await page.waitForSelector('[data-modal-panel="true"] select#agenda-club');
  await page.select('#agenda-club', 'football:rs:partizan');
  await closeModal(page, 0);
  assert((await bodyText(page)).includes('FK Crvena zvezda') && (await bodyText(page)).includes('FK Partizan'), 'filter kluba Partizan sakrio derbi');

  // Poništi filtere
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Poništi'));
    if (btn) btn.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log('PASS: filteri — sport, klub modal i dugme Poništi');

  // 8. 360px širina bez preliva
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  assert(await overflow(page) <= 1, 'preliv na 360px početnoj');
  assert((await bodyText(page)).includes('Utakmice'), 'agenda nije vidljiva na 360px');
  console.log('PASS: 360px širina bez preliva');

  // 9. Rad van mreže (offline)
  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForFunction(() => document.body.innerText.includes('Van mreže'));
  assert((await bodyText(page)).includes('Van mreže'), 'nema offline upozorenja u agendi');
  assert((await bodyText(page)).includes('FK Crvena zvezda'), 'offline obrisao sačuvane utakmice');

  await openRoute(page, '#/klubovi', 'clubs');
  await openClubScheduleModal(page, 'Crvena zvezda');
  const offlineBefore = apiState.requests.length;
  await page.waitForFunction(() => document.body.innerText.includes('Van mreže'));
  assert((await bodyText(page)).includes('Van mreže'), 'nema offline poruke');
  assert((await finderKind(page)) === 'verified-schedule', 'offline obrisao prikaz');
  assert(apiState.requests.length === offlineBefore, 'offline pozvao server');
  await closeModal(page, 0);

  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  console.log('PASS: rad van mreže čuva sačuvani raspored i prikazuje upozorenje');

  // 10. Opoziv: allowed snimci pa forbidden briše izvor iz svih snimaka
  apiState.mode = 'verified-allowed';
  await openRoute(page, '#/klubovi', 'clubs');
  await openClubScheduleModal(page, 'Crvena zvezda');
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  let pendingBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(pendingBefore + 1);
  await closeModal(page, 0);

  apiState.mode = 'revoked';
  await openClubScheduleModal(page, 'Crvena zvezda');
  await advanceBrowserClock(page, 20 * 60 * 1000);
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Raspored kluba"] button.primary')?.disabled);
  pendingBefore = apiState.requests.length;
  await clickFinderButton(page, 'Osveži');
  await waitForRequests(pendingBefore + 1);
  await page.waitForFunction(
    () => document.body.innerText.includes('Izvor je blokiran')
      || document.querySelector('[data-schedule-kind]')?.getAttribute('data-schedule-kind') === 'source-blocked',
  );
  await closeModal(page, 0);

  // Proveri da je opozvani izvor obrisan iz oba kluba i agende
  await openRoute(page, '#/', 'home');
  const rowsAfterRevoke = await page.$$eval('.agenda-list .match-row', (rows) => rows.length);
  assert(rowsAfterRevoke === 0 || (await bodyText(page)).includes('Nema praćenih utakmica'), 'opoziv nije očistio agendu');
  console.log('PASS: opoziv prava objave briše izvor iz svih klupskih snimaka i agende');

  // 11. Provera broja i ispravnosti API zahteva
  const sawValid = apiState.requests.filter((entry) => entry.valid);
  assert(sawValid.length >= 8, `server video premalo zahteva: ${sawValid.length}`);
  assert(sawValid.every((entry) => entry.authorized === true), 'prijavljen klijent nije poslao Authorization');
  console.log('PASS: svi zahtevi nose Authorization zaglavlje uz emulator token');

  // 12. Nekonfigurisan server je pošteno onemogućen
  const plain = await browser.newPage();
  await freezeBrowserCalendar(plain);
  plain.setDefaultTimeout(15000);
  await plain.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await plain.goto(`${originNoCfg}/repo/#/klubovi`, { waitUntil: 'load' });
  await signInEmulator(browser, plain);
  await openClubScheduleModal(plain, 'Crvena zvezda');
  assert((await bodyText(plain)).includes('nije podešen'), 'onemogućeno stanje nije pošteno');
  const disabled = await plain.evaluate(() => {
    const btn = document.querySelector('section[aria-label="Raspored kluba"] button.primary');
    return btn?.disabled === true;
  });
  assert(disabled, 'dugme nije onemogućeno kada server nije podešen');
  console.log('PASS: nekonfigurisan server je pošteno onemogućen');
} finally {
  await browser.close();
  staticUI.server.close();
  staticNoCfg.server.close();
  api.server.close();
}
console.log('SVE PROVERE RASPOREDA SU PROŠLE');
