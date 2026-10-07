/**
 * Browser provera Auth klijenta na izolovanim emulatorima.
 *
 * Ne pokreće emulatore sama: pre starta digni izolovane emulatore
 * (Grok drži 9099/8080) sa pravilima repozitorijuma, na primer:
 *
 *   firebase emulators:start \
 *     --config /tmp/matchahead-authclient/firebase.isolated.json \
 *     --project demo-matchahead
 *
 * gde izolovani config ima auth 127.0.0.1:9098, firestore 127.0.0.1:8081,
 * singleProjectMode i rules na <repo>/firebase/firestore.rules.
 * Zaustavljanje: Ctrl+C / kill firebase procesa.
 *
 * Pokretanje (iz apps/web):
 *   node scripts/check-auth-browser.mjs
 *
 * Skripta sama bilda bundle sa emulator env (nikakvi pravi Google
 * kredencijali). Emulator widget lokalno postavlja email_verified i
 * ne dira Google Cloud konzolu niti listu OAuth test korisnika.
 * Proverava kapiju pre prijave, odbijanje tuđeg naloga bez profila,
 * prijavu verifikovanog mls.ivanovic@gmail.com, odjavu, omiljene,
 * praćenja, reload sesije, uklanjanje veze tekućeg uređaja uz
 * očuvanje drugog (oba posejana pre odjave), ponovne cikluse, prefs
 * round-trip, cross-tab odjavu, otkazani popup i brisanje naloga
 * sa bravom. Browser i server se gase u finally.
 *
 * Granice: live Google popup/mobile NOT_TESTED; requires-recent-login
 * je sintetički samo u jediničnim testovima; isti-uid ponovna prijava
 * posle deleteUser nije merljiva jer emulator dodeljuje novi uid.
 * Drugi tab deli isto skladište: to je cross-tab provera, ne drugi uređaj.
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

/** Upis dokumenta kroz emulator admin API (Bearer owner): seed je
 *  oblika koji pravila prihvataju, a brisanje dokazuje sam klijent kao
 *  autentifikovani vlasnik pod živim pravilima. */
async function storePut(path, fields) {
  const encode = (value) => (value === null ? { nullValue: 'NULL_VALUE' } : { stringValue: value });
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
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
    else if (value.arrayValue !== undefined) out[key] = (value.arrayValue.values ?? []).map((item) => item.stringValue);
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
    if (!response) throw new Error(`emulator nije dostupan: ${name}. Prvo digni izolovane emulatore (vidi zaglavlje).`);
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
  const handle = await page.evaluateHandle(
    (needle) => [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(needle)) ?? null,
    text,
  );
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  return true;
}

