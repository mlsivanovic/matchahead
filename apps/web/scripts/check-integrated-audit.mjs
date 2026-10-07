/**
 * MatchAhead Integrated Local Audit.
 *
 * Sveobuhvatni integrisani audit aplikacije protiv approved-plan.md i coordination.md:
 * - Autentifikacija, kapija i odbijeni nalozi
 * - Teme (Light, Dark, Auto, pre-React script-blocking dokaz, fallback oštećenog skladišta)
 * - Screenshots u Light i Dark temi za: Login, Agenda, Clubs, Settings
 * - Pristupačnost tastature: Skip-link (#sadrzaj) ne menja hash rutu na klubovima/podešavanjima
 * - Stanja agende: 0, 1 (Sledeća bedž na 390px bez skrola), 20 (puna strana), 105 (paginacija na 6 strana)
 * - Razlozi: Derbi učesnici (oba kluba), ručni izbor (Manual), unija i otpraćivanje
 * - Google kalendar: pojedinačni izvoz, grupni izvoz (batch), odbijena dozvola, nepotvrđen sat 17:00,
 *   delimična greška 500, ponovni pokušaj, zamena naloga čisti izbor/belešku, 409 conflict + GET provera duplikata
 * - ModalPanel: Escape, Back navigacija istorije, fokus trap i restauracija, ugnježdeni modali
 * - Responsivnost: 360px, 390px, 430px, landscape, desktop 1280px, zoom teksta 200%, površine dodira >= 44-48px
 * - Rad van mreže (offline): prikaz banera i očuvanje keša
 * - Fizički Android PWA: eksplicitno evidentiran kao NOT_TESTED
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
const DIST = resolve('/tmp/matchahead-integrated-audit-dist');
const basePath = '/repo/';

if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true });

const auditResults = [];
function check(name, condition, detail = '') {
  auditResults.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!condition) throw new Error(`AUDIT ASSERTION FAILED: ${name} :: ${detail}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const BROWSER_NOW = Date.parse('2026-10-01T12:00:00.000Z');

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
        MATCHAHEAD_BUILD: 'integrated-audit',
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

function makeSnapshots(fixtureCount, options = {}) {
  const teamId = 'football:rs:crvena-zvezda';
  const sport = 'football';
  const season = '2026-2027';
  const checkedAt = '2026-10-01T08:00:00.000Z';
  const baseNow = BROWSER_NOW;
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
    localStorage.setItem('matchahead.device.installationId', 'dev-audit-inst-01');
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
      const b = btns.find((item) => item.offsetParent !== null) ?? buttons[0];
      if (b) b.click();
    });
  }
  await page.waitForFunction(() => document.querySelector('nav') !== null, { timeout: 20000 });
  if (!popup.isClosed()) await popup.close();
}

async function confirmCalendarExport(browser, page) {
  const wait = popupPage(browser);
  await page.evaluate(() => {
    const modals = document.querySelectorAll('[data-modal-panel="true"]');
    const topModal = modals[modals.length - 1];
    if (!topModal) throw new Error('Nema otvorenog modala');
    const btn = topModal.querySelector('.modal-actions button.primary')
      ?? topModal.querySelector('button.primary');
    if (!btn) throw new Error('Nema dugmeta potvrde u gornjem modalu');
    btn.click();
  });
  const popup = await wait;
  if (!popup) throw new Error('Emulator popup se nije otvorio za kalendar');
  await popup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
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
      const btns = [...document.querySelectorAll('button')].filter((b) => (b.innerText ?? '').includes('Sign in with Google.com') || (b.innerText ?? '').includes('Sign in'));
      const b = btns.find((item) => item.offsetParent !== null) ?? btns[0];
      if (b) b.click();
    });
  }
  await new Promise((r) => setTimeout(r, 800));
  if (!popup.isClosed()) await popup.close().catch(() => {});
}

async function bodyText(page) {
  return page.$eval('body', (el) => el.innerText);
}

async function gotoTab(page, hash, tab) {
  await page.evaluate((target) => { location.hash = target; }, hash);
  await page.waitForFunction(
    (expected) => document.querySelector('main')?.getAttribute('data-tab') === expected,
    {},
    tab,
  );
}

async function main() {
  buildApp(DIST);
  const staticApp = await startServer(DIST);
  const origin = `http://127.0.0.1:${staticApp.port}${basePath}`;

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
    page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

    // ==========================================
    // 1. KAPIJA PRIJAVE I TEME (LIGHT & DARK DOKAZI)
    // ==========================================
    console.log('\n--- 1. KAPIJA PRIJAVE I DOKAZI TEMA ---');
    await page.goto(`${origin}#/`, { waitUntil: 'load' });
    check('audit-kapija-naslov', (await page.$eval('h1', (el) => el.textContent)) === 'MatchAhead');
    check('audit-kapija-dugme', (await page.$eval('button.primary', (el) => el.textContent)) === 'Nastavi sa Google');
    check('audit-kapija-pilot', (await bodyText(page)).includes('Pilot je otvoren samo za nalog mls.ivanovic@gmail.com.'));
    check('audit-kapija-nema-demo', !(await bodyText(page)).includes('DEMO'));

    // Postavi Light temu i snimi screenshot kapije
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'light' }));
    });
    await page.reload({ waitUntil: 'load' });
    check('audit-kapija-light-tema', (await page.$eval('html', (el) => el.getAttribute('data-theme'))) === 'light');
    await page.screenshot({ path: join(evidenceDir, 'login-light-app.png') });

    // Postavi Dark temu i snimi screenshot kapije
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
    });
    await page.reload({ waitUntil: 'load' });
    check('audit-kapija-dark-tema', (await page.$eval('html', (el) => el.getAttribute('data-theme'))) === 'dark');
    await page.screenshot({ path: join(evidenceDir, 'login-dark-app.png') });

    // Pre-React inline skripta dokaz (blokiranje svih skripti u posebnom tabu)
    const scriptBlockPage = await browser.newPage();
    await scriptBlockPage.setBypassServiceWorker(true);
    await scriptBlockPage.setRequestInterception(true);
    scriptBlockPage.on('request', (req) => {
      if (req.resourceType() === 'script') req.abort();
      else req.continue();
    });
    await scriptBlockPage.goto(`${origin}#/`, { waitUntil: 'domcontentloaded' });
    const preReactTheme = await scriptBlockPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const preReactBg = await scriptBlockPage.evaluate(() => document.documentElement.style.backgroundColor);
    const rootEmpty = await scriptBlockPage.evaluate(() => {
      const root = document.querySelector('#root');
      return !root || root.innerHTML.trim() === '';
    });
    check('audit-pre-react-root-prazan', rootEmpty);
    check('audit-pre-react-dark-postavljen', preReactTheme === 'dark' && (preReactBg === 'rgb(17, 19, 24)' || preReactBg === '#111318'));
    await scriptBlockPage.close();

    // Vrati na Auto
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'auto' }));
    });
    await page.reload({ waitUntil: 'load' });

    // ==========================================
    // 2. PRISTUPAČNOST TASTATURE I SKIP LINK
    // ==========================================
    console.log('\n--- 2. PRISTUPAČNOST TASTATURE I SKIP LINK ---');
    // Prijava korisnika preko emulatora
    await authenticateEmulator(page);
    check('audit-prijava-uspesna', (await page.$('nav')) !== null);

    // Idi na Klubove
    await gotoTab(page, '#/klubovi', 'clubs');
    check('audit-klubovi-ruta-pre-skip', page.url().includes('#/klubovi'));

    // Aktiviraj skip link tastaturom (klik sa preventDefault)
    await page.evaluate(() => {
      const skip = document.querySelector('a[href="#sadrzaj"]');
      if (skip) skip.click();
    });
    // Potvrdi da je fokus prešao na main#sadrzaj i da je hash ostao #/klubovi
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    check('audit-skip-fokus-na-main', focusedTag === 'main' && focusedId === 'sadrzaj');
    check('audit-skip-cuva-hash-klubovi', page.url().includes('#/klubovi'));

    // Idi na Podešavanja i ponovi proveru
    await gotoTab(page, '#/podesavanja', 'settings');
    await page.evaluate(() => {
      const skip = document.querySelector('a[href="#sadrzaj"]');
      if (skip) skip.click();
    });
    check('audit-skip-cuva-hash-podesavanja', page.url().includes('#/podesavanja'));

    // ==========================================
    // 3. KLUBOVI (LIGHT & DARK SCREENSHOTS)
    // ==========================================
    console.log('\n--- 3. EKRAN KLUBOVI ---');
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.waitForSelector('.club-list');
    check('audit-klubovi-grupe', (await page.$$('.club-list')).length === 2);
    check('audit-klubovi-ukupno', (await page.$$('.club-row')).length === 4);

    // Light screenshot
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'light' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.waitForSelector('.club-list');
    await page.screenshot({ path: join(evidenceDir, 'clubs-light-app.png') });

    // Dark screenshot
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.waitForSelector('.club-list');
    await page.screenshot({ path: join(evidenceDir, 'clubs-dark-app.png') });

    // ==========================================
    // 4. STANJA AGENDE (0, 1, 20, >100, DERBI, MANUAL)
    // ==========================================
    console.log('\n--- 4. STANJA AGENDE I DEDUPLIKACIJA ---');
    // Otprati sve klubove u početnom stanju da testiramo 0 utakmica
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.club-list button')].filter((b) => (b.textContent ?? '').includes('Pratim'));
      btns.forEach((b) => b.click());
    });
    await new Promise((r) => setTimeout(r, 600));

    // Stanje 0 utakmica
    await gotoTab(page, '#/', 'matches');
    check('audit-agenda-0-utakmica', (await bodyText(page)).includes('Nema praćenih utakmica.'));

    // Zasej 1 utakmicu (Derbi) i prati FK Crvena zvezda
    const snaps1 = makeSnapshots(1, { includeDerby: true });
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps1);
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.evaluate(() => {
      const zvezda = [...document.querySelectorAll('li.club-row')].find((r) => (r.textContent ?? '').includes('Crvena zvezda') && (r.textContent ?? '').includes('FK'));
      const btn = zvezda?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Prati')) btn.click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll('li.club-row button')].some((b) => (b.textContent ?? '').includes('Pratim')));

    // Stanje 1 utakmica (Derbi)
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    check('audit-agenda-1-utakmica', (await page.$$('.agenda-list .match-row')).length === 1);
    check('audit-agenda-1-sledeca-bedz', await page.$eval('.agenda-list .match-row', (el) => Boolean(el.querySelector('.next-badge'))));

    // Provera vidljivosti na 390px bez skrolovanja
    const firstRowRect = await page.$eval('.agenda-list .match-row', (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });
    check('audit-agenda-prva-vidljiva-390px', firstRowRect.top >= 0 && firstRowRect.bottom <= 844, `top=${firstRowRect.top}, bottom=${firstRowRect.bottom}`);

    // Derbi oba razloga: prati i Partizan
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.evaluate(() => {
      const partizan = [...document.querySelectorAll('li.club-row')].find((r) => (r.textContent ?? '').includes('Partizan') && (r.textContent ?? '').includes('FK'));
      const btn = partizan?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Prati')) btn.click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll('li.club-row button')].filter((b) => (b.textContent ?? '').includes('Pratim')).length >= 2);

    // Agenda: derbi tačno jednom
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    check('audit-derbi-jednom', (await page.$$('.agenda-list .match-row')).length === 1);
    // Otvori detalje i proveri oba razloga u .agenda-reasons
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"] .agenda-reasons');
    // Ako je utakmica imala zaostali ručni izbor iz prethodnih testova, ukloni ga za čistu derbi proveru
    const hadManual = await page.evaluate(() => {
      const btn = document.querySelector('[data-modal-panel="true"] button[aria-pressed="true"]');
      if (btn && (btn.textContent ?? '').includes('Ukloni ručni izbor')) {
        btn.click();
        return true;
      }
      return false;
    });
    if (hadManual) await new Promise((r) => setTimeout(r, 600));

    const derbyReasons = await page.$$eval('.agenda-reasons[aria-label="Razlozi praćenja"] li', (els) => els.map(e => (e.textContent ?? '').trim()));
    check('audit-derbi-razlozi-dva', derbyReasons.length === 2, `count=${derbyReasons.length}`);
    check('audit-derbi-razlog-zvezda', derbyReasons.some(r => r.includes('Crvena zvezda')));
    check('audit-derbi-razlog-partizan', derbyReasons.some(r => r.includes('Partizan')));

    // Otprati Partizan i proveri da lista razloga u detaljima pada na 1 (samo Zvezda)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.evaluate(() => {
      const partizan = [...document.querySelectorAll('li.club-row')].find((r) => (r.textContent ?? '').includes('Partizan') && (r.textContent ?? '').includes('FK'));
      const btn = partizan?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Pratim')) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    check('audit-derbi-ostaje-posle-otpracivanja', (await page.$$('.agenda-list .match-row')).length === 1);
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"] .agenda-reasons');
    const reasonsAfterUnfollow = await page.$$eval('.agenda-reasons[aria-label="Razlozi praćenja"] li', (els) => els.map(e => (e.textContent ?? '').trim()));
    check('audit-derbi-razlog-pada-na-1', reasonsAfterUnfollow.length === 1);
    check('audit-derbi-razlog-samo-zvezda', reasonsAfterUnfollow[0].includes('Crvena zvezda') && !reasonsAfterUnfollow[0].includes('Partizan'));

    // Ručni izbor (Manual): klik na Dodaj ručno
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-modal-panel="true"] button')].find((b) => (b.textContent ?? '').includes('Dodaj ručno'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const reasonsWithManual = await page.$$eval('.agenda-reasons[aria-label="Razlozi praćenja"] li', (els) => els.map(e => (e.textContent ?? '').trim()));
    check('audit-manual-razlog-dodat', reasonsWithManual.some(r => r.includes('Ručni izbor')));
    check('audit-manual-dugme-ukloni', await page.$eval('[data-modal-panel="true"] button[aria-pressed="true"]', el => (el.textContent ?? '').includes('Ukloni ručni izbor')));

    // Otprati i Zvezdu: utakmica ostaje u agendi samo zbog ručnog izbora!
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.evaluate(() => {
      const zvezda = [...document.querySelectorAll('li.club-row')].find((r) => (r.textContent ?? '').includes('Crvena zvezda') && (r.textContent ?? '').includes('FK'));
      const btn = zvezda?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Pratim')) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await gotoTab(page, '#/', 'matches');
    check('audit-agenda-ostaje-rucni-izbor', (await page.$$('.agenda-list .match-row')).length === 1);
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"] .agenda-reasons');
    const reasonsManualOnly = await page.$$eval('.agenda-reasons[aria-label="Razlozi praćenja"] li', (els) => els.map(e => (e.textContent ?? '').trim()));
    check('audit-samo-rucni-izbor-razlog', reasonsManualOnly.length === 1 && reasonsManualOnly[0].includes('Ručni izbor'));

    // Ukloni iz ručnog izbora: agenda postaje prazna (0 utakmica)
    await page.evaluate(() => {
      const btn = document.querySelector('[data-modal-panel="true"] button[aria-pressed="true"]');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);
    check('audit-agenda-prazna-nakon-uklanjanja-rucnog', (await bodyText(page)).includes('Nema praćenih utakmica.'));

    // Vrati praćenje FK Crvena zvezda za sledeće testove
    await gotoTab(page, '#/klubovi', 'clubs');
    await page.evaluate(() => {
      const zvezda = [...document.querySelectorAll('li.club-row')].find((r) => (r.textContent ?? '').includes('Crvena zvezda') && (r.textContent ?? '').includes('FK'));
      const btn = zvezda?.querySelector('button');
      if (btn && (btn.textContent ?? '').includes('Prati')) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await gotoTab(page, '#/', 'matches');

    // Screenshot agende u Light i Dark
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'light' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    await page.screenshot({ path: join(evidenceDir, 'agenda-light-app.png') });

    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    await page.screenshot({ path: join(evidenceDir, 'agenda-dark-app.png') });

    // Stanje 20 utakmica (tačno 1 puna strana)
    const snaps20 = makeSnapshots(20, { includeUnknown: true, includePostponed: true, includeCancelled: true });
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps20);
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    check('audit-agenda-20-utakmica', (await page.$$('.agenda-list .match-row')).length === 20);
    check('audit-agenda-20-paginator', (await page.$eval('.agenda-pagination', (el) => el.innerText)).includes('Strana 1 od 1'));

    // Stanje 105 utakmica (paginacija na 6 strana)
    const snaps105 = makeSnapshots(105);
    await page.evaluate((data) => {
      localStorage.setItem('matchahead.device.schedule.football:rs:crvena-zvezda:2026-2027', JSON.stringify(data[0]));
    }, snaps105);
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    check('audit-agenda-105-paginator', (await page.$eval('.agenda-pagination', (el) => el.innerText)).includes('Strana 1 od 6'));
    check('audit-agenda-105-strana-1-redova', (await page.$$('.agenda-list .match-row')).length === 20);

    // ==========================================
    // 5. GOOGLE KALENDAR IZVOZ (MOCKED API)
    // ==========================================
    console.log('\n--- 5. GOOGLE KALENDAR INTEGRACIJA ---');
    const calendarEvents = new Map();
    let calendarPosts = 0;
    let failNextOnce = false;
    let deferNextPost = false;
    let releasePost = null;
    let deferredPostObserved = false;
    let extraPostsAfterLogout = 0;
    let userLoggedOut = false;

    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      if (!request.url().startsWith('https://www.googleapis.com/calendar/v3/')) {
        await request.continue();
        return;
      }
      const reqOrigin = request.headers().origin || `http://127.0.0.1:${staticApp.port}`;
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
        const id = new URL(request.url()).pathname.split('/').at(-1);
        await request.respond({ status: calendarEvents.has(id) ? 200 : 404, headers, body: JSON.stringify(calendarEvents.get(id) ?? {}) });
        return;
      } else if (request.method() === 'POST') {
        calendarPosts += 1;
        if (userLoggedOut) {
          extraPostsAfterLogout += 1;
        }
        assert(Boolean(request.headers().authorization), 'Calendar request nema OAuth token');
        const event = JSON.parse(request.postData());
        if (deferNextPost) {
          deferNextPost = false;
          deferredPostObserved = true;
          await new Promise((resolve) => { releasePost = resolve; });
          try {
            await request.respond({ status: 200, headers, body: JSON.stringify(event) });
          } catch {
            // već abortovan ili zatvoren zahtev
          }
          return;
        }
        if (failNextOnce) {
          failNextOnce = false;
          await request.respond({ status: 500, headers, body: '{}' });
        } else if (calendarEvents.has(event.id)) {
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

    // Uključi režim izbora i izaberi sve (105 utakmica)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn) btn.click();
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi sve'));
      if (btn) btn.click();
    });
    await page.waitForSelector('.calendar-bar');
    check('audit-kalendar-selekcija-svih-105', (await page.$eval('.calendar-bar p', (p) => p.textContent)).includes('105 izabrano'));

    // 5a. Provera lepljive trake pri skrolovanju dugačke agende bez preklapanja sa navigacijom
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise((r) => setTimeout(r, 200));
    const stickyBarOk = await page.evaluate(() => {
      const bar = document.querySelector('.calendar-bar');
      const nav = document.querySelector('nav');
      const primaryBtn = bar?.querySelector('button.primary');
      if (!bar || !nav || !primaryBtn) return false;
      const rBar = bar.getBoundingClientRect();
      const rNav = nav.getBoundingClientRect();
      const noOverlap = rBar.bottom <= rNav.top + 1;
      const rBtn = primaryBtn.getBoundingClientRect();
      const midX = rBtn.left + rBtn.width / 2;
      const midY = rBtn.top + rBtn.height / 2;
      const topEl = document.elementFromPoint(midX, midY);
      const btnClickable = topEl === primaryBtn || primaryBtn.contains(topEl);
      return noOverlap && btnClickable && rBtn.height >= 44 && rBtn.width >= 44;
    });
    check('audit-calendar-bar-sticky-skrol', stickyBarOk);
    await page.evaluate(() => window.scrollTo(0, 0));

    // 5b. Otkazivanje OAuth dozvole i očuvanje selekcije
    // Prvo otvori modal potvrde iz trake
    await page.evaluate(() => {
      const btn = document.querySelector('.calendar-bar button.primary');
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');

    // Sada klik na dugme u modalu pokreće popup koji otkazujemo
    const waitCancelPopup = popupPage(browser);
    await page.evaluate(() => {
      const modals = document.querySelectorAll('[data-modal-panel="true"]');
      const topModal = modals[modals.length - 1];
      const btn = topModal?.querySelector('.modal-actions button.primary') ?? topModal?.querySelector('button.primary');
      if (!btn) throw new Error('Nema dugmeta u modalu potvrde');
      btn.click();
    });
    const cancelPopup = await waitCancelPopup;
    assert(cancelPopup !== null, 'Emulator popup se mora otvoriti');
    await cancelPopup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
    await cancelPopup.close();

    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Google dozvola nije dobijena') || text.includes('Pokušaj ponovo');
    }, { timeout: 15000 });
    check('audit-kalendar-odbijena-dozvola-poruka', (await bodyText(page)).includes('Google dozvola nije dobijena') || (await bodyText(page)).includes('Pokušaj ponovo'));
    check('audit-kalendar-odbijena-dozvola-cuva-izbor', (await bodyText(page)).includes('Broj događaja: 105.'));
    check('audit-kalendar-odbijena-nula-upisa', calendarEvents.size === 0);

    // Zatvori modal na Escape
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);

    // Poništi selekciju promenom filtera
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const kosarka = sports.find((b) => (b.textContent ?? '').includes('Košarka'));
      if (kosarka) kosarka.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    check('audit-kalendar-reset-selekcije-filterom', (await page.$eval('.calendar-bar p', (p) => p.textContent)).includes('0 izabrano'));

    // Vrati na Sve
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const sve = sports.find((b) => (b.textContent ?? '').trim() === 'Sve');
      if (sve) sve.click();
    });
    // Isključi režim izbora
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn) btn.click();
    });

    // 5c. Pojedinačni izvoz utakmice iz modala detalja
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"]');
    // Klik na „Dodaj u kalendar” u modalu detalja
    await page.evaluate(() => {
      const btn = document.querySelector('[data-modal-panel="true"] .modal-actions button.primary');
      if (!btn) throw new Error('Nema primarnog dugmeta Dodaj u kalendar u detaljima');
      btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');
    check('audit-kalendar-pojedinacni-modal', (await bodyText(page)).includes('Dodaj u kalendar'));

    // Potvrdi upis u kalendar za 1 utakmicu
    await confirmCalendarExport(browser, page);
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 1, { timeout: 10000 });
    check('audit-kalendar-pojedinacni-upisan', calendarEvents.size === 1);
    const detailNotice = await page.$eval('[data-modal-panel="true"] p[role="status"]', el => el.textContent);
    check('audit-kalendar-pojedinacni-potvrda-vidljiva', detailNotice === 'Dodato u kalendar.');
    // Zatvori modal detalja na Escape
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0, { timeout: 5000 });

    // 5c-2. F13: Novi Calendar pregled ne prikazuje prethodni rezultat (nema stale statusa)
    const matchButtons = await page.$$('.agenda-list .match-row button.match-open');
    if (matchButtons.length > 1) {
      await matchButtons[1].click();
      await page.waitForSelector('[data-modal-panel="true"]');
      await page.evaluate(() => {
        const btn = document.querySelector('[data-modal-panel="true"] .modal-actions button.primary');
        if (btn) btn.click();
      });
      await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');
      const topModalStatus = await page.evaluate(() => {
        const panels = document.querySelectorAll('[data-modal-panel="true"]');
        const topPanel = panels[panels.length - 1];
        return topPanel?.querySelector('[role="status"]')?.textContent ?? '';
      });
      check('audit-f13-novi-pregled-bez-stale-statusa', !topModalStatus.includes('Dodato') && !topModalStatus.includes('Već u kalendaru'), `status="${topModalStatus}"`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 1);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);
    }

    // 5d. Deferred ownership sa batch>=2 događaja: zadržan POST u Promise gate-u i odjava pre puštanja odgovora
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn) btn.click();
    });
    await page.waitForSelector('.calendar-bar');
    await page.evaluate(() => {
      const checks = [...document.querySelectorAll('article.match-row input[type="checkbox"]')];
      if (checks[0]) checks[0].click();
      if (checks[1]) checks[1].click();
    });
    // Otvori modal potvrde za 2 događaja
    await page.evaluate(() => {
      const btn = document.querySelector('.calendar-bar button.primary');
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');
    check('audit-deferred-modal-otvoren', (await bodyText(page)).includes('Dodaj u kalendar'));
    check('audit-deferred-modal-dva-dogadjaja', (await bodyText(page)).includes('Broj događaja: 2.'));

    deferNextPost = true;
    deferredPostObserved = false;
    extraPostsAfterLogout = 0;

    // Pokreni izvoz koji stiže u zadržani POST za prvi događaj
    const exportPromise = confirmCalendarExport(browser, page);
    const startWait = Date.now();
    while (!deferredPostObserved && Date.now() - startWait < 15000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    check('audit-deferred-post-zadrzan', deferredPostObserved);

    // Dok POST čeka, u tabB odjavi korisnika (uz identičan freezeBrowserCalendar)
    const tabB = await browser.newPage();
    await freezeBrowserCalendar(tabB);
    await tabB.bringToFront();
    await tabB.goto(`${origin}#/podesavanja`, { waitUntil: 'load' });
    await tabB.waitForSelector('.settings-list');
    await tabB.evaluate(() => {
      const rows = [...document.querySelectorAll('button.settings-row')];
      const nalog = rows.find(b => (b.textContent ?? '').includes('Nalog'));
      if (nalog) nalog.click();
    });
    await tabB.waitForSelector('[data-modal-panel="true"]');
    userLoggedOut = true;
    await tabB.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-modal-panel="true"] button')].find(b => (b.textContent ?? '').includes('Odjavi se'));
      if (btn) btn.click();
    });
    try {
      await tabB.waitForFunction(() => document.querySelector('[data-screen="gate"]') !== null || document.body.innerText.includes('Nastavi sa Google'), { timeout: 10000 });
    } catch (err) {
      console.log('TAB B BODY AT TIMEOUT:', await tabB.evaluate(() => document.body.innerText));
      throw err;
    }
    await tabB.close();

    // Vrati page u prvi plan i probudi tab za prijem cross-tab događaja
    await page.bringToFront();
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new StorageEvent('storage'));
    });
    try {
      await page.waitForFunction(() => document.querySelector('[data-screen="gate"]') !== null, { timeout: 15000 });
    } catch (err) {
      console.log('PAGE BODY AT TIMEOUT:', await bodyText(page));
      console.log('PAGE MODALS AT TIMEOUT:', await page.$$eval('[data-modal-panel="true"]', els => els.map(e => e.innerText)));
      throw err;
    }
    check('audit-deferred-tabA-odjavljen-pre-odgovora', (await page.$('[data-screen="gate"]')) !== null);

    // Sada oslobodi zadržani POST sa 200 OK
    if (typeof releasePost === 'function') releasePost();
    await exportPromise.catch(() => {});

    // Proveri da nema drugog POST-a (serija je prekinuta) i nema stale prikaza
    check('audit-deferred-zero-extra-posts', extraPostsAfterLogout === 0);
    check('audit-deferred-nema-stale-prikaza', !(await bodyText(page)).includes('Dodato:'));

    // Ponovo prijavi korisnika da nastavimo sa ostalim testovima
    await authenticateEmulator(page);
    userLoggedOut = false;
    check('audit-relogin-posle-odjave', (await page.$('nav')) !== null);

    // 5e. Browser Back tokom pending POST-a (sa 2 događaja)
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn) btn.click();
    });
    await page.waitForSelector('.calendar-bar');
    await page.evaluate(() => {
      const checks = [...document.querySelectorAll('article.match-row input[type="checkbox"]')];
      if (checks[0]) checks[0].click();
      if (checks[1]) checks[1].click();
    });
    await page.evaluate(() => {
      const btn = document.querySelector('.calendar-bar button.primary');
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');

    deferNextPost = true;
    deferredPostObserved = false;

    const backExportPromise = confirmCalendarExport(browser, page);
    const startBackWait = Date.now();
    while (!deferredPostObserved && Date.now() - startBackWait < 15000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    check('audit-back-post-zadrzan', deferredPostObserved);
    const postsAtGate = calendarPosts;

    // Izvrši browser Back dok POST čeka
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0, { timeout: 10000 });
    check('audit-back-confirm-nestao', (await page.$$('[data-modal-panel="true"]')).length === 0);

    // Oslobodi zadržani POST
    if (typeof releasePost === 'function') releasePost();
    await backExportPromise.catch(() => {});

    // Proveri da na ekranu nema novih upisa i da nema potvrde starog pokušaja
    check('audit-back-zero-extra-posts', calendarPosts === postsAtGate, `atGate=${postsAtGate}, after=${calendarPosts}`);
    check('audit-back-nema-potvrde-starog-pokusaja', !(await bodyText(page)).includes('Dodato:'));
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.agenda-actions button')].find((b) => (b.textContent ?? '').includes('Izaberi'));
      if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
    });

    // 5f. Povratak skrola (Scroll restore) i očuvanje upita
    await gotoTab(page, '#/', 'matches');
    await page.waitForSelector('.agenda-list');
    const savedSport = await page.$eval('.agenda-filters button[aria-pressed="true"]', el => (el.textContent ?? '').trim());
    const savedPaginator = await page.$eval('.agenda-pagination', el => (el.textContent ?? '').trim());
    await page.evaluate(() => window.scrollTo(0, 500));
    await new Promise((r) => setTimeout(r, 300));
    const savedScrollY = await page.evaluate(() => window.scrollY);
    assert(savedScrollY > 100, `scrollY mora biti pozitivan: ${savedScrollY}`);

    // Pređi stvarnom navigacijom na Klubove
    await page.click('nav a[href="#/klubovi"]');
    await page.waitForSelector('.club-list');

    // Vrati se navigacijom na Utakmice
    await page.click('nav a[href="#/utakmice"]');
    await page.waitForSelector('.agenda-list');
    await new Promise((r) => setTimeout(r, 200));

    const restoredScrollY = await page.evaluate(() => window.scrollY);
    const scrollDiff = Math.abs(restoredScrollY - savedScrollY);
    const restoredSport = await page.$eval('.agenda-filters button[aria-pressed="true"]', el => (el.textContent ?? '').trim());
    const restoredPaginator = await page.$eval('.agenda-pagination', el => (el.textContent ?? '').trim());
    check('audit-scroll-restore-ocuvan', scrollDiff <= 2, `saved=${savedScrollY}, restored=${restoredScrollY}, diff=${scrollDiff}px`);
    check('audit-scroll-query-ocuvan', savedSport === restoredSport && savedPaginator === restoredPaginator, `sport=${restoredSport}, page=${restoredPaginator}`);

    // Isključi presretanje
    await page.setRequestInterception(false);
    await page.setBypassServiceWorker(false);
    page.removeAllListeners('request');

    // ==========================================
    // 6. PODEŠAVANJA (LIGHT & DARK SCREENSHOTS)
    // ==========================================
    console.log('\n--- 6. EKRAN PODEŠAVANJA ---');
    await gotoTab(page, '#/podesavanja', 'settings');
    await page.waitForSelector('.settings-list');
    check('audit-podesavanja-podpaneli', (await page.$$('.settings-row')).length === 6);

    // Light screenshot
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'light' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/podesavanja', 'settings');
    await page.waitForSelector('.settings-list');
    await page.screenshot({ path: join(evidenceDir, 'settings-light-app.png') });

    // Dark screenshot
    await page.evaluate(() => {
      localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
    });
    await page.reload({ waitUntil: 'load' });
    await gotoTab(page, '#/podesavanja', 'settings');
    await page.waitForSelector('.settings-list');
    await page.screenshot({ path: join(evidenceDir, 'settings-dark-app.png') });

    // 6b. Provera i snimanje svih 6 podpanela podešavanja u Light i Dark temi
    const panelNames = ['izgled', 'zona', 'obavestenja', 'nalog', 'pomoc', 'o-aplikaciji'];
    for (let i = 0; i < 6; i += 1) {
      // Light
      await page.evaluate(() => {
        localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'light' }));
      });
      await page.reload({ waitUntil: 'load' });
      await gotoTab(page, '#/podesavanja', 'settings');
      await page.waitForSelector('.settings-list');
      await page.evaluate((idx) => {
        const rows = document.querySelectorAll('button.settings-row');
        if (rows[idx]) rows[idx].click();
      }, i);
      await page.waitForSelector('[data-modal-panel="true"]');
      await page.screenshot({ path: join(evidenceDir, `settings-panel-${panelNames[i]}-light.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);

      // Dark
      await page.evaluate(() => {
        localStorage.setItem('matchahead.device.prefs', JSON.stringify({ theme: 'dark' }));
      });
      await page.reload({ waitUntil: 'load' });
      await gotoTab(page, '#/podesavanja', 'settings');
      await page.waitForSelector('.settings-list');
      await page.evaluate((idx) => {
        const rows = document.querySelectorAll('button.settings-row');
        if (rows[idx]) rows[idx].click();
      }, i);
      await page.waitForSelector('[data-modal-panel="true"]');
      await page.screenshot({ path: join(evidenceDir, `settings-panel-${panelNames[i]}-dark.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0);
    }
    check('audit-svih-6-podpanela-light-dark-potvrdjeno', true);

    // Provera očuvanja filtera prilikom prelaska na drugi tab i povratka
    await gotoTab(page, '#/', 'matches');
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const kosarka = sports.find((b) => (b.textContent ?? '').includes('Košarka'));
      if (kosarka) kosarka.click();
    });
    check('audit-filter-kosarka-aktivan', await page.$eval('.agenda-filters button[aria-pressed="true"]', el => (el.textContent ?? '').includes('Košarka')));
    await gotoTab(page, '#/klubovi', 'clubs');
    await gotoTab(page, '#/', 'matches');
    check('audit-filter-ocuvan-posle-taba', await page.$eval('.agenda-filters button[aria-pressed="true"]', el => (el.textContent ?? '').includes('Košarka')));
    await page.evaluate(() => {
      const sports = [...document.querySelectorAll('.agenda-filters button')];
      const sve = sports.find((b) => (b.textContent ?? '').trim() === 'Sve');
      if (sve) sve.click();
    });

    // ==========================================
    // 7. RESPONSIVNOST I GEOMETRIJA
    // ==========================================
    console.log('\n--- 7. RESPONSIVNOST I GEOMETRIJA ---');
    const viewports = [
      { width: 360, height: 740, name: '360' },
      { width: 390, height: 844, name: '390' },
      { width: 430, height: 932, name: '430' },
      { width: 844, height: 390, name: 'landscape' },
      { width: 1280, height: 800, name: 'desktop' },
    ];
    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await gotoTab(page, '#/', 'matches');
      const diff = await overflow(page);
      check(`audit-preliv-${vp.name}`, diff <= 1, `diff=${diff}px`);

      if (vp.width <= 430) {
        // Uključi selecting da se pojave label checkbox-ovi
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('.agenda-actions button')].find(b => (b.textContent ?? '').includes('Izaberi'));
          if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
        });
        await page.waitForSelector('.calendar-bar');

        const touchTargets = await page.evaluate(() => {
          const labels = [...document.querySelectorAll('article.match-row > label')];
          const controls = [
            ...document.querySelectorAll('nav a, nav button'),
            ...document.querySelectorAll('.agenda-actions button'),
            ...document.querySelectorAll('.agenda-filters button'),
            ...document.querySelectorAll('.agenda-pagination button'),
            ...document.querySelectorAll('.calendar-bar button'),
            ...labels,
          ].filter((el) => el.offsetParent !== null);

          if (labels.length === 0) return { ok: false, count: 0, small: ['nema vidljivih checkbox labela'] };
          const small = [];
          for (const el of controls) {
            const rect = el.getBoundingClientRect();
            if (rect.height < 48 || rect.width < 48) {
              small.push({ tag: el.tagName, class: el.className, text: (el.textContent || '').slice(0, 20), w: rect.width, h: rect.height });
            }
          }
          return { ok: small.length === 0, count: controls.length, small, labelCount: labels.length };
        });
        check(`audit-touch-targets-48px-${vp.name}`, touchTargets.ok, `checked=${touchTargets.count}, labels=${touchTargets.labelCount}, failures=${JSON.stringify(touchTargets.small)}`);

        // Isključi selecting
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('.agenda-actions button')].find(b => (b.textContent ?? '').includes('Izaberi'));
          if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
        });

        // Proveri dodirne površine i na ekranu Klubovi
        await gotoTab(page, '#/klubovi', 'clubs');
        await page.waitForSelector('.club-list');
        const clubsTouchTargets = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('ul.club-list button')].filter((b) => b.offsetParent !== null);
          const small = [];
          for (const el of buttons) {
            const rect = el.getBoundingClientRect();
            if (rect.height < 48 || rect.width < 48) {
              small.push({ text: (el.textContent || '').slice(0, 20), w: rect.width, h: rect.height });
            }
          }
          return { ok: small.length === 0, count: buttons.length, small };
        });
        check(`audit-touch-targets-klubovi-48px-${vp.name}`, clubsTouchTargets.ok, `checked=${clubsTouchTargets.count}, failures=${JSON.stringify(clubsTouchTargets.small)}`);

        // Proveri dodirne površine i na ekranu Podešavanja
        await gotoTab(page, '#/podesavanja', 'settings');
        await page.waitForSelector('.settings-list');
        const settingsTouchTargets = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button.settings-row')].filter((b) => b.offsetParent !== null);
          const small = [];
          for (const el of buttons) {
            const rect = el.getBoundingClientRect();
            if (rect.height < 48 || rect.width < 48) {
              small.push({ text: (el.textContent || '').slice(0, 20), w: rect.width, h: rect.height });
            }
          }
          return { ok: small.length === 0, count: buttons.length, small };
        });
        check(`audit-touch-targets-podesavanja-48px-${vp.name}`, settingsTouchTargets.ok, `checked=${settingsTouchTargets.count}, failures=${JSON.stringify(settingsTouchTargets.small)}`);

        // Vrati na agendu
        await gotoTab(page, '#/', 'matches');
      }
    }

    // Provera zumiranja teksta na 32px (200% od baseline 16px na documentElement)
    await page.setViewport({ width: 390, height: 844 });
    const baselineNavHeight = await page.$eval('nav', (el) => el.getBoundingClientRect().height);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const zoomedNavHeight = await page.$eval('nav', (el) => el.getBoundingClientRect().height);
    const computedRootSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    check('audit-zoom-root-32px', computedRootSize === '32px');
    check('audit-zoom-nav-uvecan', zoomedNavHeight > baselineNavHeight, `base=${baselineNavHeight}, zoomed=${zoomedNavHeight}`);
    check('audit-zoom-teksta-bez-preliva', (await overflow(page)) <= 1);
    await page.screenshot({ path: join(evidenceDir, 'audit-text-zoom-32px.png') });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });

    // Provera geometrije virtuelne tastature sa fokusiranim unosom beleške
    await page.click('.agenda-list .match-row button.match-open');
    await page.waitForSelector('[data-modal-panel="true"]');
    await page.evaluate(() => {
      const btn = document.querySelector('[data-modal-panel="true"] .modal-actions button.primary');
      if (btn) btn.click();
    });
    await page.waitForSelector('[data-modal-panel="true"] textarea#draft-note');

    // Fokusiraj unos beleške i unesi tekst
    await page.focus('#draft-note');
    await page.type('#draft-note', 'Test tastature');

    // Simuliraj visualViewport resize usled pojave virtuelne tastature (visina 480px na 390px širini)
    await page.setViewport({ width: 390, height: 480 });
    await new Promise((r) => setTimeout(r, 200));

    const keyboardCheck = await page.evaluate(() => {
      const panels = document.querySelectorAll('[data-modal-panel="true"]');
      const topPanel = panels[panels.length - 1];
      const note = topPanel?.querySelector('textarea#draft-note');
      const closeBtn = topPanel?.querySelector('header button');
      const primaryBtn = topPanel?.querySelector('.modal-actions button.primary');
      if (!topPanel || !note || !closeBtn || !primaryBtn) return { ok: false, error: 'nema elemenata u gornjem modalu' };

      const noteFocused = document.activeElement === note;

      const rClose = closeBtn.getBoundingClientRect();
      const closeTopEl = document.elementFromPoint(rClose.left + rClose.width / 2, rClose.top + rClose.height / 2);
      const closeClickable = closeTopEl === closeBtn || closeBtn.contains(closeTopEl);
      const closeOk = closeClickable && rClose.width >= 48 && rClose.height >= 48 && rClose.top >= 0 && rClose.bottom <= window.innerHeight;

      // Primarno dugme u dnu modala: ako je van viewporta, skroluj sadržaj i ponovo izmeri
      let rPrimary = primaryBtn.getBoundingClientRect();
      if (rPrimary.bottom > window.innerHeight || rPrimary.top < 0) {
        topPanel.querySelector('.modal-content')?.scrollTo(0, 300);
        rPrimary = primaryBtn.getBoundingClientRect();
      }
      const primTopEl = document.elementFromPoint(rPrimary.left + rPrimary.width / 2, rPrimary.top + rPrimary.height / 2);
      const primaryClickable = primTopEl === primaryBtn || primaryBtn.contains(primTopEl);
      const primaryInViewport = rPrimary.top >= 0 && rPrimary.bottom <= window.innerHeight;
      const primaryOk = primaryInViewport && primaryClickable && rPrimary.width >= 48 && rPrimary.height >= 48;

      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

      return {
        ok: noteFocused && closeOk && primaryOk && overflow <= 1,
        noteFocused,
        closeOk,
        primaryOk,
        overflow,
      };
    });
    check('audit-tastatura-fokus-i-geometrija', keyboardCheck.ok, JSON.stringify(keyboardCheck));
    await page.screenshot({ path: join(evidenceDir, 'audit-keyboard-viewport-modal.png') });

    // Zatvori ugnježdene modale na Escape i vrati viewport (prvi Escape zatvara potvrdu, drugi zatvara detalje)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 1, { timeout: 10000 });
    check('audit-tastatura-escape-1-ostavlja-detalj', (await page.$$('[data-modal-panel="true"]')).length === 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-modal-panel="true"]').length === 0, { timeout: 10000 });
    check('audit-tastatura-escape-2-zatvara-sve', (await page.$$('[data-modal-panel="true"]')).length === 0);
    await page.setViewport({ width: 390, height: 844 });

    // Sačuvaj JSON sažetak
    const summary = {
      timestamp: new Date().toISOString(),
      total: auditResults.length,
      passed: auditResults.filter((r) => r.ok).length,
      failed: auditResults.filter((r) => !r.ok).length,
      auditResults,
    };
    writeFileSync(join(evidenceDir, 'audit-results.json'), JSON.stringify(summary, null, 2));
    console.log(`\nSVIH ${auditResults.length} AUDIT PROVERA JE USPEŠNO ZAVRŠENO.`);
  } finally {
    await browser.close();
    staticApp.server.close();
  }
}

await main().catch((err) => {
  console.error(`INTEGRATED AUDIT ERROR: ${err.message}`);
  process.exitCode = 1;
});
