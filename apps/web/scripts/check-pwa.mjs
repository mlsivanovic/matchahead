import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(webRoot, '../..');
const dirA = '/tmp/matchahead-pwa-a';
const dirB = '/tmp/matchahead-pwa-b';
const dirB2 = '/tmp/matchahead-pwa-b2';
const chromePath = '/usr/bin/google-chrome-stable';
const basePath = '/repo/';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function build(id, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  run(process.execPath, [resolve(webRoot, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], webRoot);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readDist(dir, name) {
  return readFileSync(join(dir, name), 'utf8');
}

function staticChecks(dir) {
  const manifest = JSON.parse(readDist(dir, 'manifest.webmanifest'));
  assert(manifest.id === basePath, `id manifesta je ${manifest.id}`);
  assert(manifest.scope === basePath, `scope manifesta je ${manifest.scope}`);
  assert(manifest.start_url === basePath, `start_url manifesta je ${manifest.start_url}`);
  assert(manifest.display === 'standalone', 'display nije standalone');
  assert(manifest.name === 'MatchAhead', 'ime manifesta');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert(sizes.includes('192x192') && sizes.includes('512x512'), 'nedostaju ikone 192 i 512');
  const index = readDist(dir, 'index.html');
  assert(index.includes('href="/repo/manifest.webmanifest"'), 'manifest nije na /repo/');
  assert(index.includes('src="/repo/assets/'), 'skripta nije na /repo/');
  assert(!index.includes('src="/assets/'), 'skripta pretpostavlja koren domena');
  assert(readDist(dir, '404.html').includes('"/repo/"'), '404 ne zna za /repo/');
  const sw = readDist(dir, 'sw.js');
  assert(sw.includes('matchahead-shell-and-future-fcm'), 'worker nema oznaku jednog scope-a');
  assert(!sw.includes('firebase-messaging-sw'), 'worker pominje drugi FCM fajl');
  assert(!sw.includes('getToken('), 'worker zove getToken');
  assert(sw.includes('demo-schedule.json'), 'worker ne kešira DEMO raspored');
  const scripts = readdirSync(join(dir, 'assets')).filter((name) => name.endsWith('.js'));
  const app = scripts.map((name) => readFileSync(join(dir, 'assets', name), 'utf8')).join('\n');
  const registers = app.split('serviceWorker.register').length - 1;
  assert(registers === 1, `registracija service worker-a: ${registers}`);
  assert(!app.includes('firebase-messaging-sw'), 'aplikacija registruje drugi worker');
  assert(!app.includes('findFixtures'), 'aplikacija zove fazu 05');
  const schedule = JSON.parse(readDist(dir, 'data/demo-schedule.json'));
  assert(schedule.kind === 'synthetic-demo' && schedule.publication === 'forbidden', 'raspored nije zabranjen DEMO');
  console.log('PASS: statička provera /repo/ manifesta, jednog workera i DEMO rasporeda');
}

function startServer(state) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith(basePath)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('nema pristupa korenu domena');
      return;
    }
    if (state.failShell && url.pathname.includes('/assets/') && url.pathname.endsWith('.js')) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('shell failed');
      return;
    }
    let relative = decodeURIComponent(url.pathname.slice(basePath.length));
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    const file = normalize(join(state.dir, relative));
    if (!file.startsWith(state.dir)) {
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
      const fallback = readFileSync(join(state.dir, '404.html'));
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

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function openRoute(page, hash) {
  await page.click(`nav a[href="${hash}"]`);
  await page.waitForFunction((expected) => location.hash === expected, {}, hash === '#/' ? '#/' : hash);
}

run(process.execPath, ['--experimental-strip-types', '--test', ...readdirSync(join(webRoot, 'test')).filter((name) => name.endsWith('.test.ts')).map((name) => join(webRoot, 'test', name))], webRoot);
run(process.execPath, [resolve(webRoot, 'node_modules/typescript/bin/tsc'), '--noEmit'], webRoot);

const savedBase = process.env.MATCHAHEAD_BASE;
const savedBuild = process.env.MATCHAHEAD_BUILD;
process.env.MATCHAHEAD_BASE = basePath;
process.env.MATCHAHEAD_BUILD = 'build-a';
build('build-a', dirA);
process.env.MATCHAHEAD_BUILD = 'build-b';
build('build-b', dirB);
if (savedBase === undefined) delete process.env.MATCHAHEAD_BASE;
else process.env.MATCHAHEAD_BASE = savedBase;
if (savedBuild === undefined) delete process.env.MATCHAHEAD_BUILD;
else process.env.MATCHAHEAD_BUILD = savedBuild;

staticChecks(dirA);
cpSync(dirB, dirB2, { recursive: true });
appendFileSync(join(dirB2, 'sw.js'), '\n// drugi pokusaj\n');

const state = { dir: dirA, failShell: false };
const { server, port } = await startServer(state);
const origin = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const rootResponse = await fetch(`${origin}/`);
  assert(rootResponse.status === 404, 'koren domena nije odbijen');
  assert((await rootResponse.text()).includes('nema pristupa korenu domena'), 'koren nema očekivanu poruku');
  assert((await fetch(`${origin}/sw.js`)).status === 404, 'worker je na korenu domena');
  assert((await fetch(`${origin}/repo/icons/icon-512.png`)).status === 200, 'ikona 512 nije dostupna');
  assert((await fetch(`${origin}/repo/manifest.webmanifest`)).status === 200, 'manifest nije dostupan');
  console.log('PASS: server odbija koren domena i servira /repo/');

  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  await page.goto(`${origin}/repo/`, { waitUntil: 'load' });
  await page.waitForSelector('h1');
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Početna', 'početni ekran');
  assert((await page.$eval('body', (element) => element.innerText)).includes('DEMO'), 'nema DEMO oznake');
  assert((await page.$eval('[data-stale]', (element) => element.dataset.stale)) === 'true', 'zastareo raspored nije označen');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Podaci su zastareli'), 'nema rečenice o zastarelosti');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Ovo nije svež sportski izvor'), 'online prikaz zvuči kao svež izvor');
  assert(await overflow(page) <= 1, `preliv na početnoj: ${await overflow(page)}`);

  const navHeights = await page.$$eval('nav a', (links) => links.map((link) => ({
    text: link.textContent ?? '',
    height: link.getBoundingClientRect().height,
  })));
  assert(navHeights.length === 4, 'navigacija nema četiri stavke');
  assert(navHeights.every((item) => item.height >= 48), `stavke navigacije su preniske: ${JSON.stringify(navHeights)}`);

  await page.focus('nav a[href="#/klubovi"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/klubovi');
  assert((await page.$eval('main', (element) => element.dataset.screen)) === 'clubs', 'Enter nije otvorio klubove');
  await page.focus('#club-search');
  await page.keyboard.type('zvezda');
  const clubCount = await page.$$eval('.club-list li', (items) => items.length);
  assert(clubCount === 1, `pretraga zvezda daje ${clubCount}`);
  await page.click('#club-search', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type('DEMO');
  assert(await page.$$eval('.club-list li', (items) => items.length) === 0, 'DEMO protivnik je u izboru');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Nema kluba'), 'nema prazne pretrage');
  await page.click('#club-search', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  const followedName = await page.evaluate(() => {
    const button = document.querySelector('.club-list button');
    const name = button?.parentElement?.querySelector('strong')?.textContent ?? '';
    button?.click();
    return name;
  });
  assert(followedName.includes('Crvena zvezda'), `praćen je ${followedName}`);
  assert((await page.$eval('.club-list button', (element) => element.textContent))?.includes('Pratim'), 'dugme nije označilo praćenje');
  assert(await overflow(page) <= 1, 'preliv na klubovima');

  await openRoute(page, '#/moje');
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Moje utakmice', 'moje utakmice');
  assert((await page.$eval('body', (element) => element.innerText)).includes('DEMO Rival'), 'praćeni klub ne vidi protivnika van kataloga');
  await page.focus('#draft-note');
  await page.keyboard.type('beleška za utakmicu');
  assert(await overflow(page) <= 1, 'preliv na mojim utakmicama');

  await openRoute(page, '#/podesavanja');
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Podešavanja', 'podešavanja');
  assert((await page.$eval('body', (element) => element.innerText)).includes('BLOCKED'), 'podešavanja ne čuvaju da je faza 02 blokirana');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Dodaj na početni ekran'), 'nema iPhone uputstva');
  await page.select('#zone', 'UTC');
  assert(await overflow(page) <= 1, 'preliv na podešavanjima');
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Obriši lokalni sadržaj'));
    button?.click();
  });
  assert((await page.$eval('#zone', (element) => element.value)) === 'UTC', 'brisanje sesije je obrisalo zonu uređaja');
  await openRoute(page, '#/moje');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Nema praćenih klubova'), 'odjava nije obrisala praćenje');
  assert((await page.$eval('#draft-note', (element) => element.value)) === '', 'odjava nije obrisala belešku');
  console.log('PASS: četiri ekrana, tastatura, 360 px, izbor klubova i brisanje sesije');

  await page.setViewport({ width: 1280, height: 800 });
  await openRoute(page, '#/');
  assert(await overflow(page) <= 1, 'preliv na 1280 px');
  await page.setViewport({ width: 360, height: 740 });

  await page.goto(`${origin}/repo/#/podesavanja`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Podešavanja', 'osvežavanje hash putanje');
  await page.goto(`${origin}/repo/klubovi`, { waitUntil: 'load' });
  await page.waitForFunction(() => location.pathname === '/repo/' && location.hash === '#/klubovi');
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Klubovi', '404 nije vratio hash rutu');
  console.log('PASS: osvežavanje i putanja /repo/klubovi');

  await page.goto(`${origin}/repo/`, { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) return false;
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((item) => item.url.includes('demo-schedule.json'))) return true;
    }
    return false;
  });
  const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((item) => item.scope));
  assert(scopes.length === 1 && scopes[0]?.endsWith('/repo/'), `scope registracije: ${scopes.join(',')}`);

  const client = await page.createCDPSession();
  await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  const installability = await client.send('Page.getInstallabilityErrors');
  const errors = installability.installabilityErrors ?? [];
  assert(errors.length === 0, `instalacija ima greške: ${JSON.stringify(errors)}`);
  const manifestResponse = await client.send('Page.getAppManifest');
  assert(!manifestResponse.errors?.length, `manifest greške: ${JSON.stringify(manifestResponse.errors)}`);
  console.log('PASS: Chrome nema installability grešaka');

  const appBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', `--app=${origin}/repo/#/podesavanja`],
  });
  try {
    const appPage = (await appBrowser.pages())[0] ?? await appBrowser.newPage();
    await appPage.goto(`${origin}/repo/#/podesavanja`, { waitUntil: 'load' });
    const standalone = await appPage.evaluate(() => window.matchMedia('(display-mode: standalone)').matches);
    assert(standalone, 'Chrome --app nije otvorio samostalni prozor');
    assert(await appPage.$('[data-standalone="true"]'), 'samostalni prozor nije prikazao oznaku');
  } finally {
    await appBrowser.close();
  }

  const ios = await browser.newPage();
  await ios.setViewport({ width: 390, height: 844 });
  await ios.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  await ios.goto(`${origin}/repo/#/podesavanja`, { waitUntil: 'load' });
  assert((await ios.$eval('[data-ios-install]', (element) => element.dataset.iosInstall)) === 'true', 'iPhone uputstvo nije istaknuto');
  await ios.close();
  console.log('PASS: samostalni prikaz i iPhone uputstvo');

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' });
  const network = await page.evaluate(async () => {
    try {
      await fetch(`/repo/nema-${Date.now()}.txt`, { cache: 'no-store' });
      return 'open';
    } catch {
      return 'failed';
    }
  });
  assert(network === 'failed', 'mreža nije bila ugašena');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const offlineText = await page.$eval('body', (element) => element.innerText);
  assert(offlineText.includes('DEMO Rival') || offlineText.includes('FK Crvena zvezda'), 'offline nema raspored');
  assert((await page.$eval('[data-offline]', (element) => element.dataset.offline)) === 'true', 'offline oznaka');
  assert((await page.$eval('[data-stale]', (element) => element.dataset.stale)) === 'true', 'offline gubi oznaku zastarelosti');
  assert(offlineText.includes('ne donosi sveže termine'), 'offline tvrdi sveže termine');
  assert(!offlineText.includes('Termini su sveži'), 'offline ima lažnu svežinu');
  await openRoute(page, '#/klubovi');
  assert((await page.$eval('h1', (element) => element.textContent)) === 'Klubovi', 'offline navigacija');
  console.log('PASS: posle jednog online učitavanja omotač i raspored rade offline');

  await page.setOfflineMode(false);
  await page.goto(`${origin}/repo/`, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const leaked = await page.evaluate(async () => {
    await fetch('/repo/oauth/token').catch(() => undefined);
    const found = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (/oauth|googleapis|accounts\.google|identitytoolkit|securetoken/i.test(request.url)) found.push(request.url);
      }
    }
    return found;
  });
  assert(leaked.length === 0, `keš ima osetljiv URL: ${leaked.join(',')}`);
  console.log('PASS: OAuth odgovor nije u kešu');

  state.failShell = true;
  state.dir = dirB;
  const failed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    let rejected = false;
    try {
      await registration.update();
    } catch {
      rejected = true;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 800));
    return {
      rejected,
      waiting: Boolean(registration.waiting),
      build: document.querySelector('[data-app-build]')?.getAttribute('data-app-build'),
    };
  });
  assert(failed.build === 'build-a', `neuspeo deploy je zamenio prikaz: ${failed.build}`);
  assert(!failed.waiting, 'neuspeo deploy je ostavio čekajuću verziju');
  const stillThere = await page.$eval('body', (element) => element.innerText);
  assert(stillThere.includes('DEMO'), 'neuspeo deploy je obrisao raspored');
  console.log(`PASS: neuspeo novi omotač nije aktiviran i stari keš je ostao (update odbijen: ${failed.rejected})`);

  state.failShell = false;
  state.dir = dirB2;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.waitForSelector('[data-update-ready="true"]');
  await openRoute(page, '#/moje');
  await page.focus('#draft-note');
  await page.keyboard.type('unos u toku');
  await page.click('[data-update-ready] button');
  await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  assert((await page.$eval('[data-app-build]', (element) => element.dataset.appBuild)) === 'build-a', 'verzija se učitala tokom unosa');
  assert((await page.$eval('#draft-note', (element) => element.value)).includes('unos u toku'), 'unos je izgubljen');
  assert((await page.$eval('body', (element) => element.innerText)).includes('Unos je u toku'), 'nema objašnjenja zašto reload čeka');
  await page.focus('#draft-note');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  await page.click('[data-update-ready] button');
  await page.waitForFunction(() => document.querySelector('[data-app-build]')?.getAttribute('data-app-build') === 'build-b');
  assert((await page.$eval('body', (element) => element.innerText)).includes('DEMO'), 'nova verzija nema DEMO raspored');
  const scopesAfter = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((item) => item.scope));
  assert(scopesAfter.length === 1, `posle ažuriranja ima ${scopesAfter.length} registracija`);
  console.log('PASS: nova verzija čeka kraj unosa i zamenjuje omotač');
} finally {
  await browser.close();
  server.close();
}

console.log('PASS: provera PWA je završena');
