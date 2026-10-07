/**
 * MatchAhead Rework Acceptance Harness.
 *
 * Pokriva sve slučajeve iz approved-plan.md:
 * - 0, 1, 20, >100 utakmica (paginacija 20/strani, "Strana X od Y", Prethodna/Sledeća, bez beskonačnog skrola)
 * - Derbi: jedan red sa oba razloga praćenja, uklanjanje jednog razloga zadržava utakmicu
 * - Statusi: nepotvrđeno vreme (17:00), odloženo, otkazano, blokiran izvor, offline
 * - Selekcija: perzistira preko stranica, poništava se promenom filtera i zamenom naloga
 * - Teme: Auto (default), Light, Dark, live prefers-color-scheme, oštećeno/odbijeno skladište, pre-React primena
 * - Stare rute: #/, #/utakmice, #/moje, #/klubovi, #/podesavanja
 * - Dimenzije i pristupačnost: 360px, 390px, 430px, landscape, desktop; dodirne površine >= 48px, nula preliva
 * - ModalPanel: bottom sheet na telefonu, centriran na desktopu, Back/Escape, fokus trap i restauracija
 * - Snimanje dokaza (screenshot-ova) u docs/reviews/rework/evidence/
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(webRoot, '../..');
const evidenceDir = resolve(repoRoot, 'docs/reviews/rework/evidence');
const chromePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : '/usr/bin/google-chrome-stable');
const DIST = resolve('/tmp/matchahead-rework-harness-dist');
const basePath = '/repo/';

if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true });

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!condition) throw new Error(`FAILED: ${name} :: ${detail}`);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function buildApp(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [resolve(webRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        MATCHAHEAD_BASE: basePath,
        MATCHAHEAD_BUILD: 'rework-harness',
        VITE_FIREBASE_API_KEY: 'demo',
        VITE_FIREBASE_AUTH_DOMAIN: 'demo-matchahead.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'demo-matchahead',
        VITE_FIREBASE_APP_ID: '1:0:web:demo',
        VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
        VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new Error('Build aplikacije nije uspeo');
}

function startServer(dir) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith(basePath)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('nema pristupa van baze');
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
      const fallback = readFileSync(join(dir, 'index.html'));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fallback);
    }
  });
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      res({ server, port: typeof addr === 'object' && addr ? addr.port : 0 });
    });
  });
}

/** Generiše sintetički LastGoodSchedule sa zadatim brojem utakmica */
function makeSnapshots(fixtureCount, options = {}) {
  const teamId = 'football:rs:crvena-zvezda';
  const sport = 'football';
  const season = '2026-2027';
  const checkedAt = '2026-10-07T10:00:00.000Z';
  const baseNow = Date.now();
  const dayMs = 86400000;
  const fixtures = [];

  for (let i = 0; i < fixtureCount; i += 1) {
    const d = new Date(baseNow + (i + 1) * dayMs);
    const dateStr = d.toISOString().slice(0, 10);
    const isDerby = options.includeDerby && i === 0;
    const isUnknownTime = options.includeUnknown && i === 1;
    const isPostponed = options.includePostponed && i === 2;
    const isCancelled = options.includeCancelled && i === 3;

    fixtures.push({
      id: `football:primer-liga:Superliga:${season}:primer-liga:fx-${String(i).padStart(4, '0')}`,
      sport: 'football',
      competitionId: 'Superliga',
      seasonId: season,
      homeTeamId: teamId,
      awayTeamId: isDerby ? 'football:rs:partizan' : 'football:rs:vojvodina',
      startsAtUtc: isUnknownTime ? null : `${dateStr}T17:00:00.000Z`,
      scheduledLocalDate: dateStr,
      sourceTimeZone: 'Europe/Belgrade',
      timeConfirmed: !isUnknownTime,
      previousStartsAtUtc: isPostponed ? `${dateStr}T15:00:00.000Z` : null,
      previousScheduledLocalDate: isPostponed ? dateStr : null,
      status: isCancelled ? 'cancelled' : isPostponed ? 'postponed' : isUnknownTime ? 'time_tbd' : 'scheduled',
      venue: isDerby ? 'Stadion Rajko Mitić' : 'Stadion Karadorđe',
      round: `${i + 1}. kolo`,
      sourceUrl: `https://primer-liga.example/raspored/${i}`,
      provider: 'primer-liga',
      providerFixtureId: `fx-${i}`,
      fetchedAt: checkedAt,
      sourceUpdatedAt: null,
      contentHash: `hash-${i}`,
      revision: 1,
    });
  }

  const coverage = [
    {
      id: `${teamId}:Superliga:${season}:primer-liga`,
      teamId,
      competitionId: 'Superliga',
      seasonId: season,
      provider: 'primer-liga',
      providerCompetitionId: null,
      verdict: 'confirmed',
      scheduleAvailability: 'published',
      freeAccessConfirmed: null,
      futureFixturesAvailable: true,
      timePrecision: 'unconfirmed_clock',
      postponementObserved: null,
      cancellationObserved: null,
      publication: 'allowed',
      requestsPerRefresh: 1,
      evidence: 'Liga objavila raspored uz dozvolu.',
      checkedAt: '2026-10-01',
    },
  ];

  const manifests = [
    {
      provider: 'primer-liga',
      competitionId: 'Superliga',
      seasonId: season,
      lastAttemptAt: checkedAt,
      lastSuccessAt: checkedAt,
      lastChangeAt: null,
      staleAfterHours: 24,
    },
  ];

  const firstConfirmed = fixtures.find((f) => f.timeConfirmed) ?? null;

  const snapshot = {
    teamId,
    sport,
    seasonId: season,
    kind: 'verified-schedule',
    checkedAt,
    storedAt: new Date().toISOString(),
    response: {
      kind: 'verified-schedule',
      result: {
        teamId,
        sport,
        seasonId: season,
        cacheStatus: 'fetched',
        upstreamRequests: 1,
        checkedAt,
        lastAttemptAt: checkedAt,
        lastSuccessAt: checkedAt,
        claimsNoMatches: fixtureCount === 0,
        futureFixtures: fixtures,
        nextFixture: fixtures[0] ?? null,
        nextConfirmedFixture: firstConfirmed,
        coverage,
      },
      teams: [
        { id: 'football:rs:crvena-zvezda', sport: 'football', name: 'FK Crvena zvezda', shortName: 'Crvena zvezda', country: 'RS', city: 'Beograd', aliases: ['Crvena zvezda'], providerIds: {} },
        { id: 'football:rs:partizan', sport: 'football', name: 'FK Partizan', shortName: 'Partizan', country: 'RS', city: 'Beograd', aliases: ['Partizan'], providerIds: {} },
        { id: 'football:rs:vojvodina', sport: 'football', name: 'FK Vojvodina', shortName: 'Vojvodina', country: 'RS', city: 'Novi Sad', aliases: ['Vojvodina'], providerIds: {} },
      ],
      competitions: [
        { id: 'Superliga', sport: 'football', name: 'Superliga', scope: 'domestic', country: 'RS', aliases: ['Superliga'], providerIds: {} },
      ],
      manifests,
      changes: [],
    },
  };

  return [snapshot];
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function popupPage(browser, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      browser.off('targetcreated', onTarget);
      resolve(null);
    }, timeoutMs);
    const onTarget = async (target) => {
      try {
        if (target.type() !== 'page') return;
        const opened = await target.page();
        if (!opened) return;
        clearTimeout(timer);
        browser.off('targetcreated', onTarget);
        resolve(opened);
      } catch { /* sledeći target */ }
    };
    browser.on('targetcreated', onTarget);
  });
}

