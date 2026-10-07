/**
 * Browser provera Auth klijenta na izolovanim emulatorima.
 *
 * Koristi postojeće pokrenute izolovane emulatore na 9098/8081:
 * Auth 127.0.0.1:9098, Firestore 127.0.0.1:8081 u projektu demo-matchahead.
 * Ne gasi i ne restartuje emulatore (vlasništvo koordinatora).
 *
 * Pokretanje (iz apps/web):
 *   node scripts/check-auth-browser.mjs
 *
 * Rework prilagođavanje:
 * - Kapija: h1 MatchAhead, "Nastavi sa Google", "Prati klubove..."
 * - Podešavanja: 6 modalnih podpanela (Izgled, Vremenska zona, Obaveštenja, Nalog, Instalacija, O aplikaciji)
 * - Omiljeni i podsetnici: UI je uklonjen prema odobrenom planu; proveravamo
 *   da se sačuvani omiljeni (favoriteTeamIds) i obaveštenja u bazi ne gube
 *   pri sinhronizaciji profila, prijavama i promeni vremenske zone.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(process.env.CHECK_AUTH_BROWSER_DIST ?? '/tmp/matchahead-auth-browser-dist');
const PROJECT = 'demo-matchahead';
const AUTH = 'http://127.0.0.1:9098';
const STORE = 'http://127.0.0.1:8081';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/chromium';
const ALLOWED_EMAIL = 'mls.ivanovic@gmail.com';
const DENIED_EMAIL = 'boris@example.com';

const BUILD_ENV = {
  VITE_FIREBASE_API_KEY: 'demo',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-matchahead.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-matchahead',
  VITE_FIREBASE_APP_ID: '1:0:web:demo',
  VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  MATCHAHEAD_BASE: '/',
  MATCHAHEAD_BUILD: 'check-auth-browser',
};

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!condition) throw new Error(`FAILED: ${name} :: ${detail}`);
}

const ADMIN_HEADERS = { Authorization: 'Bearer owner' };

function encodeValue(value) {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { stringValue: String(value) };
}

/** Upis dokumenta kroz emulator admin API (Bearer owner) */
async function storePut(path, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])) };
  const response = await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`seed ${response.status} for ${path}: ${await response.text()}`);
}