async function clickLogin(page) {
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

/** Prijava kroz pravi popup + emulator widget. Vraća prijavljeni email. */
async function signInViaPopup(browser, page, { email, until = 'Prijavljen:' }) {
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
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    { timeout: 20000 },
    until,
  );
  await closePopup(popup);
  if (until !== 'Prijavljen:') return null;
  const line = (await appText(page)).split(String.fromCharCode(10)).find((item) => item.includes('Prijavljen:')) ?? '';
  return (line.split('Prijavljen:')[1] ?? '').trim();
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
  check('kapija', (await page.$eval('h1', (element) => element.textContent)) === 'Prijava'
    && text.includes('Prijavi se Google nalogom')
    && !text.includes('DEMO')
    && await page.$('nav') === null);

  // 0b. Tuđ verifikovan Google nalog se odjavljuje i ne dobija profil.
  await signInViaPopup(browser, page, { email: DENIED_EMAIL, until: 'nema pristup' });
  text = await appText(page);
  check('tudji-odjavljen', text.includes('nema pristup') && !text.includes('Prijavljen:') && !text.includes(DENIED_EMAIL));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  check('tudji-bez-profila', (await listDocs('users')).length === 0);

  // 1. Dozvoljeni verifikovan nalog kroz pravi popup.
  const emailA = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('prijava-a-ui', emailA === ALLOWED_EMAIL, emailA);
  let users = await listDocs('users');
  check('profil-a-kreiran', users.length === 1);
  const uidA = users[0].id;

  // 2. Omiljeni i praćenje. Ručni katalog DEMO više nije u aplikaciji.
  check('omiljeni-klik', await clickButton(page, 'Dodaj u omiljene'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const profile = docFields(await storeGet(`users/${uidA}`));
  check('omiljeni-sacuvani', (profile.favoriteTeamIds ?? []).includes('football:rs:crvena-zvezda'));
  await gotoScreen(page, '#/klubovi', 'clubs');
  check('prati-klik', await clickButton(page, 'Prati'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const follows = await listDocs(`users/${uidA}/follows`);
  check('pracenje-sacuvano', follows.some((f) => f.id === 'football:rs:crvena-zvezda' && f.fields.active === true));
  check('klub-oznaka', (await page.$eval('.club-list button', (element) => element.textContent ?? '')).includes('Pratim'));
  await gotoScreen(page, '#/', 'home');
  text = await appText(page);
  check('agenda-prazna', text.includes('Agenda je prazna') && !text.includes('DEMO'));
  await gotoScreen(page, '#/podesavanja', 'settings');
  check('rucni-prazni', (await appText(page)).includes('Ručni izbori: 0'));

  // 3. Druga sesija: reload obnavlja nalog i omiljene; drugi tab je konzistentan.
  await page.reload({ waitUntil: 'load' });
  await gotoScreen(page, '#/podesavanja', 'settings');
  await page.waitForFunction((email) => document.body.innerText.includes(`Prijavljen: ${email}`), { timeout: 20000 }, ALLOWED_EMAIL);
  text = await appText(page);
  const pressedFavorites = await page.$$eval('.club-list button[aria-pressed="true"]', (items) => items.length);
  check('reload-sesija', text.includes('Omiljeni klub') && pressedFavorites >= 1);
  const tab2 = await browser.newPage();
  await tab2.goto(`${origin}/#/podesavanja`, { waitUntil: 'load' });
  await tab2.waitForFunction((email) => document.body.innerText.includes(`Prijavljen: ${email}`), { timeout: 20000 }, ALLOWED_EMAIL);
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
  check('odjava-klik', await clickButton(page, 'Odjavi se'));
  await page.waitForFunction(() => document.body.innerText.includes('Prijavi se Google nalogom'), { timeout: 20000 });
  text = await appText(page);
  check('odjava-ui', !text.includes('Prijavljen:') && (await page.$eval('main', (element) => element.dataset.screen)) === 'gate');
  const leftoverSession = await page.evaluate(() => sessionStorage.getItem('matchahead.session.followedTeamIds')
    ?? sessionStorage.getItem('matchahead.session.manualFixtureIds')
    ?? sessionStorage.getItem('matchahead.session.draftNote'));
  check('odjava-sesija', leftoverSession === null);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const leftover = await listDocs(`users/${uidA}/devices`);
  check('odjava-unlink', leftover.length === 1
    && leftover[0].id === OTHER_DEVICE && leftover[0].fields.installationId === OTHER_DEVICE,
    JSON.stringify(leftover.map((d) => d.id)));
  check('odjava-kapija', (await page.$eval('h1', (element) => element.textContent)) === 'Prijava');

  // 5. Ponovna prijava istog naloga vraća omiljene. Hash je i dalje podešavanja.
  const emailA2 = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('relogin-a', emailA2 === ALLOWED_EMAIL, emailA2);
  check('relogin-favorit', (await page.$$eval('.club-list button[aria-pressed="true"]', (items) => items.length)) >= 1);
  await gotoScreen(page, '#/', 'home');
  check('relogin-agenda', (await appText(page)).includes('Agenda je prazna'));

  // 6. Brzi ciklusi odjava/prijava ostaju živi (veza sesije se obnavlja).
  await gotoScreen(page, '#/podesavanja', 'settings');
  for (const [cycle, wanted] of [['1', ALLOWED_EMAIL], ['2', ALLOWED_EMAIL]]) {
    check(`ciklus-${cycle}-out`, await page.evaluate(() => {
      const match = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Odjavi se'));
      if (!match) return false;
      match.click();
      return true;
    }));
    await page.waitForFunction(() => document.body.innerText.includes('Prijavi se Google nalogom'), { timeout: 20000 });
    const got = await signInViaPopup(browser, page, { email: wanted });
    check(`ciklus-${cycle}-in`, got === wanted, got);
  }

  // 7b. Prefs round-trip: UTC/60 kroz UI, reload i server.
  await gotoScreen(page, '#/podesavanja', 'settings');
  await page.select('#account-zone', 'UTC');
  await page.evaluate(() => {
    const radios = [...document.querySelectorAll('input[name="account-reminder"]')];
    const sixty = radios.find((item) => item.parentElement?.textContent?.includes('60 minuta'));
    if (sixty instanceof HTMLInputElement) sixty.click();
  });
  check('prefs-izbor', await clickButton(page, 'Sačuvaj podešavanja'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await page.reload({ waitUntil: 'load' });
  await gotoScreen(page, '#/podesavanja', 'settings');
  await page.waitForFunction((email) => document.body.innerText.includes(`Prijavljen: ${email}`), { timeout: 20000 }, ALLOWED_EMAIL);
  check('prefs-reload-select', (await page.$eval('#account-zone', (el) => el.value)) === 'UTC');
  const anaDoc = (await listDocs('users')).find((u) => u.id === uidA);
  check('prefs-server', anaDoc?.fields?.reminderMinutes === 60 && anaDoc?.fields?.timeZone === 'UTC');

  // 7c. Cross-tab odjava čisti i drugi tab (deljeno skladište, ne drugi uređaj).
  const tabB = await browser.newPage();
  await tabB.goto(`${origin}/#/podesavanja`, { waitUntil: 'load' });
  await tabB.waitForFunction((email) => document.body.innerText.includes(`Prijavljen: ${email}`), { timeout: 20000 }, ALLOWED_EMAIL);
  await gotoScreen(page, '#/podesavanja', 'settings');
  check('crosstab-out', await page.evaluate(() => {
    const match = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Odjavi se'));
    if (!match) return false;
    match.click();
    return true;
  }));
  await tabB.waitForFunction(() => document.body.innerText.includes('Prijavi se Google nalogom'), { timeout: 20000 });
  const tabBText = await appText(tabB);
  const tabBSession = await tabB.evaluate(() => sessionStorage.getItem('matchahead.session.followedTeamIds')
    ?? sessionStorage.getItem('matchahead.session.manualFixtureIds')
    ?? sessionStorage.getItem('matchahead.session.draftNote'));
  check('crosstab-cisti', !tabBText.includes('Prijavljen:') && tabBSession === null);
  await tabB.close();
  check('crosstab-relogin', (await signInViaPopup(browser, page, { email: ALLOWED_EMAIL })) === ALLOWED_EMAIL);

  // 7d. Otkazani popup: bezbedna poruka bez koda, retry radi.
  check('pred-brisanje-out', await clickButton(page, 'Odjavi se'));
  await page.waitForFunction(() => document.body.innerText.includes('Prijavi se Google nalogom'), { timeout: 20000 });
  {
    const w = popupPage(browser);
    check('cancel-klik', await clickLogin(page));
    const cancelPopup = await w;
    check('cancel-popup', cancelPopup !== null);
    // Zatvori tek kad je handler spreman: zatvaranje praznog popup-a ulazi
    // u drugi SDK put od korisničkog otkazivanja. Izmereno: spreman popup
    // daje poruku za ~10s posle zatvaranja, pa 20s čekanja ima 2x marginu.
    await cancelPopup.waitForFunction(() => document.body.innerText.includes('Google.com'), { timeout: 15000 });
    check('cancel-spreman', true);
    try {
      if (!cancelPopup.isClosed()) await cancelPopup.close();
    } catch { /* već zatvoren */ }
    await page.waitForFunction(() => document.body.innerText.includes('Prozor prijave je zatvoren'), { timeout: 20000 });
    const cancelText = await appText(page);
    check('cancel-poruka', cancelText.includes('Prozor prijave je zatvoren') && cancelText.includes('Pokušaj ponovo') && !cancelText.includes('Prijavljen:'));
  }

  // 8. Brisanje dozvoljenog naloga: vidljiva potvrda + brava bez profila.
  const emailAgain = await signInViaPopup(browser, page, { email: ALLOWED_EMAIL });
  check('prijava-brisanje', emailAgain === ALLOWED_EMAIL, emailAgain);
  check('brisanje-korak1', await clickButton(page, 'Obriši nalog i sve podatke'));
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


async function gotoScreen(page, hash, screen) {
  await page.goto(`${page.url().split('#')[0]}${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(
    (expected) => document.querySelector('main')?.dataset.screen === expected && document.querySelector('main h1') !== null,
    { timeout: 15000 },
    screen,
  );
}