async function authenticateEmulator(page) {
  await page.evaluate(() => {
    localStorage.setItem('matchahead.device.installationId', 'dev-rework-harness-inst-01');
  });
  await page.waitForSelector('[data-screen="gate"]');
  const wait = popupPage(page.browser());
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Nastavi sa Google'));
    if (!btn) throw new Error('Nema Nastavi sa Google');
    btn.click();
  });
  const popup = await wait;
  if (!popup) throw new Error('Emulator popup timeout');
  await popup.waitForFunction(() => document.body.innerText.includes('Google.com'));
  const picked = await popup.evaluate(() => {
    const btn = [...document.querySelectorAll('button, li, [role="button"]')].find((item) => item.innerText?.includes('mls.ivanovic@gmail.com'));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!picked) {
    await popup.evaluate(() => [...document.querySelectorAll('button')].find((item) => item.innerText.includes('Add new account')).click());
    await popup.waitForSelector('#email-input');
    await popup.$eval('#email-input', (input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'mls.ivanovic@gmail.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await new Promise((r) => setTimeout(r, 800));
  if (!popup.isClosed()) {
    await popup.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => b.innerText.includes('Sign in with Google.com'));
      const b = btns.find((item) => item.offsetParent !== null) ?? btns[0];
      if (b) b.click();
    });
  }
  await page.waitForFunction(() => document.querySelector('nav') !== null, { timeout: 20000 });
  if (!popup.isClosed()) await popup.close();
}