async function storeGet(path) {
  const response = await fetch(`${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: ADMIN_HEADERS });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`store ${response.status} for ${path}`);
  return response.json();
}

function docFields(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc?.fields ?? {})) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value.nullValue !== undefined) out[key] = null;
    else if (value.arrayValue !== undefined) out[key] = (value.arrayValue.values ?? []).map((item) => item.stringValue ?? item);
  }
  return out;
}

async function listDocs(collectionPath) {
  const response = await fetch(
    `${STORE}/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}?pageSize=50`,
    { headers: ADMIN_HEADERS },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return (data.documents ?? []).map((doc) => ({ id: doc.name.split('/').pop(), fields: docFields(doc) }));
}

async function main() {
  for (const [host, name] of [[`${AUTH}/`, 'auth 9098'], [`${STORE}/`, 'firestore 8081']]) {
    const response = await fetch(host).catch(() => null);
    if (!response) throw new Error(`emulator nije dostupan: ${name}. Proveri da li rade isolated emulatori.`);
  }
  console.log('PASS: izolovani emulatori dostupni');

  rmSync(DIST, { recursive: true, force: true });
  const build = spawnSync(process.execPath, [resolve(webRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir'], {
    cwd: webRoot,
    env: { ...process.env, ...BUILD_ENV },
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error('build provere nije uspeo');

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let relative = decodeURIComponent(url.pathname);
    if (relative === '/' || relative.endsWith('/')) relative += 'index.html';
    const file = normalize(join(DIST, relative));
    if (!file.startsWith(DIST)) {
      response.writeHead(403).end('no');
      return;
    }
    try {
      response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(readFileSync(join(DIST, 'index.html')));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    await runFlow(browser, origin);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`PASS: browser provera završena (${results.length} provera)`);
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

async function clickButton(page, text) {
  return page.evaluate((needle) => {
    const match = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(needle));
    if (!match) return false;
    match.click();
    return true;
  }, text);
}

async function clickLogin(page) {
  if (await clickButton(page, 'Nastavi sa Google')) return true;
  if (await clickButton(page, 'Prijavi se Google')) return true;
  return clickButton(page, 'Pokušaj ponovo');
}

async function closePopup(popup) {
  try {
    if (popup && !popup.isClosed()) await popup.close();
  } catch { /* već zatvoren */ }
}

async function widgetClick(popup, text) {
  return popup.evaluate((needle) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => (b.innerText ?? '').includes(needle));
    const visible = buttons.find((b) => b.offsetParent !== null) ?? buttons[0];
    if (!visible) return false;
    visible.click();
    return true;
  }, text);
}

async function widgetText(popup) {
  return popup.evaluate(() => document.body.innerText);
}

async function appText(page) {
  return page.$eval('body', (element) => element.innerText);
}

/** Otvara podpanel u podešavanjima */
async function openSettingsPane(page, label) {
  await page.waitForSelector('.settings-list');
  const opened = await page.evaluate((wanted) => {
    const buttons = [...document.querySelectorAll('.settings-list button.settings-row')];
    const match = buttons.find((b) => (b.textContent ?? '').includes(wanted));
    if (!match) return false;
    match.click();
    return true;
  }, label);
  if (!opened) throw new Error(`nema opcije podešavanja: ${label}`);
  await page.waitForSelector('[data-modal-panel="true"]');
}

/** Zatvara modalni panel pritiskom na Escape */
async function closeModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-modal-panel="true"]') === null, { timeout: 5000 });
}

/** Prijava kroz pravi popup + emulator widget. Vraća prijavljeni email. */
async function signInViaPopup(browser, page, { email, until = null }) {
  const wait = popupPage(browser);
  const started = await clickLogin(page);
  if (!started) throw new Error('nema dugmeta prijave (bez popup resolvera ovde stajemo)');
  const popup = await wait;
  if (!popup) throw new Error('popup se nije otvorio u roku: missing resolver ne sme proći tiho');
  await popup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
  const picked = await popup.evaluate((wanted) => {
    const match = [...document.querySelectorAll('button, li, [role="button"]')].find((item) => (item.innerText ?? '').includes(wanted));
    if (match) {
      match.click();
      return true;
    }
    return false;
  }, email);
  if (!picked) {
    const opened = await widgetClick(popup, 'Add new account');
    if (!opened) throw new Error('widget nema Add new account');
    await new Promise((resolve) => setTimeout(resolve, 800));
    let filled = '';
    for (let attempt = 0; attempt < 3 && filled !== email; attempt += 1) {
      await popup.$eval('#email-input', (el, wanted) => {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, wanted);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, email);
      await new Promise((resolve) => setTimeout(resolve, 400));
      filled = await popup.$eval('#email-input', (el) => el.value).catch(() => '');
    }
    if (filled !== email) throw new Error(`widget ne prima email, ostalo: ${filled}`);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  if (!popup.isClosed()) {
    const finished = await widgetClick(popup, 'Sign in with Google.com');
    if (!finished) throw new Error(`widget nema Sign in; stanje: ${(await widgetText(popup)).slice(0, 400)}`);
  }
  if (until) {
    await page.waitForFunction(
      (needle) => document.body.innerText.includes(needle),
      { timeout: 20000 },
      until,
    );
  } else {
    await page.waitForFunction(() => document.querySelector('nav') !== null, { timeout: 20000 });
  }
  await closePopup(popup);
  return email;
}

async function gotoScreen(page, hash, screen) {
  const currentUrl = page.url();
  if (currentUrl.startsWith('http')) {
    const currentHash = new URL(currentUrl).hash;
    if (currentHash !== hash) {
      await page.evaluate((target) => { location.hash = target; }, hash);
    }
  } else {
    await page.goto(`${page.url().split('#')[0]}${hash}`, { waitUntil: 'load' });
  }
  await page.waitForFunction(
    (expected) => (document.querySelector('main')?.dataset.screen === expected || document.querySelector('main')?.dataset.tab === expected)
      && document.querySelector('main h1') !== null,
    { timeout: 15000 },
    screen,
  );
}

async function runFlow(browser, origin) {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${STORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message.slice(0, 200)));
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${origin}/#/`, { waitUntil: 'load' });

  // 0. Kapija pre bilo koje funkcije. Hash podešavanja ne otvara ekran.
  await page.goto(`${origin}/#/podesavanja`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('main')?.dataset.screen === 'gate');
  let text = await appText(page);
  check('kapija', (await page.$eval('h1', (element) => element.textContent)) === 'MatchAhead'
    && text.includes('Nastavi sa Google')
    && text.includes('Prati klubove i dodaj utakmice u Google kalendar.')
    && !text.includes('DEMO')
    && await page.$('nav') === null);

  // 0b. Tuđ verifikovan Google nalog se odjavljuje i ne dobija profil.
  await signInViaPopup(browser, page, { email: DENIED_EMAIL, until: 'nema pristup' });
  text = await appText(page);
  check('tudji-odjavljen', text.includes('nema pristup') && !text.includes(DENIED_EMAIL));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  check('tudji-bez-profila', (await listDocs('users')).length === 0);

  // 1. Dozvoljeni verifikovan nalog kroz pravi popup.
  const emailA = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('prijava-a-ui', emailA === ALLOWED_EMAIL, emailA);
  let users = await listDocs('users');
  check('profil-a-kreiran', users.length === 1);
  const uidA = users[0].id;

  // 2. Omiljeni i praćenje.
  // UI za omiljene i podsetnike je uklonjen prema odobrenom planu.
  // Proveravamo da se omiljeni (favoriteTeamIds) i obaveštenja (reminderMinutes)
  // u Firestore bazi čuvaju i ostaju netaknuti bez UI polucije agende.
  await storePut(`users/${uidA}`, {
    ...docFields(await storeGet(`users/${uidA}`)),
    favoriteTeamIds: ['football:rs:crvena-zvezda'],
    reminderMinutes: 30,
    notifyScheduleChange: true,
    notifyCancellation: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const profile = docFields(await storeGet(`users/${uidA}`));
  check('omiljeni-sacuvani', (profile.favoriteTeamIds ?? []).includes('football:rs:crvena-zvezda'));
  check('podsetnik-sacuvan', profile.reminderMinutes === 30);

  // Praćenje kluba kroz novi UI sa 4 kluba
  await gotoScreen(page, '#/klubovi', 'clubs');
  check('prati-klik', await clickButton(page, 'Prati'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const follows = await listDocs(`users/${uidA}/follows`);
  check('pracenje-sacuvano', follows.some((f) => f.id === 'football:rs:crvena-zvezda' && f.fields.active === true));
  check('klub-oznaka', (await page.$eval('.club-list button', (element) => element.textContent ?? '')).includes('Pratim'));

  // Prelazak na Utakmice: jedinstvena agenda
  await gotoScreen(page, '#/', 'matches');
  text = await appText(page);
  check('agenda-prikazana', text.includes('Utakmice') && !text.includes('DEMO'));

  // 3. Druga sesija: reload obnavlja nalog; drugi tab je konzistentan.
  await page.reload({ waitUntil: 'load' });
  await gotoScreen(page, '#/podesavanja', 'settings');
  await openSettingsPane(page, 'Nalog');
  await page.waitForFunction((email) => document.body.innerText.includes(email), { timeout: 20000 }, ALLOWED_EMAIL);
  text = await appText(page);
  check('reload-sesija', text.includes(ALLOWED_EMAIL));
  await closeModal(page);

  // Sačuvani favoriti u bazi su netaknuti posle reznih ciklusa
  const reloadedProfile = docFields(await storeGet(`users/${uidA}`));
  check('reload-favoriti-netaknuti', (reloadedProfile.favoriteTeamIds ?? []).includes('football:rs:crvena-zvezda'));

  const tab2 = await browser.newPage();
  await tab2.goto(`${origin}/#/podesavanja`, { waitUntil: 'load' });
  await tab2.waitForSelector('.settings-list');
  await openSettingsPane(tab2, 'Nalog');
  await tab2.waitForFunction((email) => document.body.innerText.includes(email), { timeout: 20000 }, ALLOWED_EMAIL);
  check('drugi-tab', true);
  await tab2.close();

  // 4. Odjava čisti UI, sesiju i vezu uređaja. Pre odjave posej dva
  // važeća dokumenta (tekuća instalacija + drugi uređaj) i potvrdi da
  // postoje: prazna kolekcija pre i posle nije dokaz uklanjanja.
  await gotoScreen(page, '#/podesavanja', 'settings');
  const installationId = await page.evaluate(() => localStorage.getItem('matchahead.device.installationId'));
  check('odjava-install-id', typeof installationId === 'string' && (installationId?.length ?? 0) >= 16, installationId);
  const OTHER_DEVICE = 'dev-drugi-uredjaj-0001';
  const STAMP = '2026-10-01T00:00:00.000Z';
  const deviceFields = (id) => ({
    installationId: id, fid: null, createdAt: STAMP, updatedAt: STAMP, lastSeenAt: STAMP,
  });
  await storePut(`users/${uidA}/devices/${installationId}`, deviceFields(installationId));
  await storePut(`users/${uidA}/devices/${OTHER_DEVICE}`, deviceFields(OTHER_DEVICE));
  const seeded = await listDocs(`users/${uidA}/devices`);
  check('odjava-seed', seeded.length === 2
    && seeded.some((d) => d.id === installationId) && seeded.some((d) => d.id === OTHER_DEVICE));

  await openSettingsPane(page, 'Nalog');
  check('odjava-klik', await clickButton(page, 'Odjavi se'));
  await page.waitForFunction(() => document.body.innerText.includes('Nastavi sa Google'), { timeout: 20000 });
  text = await appText(page);
  check('odjava-ui', !text.includes('Odjavi se') && (await page.$eval('main', (element) => element.dataset.screen)) === 'gate' && await page.$('nav') === null);
  const leftoverSession = await page.evaluate(() => sessionStorage.getItem('matchahead.session.followedTeamIds')
    ?? sessionStorage.getItem('matchahead.session.manualFixtureIds')
    ?? sessionStorage.getItem('matchahead.session.draftNote'));
  check('odjava-sesija', leftoverSession === null);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const leftover = await listDocs(`users/${uidA}/devices`);
  check('odjava-unlink', leftover.length === 1
    && leftover[0].id === OTHER_DEVICE && leftover[0].fields.installationId === OTHER_DEVICE,
    JSON.stringify(leftover.map((d) => d.id)));
  check('odjava-kapija', (await page.$eval('h1', (element) => element.textContent)) === 'MatchAhead');

  // 5. Ponovna prijava istog naloga vraća profil i praćenja.
  const emailA2 = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('relogin-a', emailA2 === ALLOWED_EMAIL, emailA2);
  const reloginProfile = docFields(await storeGet(`users/${uidA}`));
  check('relogin-favorit', (reloginProfile.favoriteTeamIds ?? []).includes('football:rs:crvena-zvezda'));
  await gotoScreen(page, '#/klubovi', 'clubs');
  check('relogin-pracenje', (await page.$eval('.club-list button', (el) => el.textContent ?? '')).includes('Pratim'));

  // 6. Brzi ciklusi odjava/prijava ostaju živi (veza sesije se obnavlja).
  for (const [cycle, wanted] of [['1', ALLOWED_EMAIL], ['2', ALLOWED_EMAIL]]) {
    await gotoScreen(page, '#/podesavanja', 'settings');
    await openSettingsPane(page, 'Nalog');
    check(`ciklus-${cycle}-out`, await clickButton(page, 'Odjavi se'));
    await page.waitForFunction(() => document.body.innerText.includes('Nastavi sa Google'), { timeout: 20000 });
    const got = await signInViaPopup(browser, page, { email: wanted });
    check(`ciklus-${cycle}-in`, got === wanted, got);
  }

  // 7b. Prefs round-trip: Vremenska zona UTC kroz UI, reload i server.
  // Obaveštenja prikazuju "Još nisu dostupna." uz očuvanje postojećih podsetnika u bazi.
  await gotoScreen(page, '#/podesavanja', 'settings');
  await openSettingsPane(page, 'Vremenska zona');
  await page.select('#account-zone', 'UTC');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await closeModal(page);

  // Proveri da Obaveštenja modal prikazuje "Još nisu dostupna."
  await openSettingsPane(page, 'Obaveštenja');
  text = await appText(page);
  check('obavestenja-panel', text.includes('Još nisu dostupna.'));
  await closeModal(page);

  // Reload i provera da je server ažuriran i da je podsetnik očuvan
  await page.reload({ waitUntil: 'load' });
  await gotoScreen(page, '#/podesavanja', 'settings');
  await openSettingsPane(page, 'Vremenska zona');
  check('prefs-reload-select', (await page.$eval('#account-zone', (el) => el.value)) === 'UTC');
  await closeModal(page);

  const anaDoc = (await listDocs('users')).find((u) => u.id === uidA);
  check('prefs-server', anaDoc?.fields?.timeZone === 'UTC' && anaDoc?.fields?.reminderMinutes === 30);

  // 7c. Cross-tab odjava čisti i drugi tab (deljeno skladište, ne drugi uređaj).
  console.log('STEP 7C: START');
  const tabB = await browser.newPage();
  console.log('STEP 7C: NEW PAGE CREATED');
  await tabB.goto(`${origin}/#/podesavanja`, { waitUntil: 'load' });
  console.log('STEP 7C: TAB B LOADED');
  await tabB.waitForSelector('.settings-list');
  console.log('STEP 7C: TAB B SETTINGS LIST');
  await openSettingsPane(tabB, 'Nalog');
  console.log('STEP 7C: TAB B NALOG OPENED');
  await tabB.waitForFunction((email) => document.body.innerText.includes(email), { timeout: 20000 }, ALLOWED_EMAIL);
  console.log('STEP 7C: TAB B EMAIL VERIFIED');

  // Odjava na originalnoj stranici (page)
  await gotoScreen(page, '#/podesavanja', 'settings');
  console.log('STEP 7C: PAGE ON SETTINGS');
  await openSettingsPane(page, 'Nalog');
  console.log('STEP 7C: PAGE NALOG OPENED');
  check('crosstab-out', await clickButton(page, 'Odjavi se'));
  console.log('STEP 7C: PAGE SIGN OUT CLICKED');

  // Proveri da se i tabB automatski vratio na kapiju i očistio sesiju
  await tabB.waitForFunction(() => document.body.innerText.includes('Nastavi sa Google'), { timeout: 20000 });
  const tabBText = await appText(tabB);
  const tabBSession = await tabB.evaluate(() => sessionStorage.getItem('matchahead.session.followedTeamIds')
    ?? sessionStorage.getItem('matchahead.session.manualFixtureIds')
    ?? sessionStorage.getItem('matchahead.session.draftNote'));
  check('crosstab-cisti', !tabBText.includes('Odjavi se') && (await tabB.$eval('main', (element) => element.dataset.screen)) === 'gate' && tabBSession === null);
  await tabB.close();

  // Ponovna prijava na originalnoj stranici radi provere preostalih koraka
  await page.waitForFunction(() => document.body.innerText.includes('Nastavi sa Google'), { timeout: 20000 });
  check('crosstab-relogin', (await signInViaPopup(browser, page, { email: ALLOWED_EMAIL })) === ALLOWED_EMAIL);

  // 7d. Otkazani popup: bezbedna poruka bez koda, retry radi.
  await gotoScreen(page, '#/podesavanja', 'settings');
  await openSettingsPane(page, 'Nalog');
  check('pred-brisanje-out', await clickButton(page, 'Odjavi se'));
  await page.waitForFunction(() => document.body.innerText.includes('Nastavi sa Google'), { timeout: 20000 });
  {
    const w = popupPage(browser);
    check('cancel-klik', await clickLogin(page));
    const cancelPopup = await w;
    check('cancel-popup', cancelPopup !== null);
    await cancelPopup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
    check('cancel-spreman', true);
    try {
      if (!cancelPopup.isClosed()) await cancelPopup.close();
    } catch { /* već zatvoren */ }
    await page.waitForFunction(() => document.body.innerText.includes('Prozor prijave je zatvoren'), { timeout: 20000 });
    const cancelText = await appText(page);
    check('cancel-poruka', cancelText.includes('Prozor prijave je zatvoren') && cancelText.includes('Nastavi sa Google'));
  }

  // 8. Brisanje dozvoljenog naloga: vidljiva potvrda + brava bez profila.
  const emailAgain = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('prijava-brisanje', emailAgain === ALLOWED_EMAIL, emailAgain);
  await gotoScreen(page, '#/podesavanja', 'settings');
  await openSettingsPane(page, 'Nalog');
  check('brisanje-korak1', await clickButton(page, 'Obriši nalog'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  check('brisanje-korak2', await clickButton(page, 'Potvrdi brisanje'));
  await page.waitForFunction(() => document.body.innerText.includes('Nalog je obrisan.'), { timeout: 20000 });
  check('brisanje-ui', (await page.$eval('main', (element) => element.dataset.screen)) === 'gate');
  check('profil-obrisan', (await storeGet(`users/${uidA}`)) === null);
  const tombstone = await storeGet(`accountTombstones/${uidA}`);
  const tombFields = tombstone ? docFields(tombstone) : null;
  check('brava-ostaje', tombFields?.status === 'in_progress', JSON.stringify(tombFields));
  check('brava-bez-profila', tombFields ? Object.keys(tombFields).length === 3 : false, Object.keys(tombFields ?? {}).join(','));
  check('nema-profila', (await listDocs('users')).length === 0);
}

await main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