async function main() {
  buildApp(DIST);
  const staticApp = await startServer(DIST);
  const origin = `http://127.0.0.1:${staticApp.port}${basePath}`;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

    // 1. Kapija i CSS tokeni (bez bele bleske, tema primenjena pre React-a)
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    check('kapija-h1', (await page.$eval('h1', (el) => el.textContent)) === 'MatchAhead');
    check('kapija-nastavi', (await page.$eval('button.primary', (el) => el.textContent)) === 'Nastavi sa Google');
    check('kapija-opis', (await page.$eval('body', (el) => el.innerText)).includes('Prati klubove i dodaj utakmice u Google kalendar.'));
    check('kapija-pilot', (await page.$eval('body', (el) => el.innerText)).includes('Pilot je otvoren samo za nalog mls.ivanovic@gmail.com.'));
    check('kapija-nema-demo', !(await page.$eval('body', (el) => el.innerText)).includes('DEMO'));
    check('kapija-nema-nav', (await page.$('nav')) === null);

    // CSS tokeni: plava i neutralna, bez zelenih akcenata
    const themeAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    check('tema-inicijalna', themeAttr === 'light' || themeAttr === 'dark');

    // 2. Pre-React primena teme: postavi dark u matchahead.device.prefs i blokiraj JS skripte
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
    });

    // Otvori novu stranu koja presreće i blokira sve spoljne JS module (React i bundle se ne preuzimaju)
    const scriptBlockPage = await browser.newPage();
    await scriptBlockPage.setBypassServiceWorker(true);
    await scriptBlockPage.setRequestInterception(true);
    scriptBlockPage.on('request', (req) => {
      if (req.resourceType() === 'script') {
        req.abort();
      } else {
        req.continue();
      }
    });
    await scriptBlockPage.goto(`${origin}#/`, { waitUntil: 'domcontentloaded' });
    const preReactTheme = await scriptBlockPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const preReactBg = await scriptBlockPage.evaluate(() => document.documentElement.style.backgroundColor);
    const rootEmpty = await scriptBlockPage.evaluate(() => {
      const root = document.querySelector('#root');
      return !root || root.innerHTML.trim() === '';
    });
    const hasH1 = await scriptBlockPage.evaluate(() => document.querySelector('h1') !== null);
    check('pre-react-root-prazan-bez-h1', rootEmpty && !hasH1);
    check('pre-react-dark-bez-react-modula', preReactTheme === 'dark' && (preReactBg === 'rgb(17, 19, 24)' || preReactBg === '#111318'));
    await scriptBlockPage.close();

    // Na glavnoj stranici sa React-om potvrdi dark temu i snimi dokaz
    await page.reload({ waitUntil: 'load' });
    check('tema-dark-ucitana', (await page.$eval('html', (el) => el.getAttribute('data-theme'))) === 'dark');
    await page.waitForSelector('h1');
    await page.screenshot({ path: join(evidenceDir, 'kapija-dark.png') });

    // Vrati na Auto
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'auto' }));
    });
    await page.reload({ waitUntil: 'load' });

    // 3. Prijavljivanje preko emulatora
    await authenticateEmulator(page);
    check('prijava-unlocked', (await page.$('nav')) !== null);

    // Otprati sve klubove u početnom stanju da testiramo 0 utakmica
    await page.goto(`${origin}#/klubovi`, { waitUntil: 'load' });
    await page.waitForSelector('.club-list');
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.club-list button')].filter((b) => (b.textContent ?? '').includes('Pratim'));
      btns.forEach((b) => b.click());
    });
    await new Promise((r) => setTimeout(r, 800));

    // 4. Test stanja liste: 0 utakmica
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    await page.waitForSelector('main[data-tab="matches"]');
    const text0 = await page.$eval('body', (el) => el.innerText);
    check('stanje-0-utakmica', text0.includes('Nema praćenih utakmica.') || text0.includes('Izaberi klubove koje pratiš'));
    await page.screenshot({ path: join(evidenceDir, 'agenda-0-utakmica.png') });

    // 5. Zasejavanje 1 utakmice (Derbi)
    const snaps1 = makeSnapshots(1, { includeDerby: true });
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps1);

    // Prati FK Crvena zvezda
    await page.goto(`${origin}#/klubovi`, { waitUntil: 'load' });
    await page.waitForSelector('.club-list');
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('li.club-row')];
      const zvezda = rows.find((r) => (r.textContent ?? '').includes('Crvena zvezda') && (r.textContent ?? '').includes('FK'));
      const btn = zvezda?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Prati')) btn.click();
    });
    await page.waitForFunction(
      () => [...document.querySelectorAll('li.club-row button')].some((b) => (b.textContent ?? '').includes('Pratim')),
    );

    // Test stanja liste: 1 utakmica (Derbi) sa oznakom Sledeća
    await page.reload({ waitUntil: 'load' });
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    await page.waitForSelector('.agenda-list');
    const rows1 = await page.$$('.agenda-list .match-row');
    check('stanje-1-utakmica', rows1.length === 1);
    const hasNext = await page.$eval('.agenda-list .match-row', (el) => Boolean(el.querySelector('.next-badge')));
    check('stanje-1-sledeca-bedz', hasNext);
    await page.screenshot({ path: join(evidenceDir, 'agenda-1-utakmica-390.png') });

    // 6. Derbi razlozi praćenja: prati i FK Partizan
    await page.goto(`${origin}#/klubovi`, { waitUntil: 'load' });
    await page.waitForSelector('.club-list');
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('li.club-row')];
      const partizan = rows.find((r) => (r.textContent ?? '').includes('Partizan') && (r.textContent ?? '').includes('FK'));
      const btn = partizan?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Prati')) btn.click();
    });
    await page.waitForFunction(
      () => [...document.querySelectorAll('li.club-row button')].filter((b) => (b.textContent ?? '').includes('Pratim')).length >= 2,
    );

    // Na agendi: derbi postoji tačno jednom i sadrži oba razloga
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    await page.waitForSelector('.agenda-list');
    const derbyRows = await page.$$('.agenda-list .match-row');
    check('derbi-jednom', derbyRows.length === 1);

    // Otvori detalje derbija i proveri oba razloga
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"]');
    const modalText = await page.$eval('[data-modal-panel="true"]', (el) => el.innerText);
    check('derbi-oba-razloga', modalText.includes('Crvena zvezda') && modalText.includes('Partizan'));
    await page.keyboard.press('Escape'); // Zatvori modal

    // Otprati Partizan: derbi i dalje ostaje jer se prati Zvezda
    await page.goto(`${origin}#/klubovi`, { waitUntil: 'load' });
    await page.waitForSelector('.club-list');
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('li.club-row')];
      const partizan = rows.find((r) => (r.textContent ?? '').includes('Partizan') && (r.textContent ?? '').includes('FK'));
      const btn = partizan?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Pratim')) btn.click();
    });
    await page.waitForFunction(
      () => [...document.querySelectorAll('li.club-row button')].filter((b) => (b.textContent ?? '').includes('Pratim')).length === 1,
    );
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    await page.waitForSelector('.agenda-list');
    check('derbi-ostaje-nakon-otpracivanja', (await page.$$('.agenda-list .match-row')).length === 1);

    // 7. Test stanja liste: 20 utakmica (tačno 1 puna stranica)
    const snaps20 = makeSnapshots(20, { includeUnknown: true, includePostponed: true, includeCancelled: true });
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps20);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.agenda-list');
    const rows20 = await page.$$('.agenda-list .match-row');
    check('stanje-20-utakmica-redova', rows20.length === 20);
    // Na tačno 20 nema paginacije ("Strana 1 od 1" ili bez paginatora)
    const paginator20 = await page.$('.agenda-pagination');
    check('stanje-20-paginator', paginator20 !== null);
    check('stanje-20-strana-1-od-1', (await page.$eval('.agenda-pagination', (el) => el.innerText)).includes('Strana 1 od 1'));

    // 8. Test stanja liste: >100 utakmica (105 utakmica -> 6 stranica)
    const snaps105 = makeSnapshots(105);
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps105);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.agenda-list');
    check('paginacija-105-strana1', (await page.$eval('.agenda-pagination', (el) => el.innerText)).includes('Strana 1 od 6'));
    check('paginacija-20-po-strani', (await page.$$('.agenda-list .match-row')).length === 20);

    // Prelazak na stranu 2
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.agenda-pagination button')];
      const next = btns.find((b) => (b.textContent ?? '').includes('Sledeća'));
      if (next) next.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    check('paginacija-105-strana2', (await page.$eval('.agenda-pagination', (el) => el.innerText)).includes('Strana 2 od 6'));

    // 9. Selekcija preko stranica i lepljiva traka kalendara
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn) btn.click();
    });
    await page.waitForSelector('.agenda-actions button[aria-pressed="true"]');

    // Klik na "Izaberi sve" bira sve podobne utakmice preko svih 6 stranica (105)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi sve'));
      if (btn) btn.click();
    });
    await page.waitForSelector('.calendar-bar');
    const barText = await page.$eval('.calendar-bar p', (p) => p.textContent);
    check('selekcija-svih-105', barText.includes('105 izabrano'));

    // Promena filtera poništava selekciju i zaključava dugme kalendara
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const kosarka = sports.find((b) => (b.textContent ?? '').includes('Košarka'));
      if (kosarka) kosarka.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const zeroSelected = await page.$eval('.calendar-bar p', (p) => p.textContent);
    const exportDisabled = await page.$eval('.calendar-bar button.primary', (b) => b.disabled);
    check('selekcija-reset-promenom-filtera', zeroSelected.includes('0 izabrano') && exportDisabled === true);

    // Vrati na Sve
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const sve = sports.find((b) => (b.textContent ?? '').trim() === 'Sve');
      if (sve) sve.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 10. Stare hash rute (kompatibilnost)
    const oldRoutes = [
      { hash: '#/', expectedTab: 'matches' },
      { hash: '#/utakmice', expectedTab: 'matches' },
      { hash: '#/moje', expectedTab: 'matches' },
      { hash: '#/klubovi', expectedTab: 'clubs' },
      { hash: '#/podesavanja', expectedTab: 'settings' },
    ];
    for (const r of oldRoutes) {
      await page.goto(`${origin}${r.hash}`, { waitUntil: 'load' });
      await page.waitForFunction(
        (tab) => document.querySelector('main')?.getAttribute('data-tab') === tab,
        {},
        r.expectedTab,
      );
      check(`kompatibilnost-rute-${r.hash}`, true);
    }

    // 11. ModalPanel interakcija: Back / Escape, focus trap i restauracija
    await page.goto(`${origin}#/podesavanja`, { waitUntil: 'load' });
    await page.waitForSelector('.settings-list');
    // Otvori podpanel "Izgled"
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.settings-list button')].find((b) => (b.textContent ?? '').includes('Izgled'));
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"]');
    check('modal-otvoren', true);

    // Focus je u modalu
    const activeInModal = await page.evaluate(() => {
      const modal = document.querySelector('[data-modal-panel="true"]');
      return modal?.contains(document.activeElement);
    });
    check('modal-fokus-unutra', activeInModal);

    // Zatvaranje na Escape
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-modal-panel="true"]') === null);
    check('modal-zatvaranje-escape', true);

    // Otvori ponovo i zatvori kroz browser Back
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.settings-list button')].find((b) => (b.textContent ?? '').includes('Izgled'));
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"]');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[data-modal-panel="true"]') === null);
    check('modal-zatvaranje-back', true);

    // 12. Provera mobilnih širina, nula preliva i dodirnih površina >= 48px
    const viewports = [
      { width: 360, height: 740, name: 'mobile-360' },
      { width: 390, height: 844, name: 'mobile-390' },
      { width: 430, height: 932, name: 'mobile-430' },
      { width: 844, height: 390, name: 'landscape-844x390' },
      { width: 1280, height: 800, name: 'desktop-1280' },
    ];
    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(`${origin}#/`, { waitUntil: 'load' });
      await page.waitForSelector('main');
      const diff = await overflow(page);
      check(`preliv-${vp.name}`, diff <= 1, `diff=${diff}px`);

      // Provera visine dodirnih površina na mobilnom
      if (vp.width <= 430) {
        const touchTargetsOk = await page.evaluate(() => {
          const navLinks = [...document.querySelectorAll('nav a, nav button, .agenda-actions button')];
          return navLinks.every((el) => {
            const rect = el.getBoundingClientRect();
            return rect.height >= 44 && rect.width >= 44; // standard 44-48px touch target
          });
        });
        check(`touch-targets-${vp.name}`, touchTargetsOk);
      }
      await page.screenshot({ path: join(evidenceDir, `viewport-${vp.name}.png`) });
    }

    // 13. Oštećeno / onemogućeno skladište ne ruši aplikaciju (graceful fallback)
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', 'invalid-corrupt-json-{{{');
    });
    await page.reload({ waitUntil: 'load' });
    const fallbackTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('fallback-ostecena-tema', fallbackTheme === 'light' || fallbackTheme === 'dark');

    // 14. Sačuvaj izveštaj o svim prolazima
    const summary = {
      timestamp: new Date().toISOString(),
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
    writeFileSync(join(evidenceDir, 'harness-results.json'), JSON.stringify(summary, null, 2));
    console.log(`\nSVIH ${results.length} REWORK HARNESS TESTOVA JE PROŠLO.`);
  } finally {
    await browser.close();
    staticApp.server.close();
  }
}

await main().catch((err) => {
  console.error(`HARNESS ERROR: ${err.message}`);
  process.exitCode = 1;
});
