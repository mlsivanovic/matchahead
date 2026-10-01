# Nezavisni pregled integrisanog Auth klijenta i lične DEMO agende (Faze 04 i 06)

**Datum:** 1. oktobar 2026.  
**Pregledač:** Gemini CLI (nezavisni pregled klijenta)  
**Pregledani commit proizvoda (HEAD):** `4bc44b6` (`04 auth klijent: deljeno teardown gasenje sa ensure guardom, tiket pokusaja za kasne failure, unlink dokaz posejanim uredjajima`)  
**Grana:** `mlsivanovic/matchahead-auth-client`  
**Referentni komiti u lancu:**  
- `5246e6d` — Izmeštanje brave brisanja u `accountTombstones` van stabla korisnika  
- `bbb2783` — Bezbednosni pregled jezgra naloga i Firestore pravila (Faza 04)  
- `d66b127` — Prethodni klijentski commit integracije (vraćen na doradu usled blokirajućih nalaza)  
- `f88f960` — Prethodni izveštaj o pregledu (zamenjen ovim ažuriranim i strogo ograničenim izveštajem)  
- `c3b1d9b` i `1625323` — Samostalne UI komponente lične agende i DOM izveštaj (Faza 06)  

---

## 1. Sažetak (Executive Summary)

U ovom ciklusu izvršen je ponovni, nezavisni audit integrisanog klijentskog koda nakon uklanjanja blokirajućih trka identifikovanih u koordinatorskom izveštaju (`04-06-coordinator-checkpoint.md`). Proizvodni commit `4bc44b6` otklanja ranije blokade:
1. **Razrešena trka gašenja sesije (`firebase-app.ts`):** Uvedeno je deljeno `teardown` obećanje koje sprečava tiho recikliranje app-a koji se još gasi. `ensureFirebaseSession` baca izuzetak ukoliko se pozove tokom aktivnog gašenja, dok sva stvarna mesta kreiranja sesije (`signIn`, `cycleSession`, `handleUser`, `useEffect`) disciplinovano čekaju `teardown` barijeru.
2. **Vlasništvo pokušaja prijave (`account-controller.ts` i `use-account.ts`):** `beginSignIn` generiše i vraća značku pokušaja `{ uid, seq, endedEpoch }`. Metoda `noticeFailure` vezuje grešku isključivo za taj pokušaj, čime je onemogućeno da zakašnjeli neuspeh pop-upa (ili zatvaranje prozora) prebaci novi nalog ili novi klik u grešku, niti da obriše privatne podatke aktivnog korisnika.
3. **Zaštita stanja pri odjavi i brisanju (`settleUidAfterAccountEnd`):** Obe `finally` grane u `use-account.ts` čiste `lastUid` samo ukoliko on i dalje odgovara nalogu koji se odjavio ili obrisao, sprečavajući da kasni završetak operacije obriše novijeg vlasnika.
4. **Verifikacija raskida veze uređaja sa posejanim podacima (`check-auth-browser.mjs`):** Uklanjanje uređaja se više ne dokazuje trivijalno praznom kolekcijom. Test pre odjave seje dokument tekuće instalacije i dokument drugog uređaja; nakon odjave, tekući dokument je obrisan pod živim Firestore pravilima, dok drugi uređaj ostaje netaknut.
5. **Deterministički cancel tok u browser harnessu:** Zatvaranje pop-up prozora se vrši tek nakon što je `Google.com` emulator handler spreman (`cancel-spreman`), čime se obezbeđuje čist `auth/popup-closed-by-user` signal unutar predviđenih tajmera.

Ranije tvrdnje o „potpunoj pokrivenosti” i „produkcionoj spremnosti” su odbačene. Ocena je striktno ograničena na ugovore domena, lokalne Firestore bezbednosna pravila i emulatore.

**Konačna ocena:** **PRIHVATLJIVO ZA INTEGRACIJU U MAIN U OKVIRU ZADATOG OPSEGA (APPROVED UNDER BOUNDED SCOPE)**.

---

## 2. Analiza blokirajućih nalaza i ocena fail-first regresija

### 2.1. Teardown barijera (`firebase-app.ts`)
- **Problem na `d66b127`:** `disposeFirebaseSession()` je postavljao `session = null` pre nego što bi `deleteApp(active.app)` završio. Konkurentni poziv je odmah vraćao `void` jer je video `session === null`. Pozivalac bi potom pozvao `ensureFirebaseSession()`, a SDK registar bi vratio stari app koji se tek gasi, što bi na kraju dovelo do `app-deleted` greške usred nove prijave.
- **Fail-first dokaz:** Skripta `/tmp/matchahead-session-teardown-repro.cjs` je reprodukovala ovo ponašanje sa stvarnim SDK-om (exit 0 uz `next.app.isDeleted === true`).
- **Ispravka u `4bc44b6`:** 
  - Uvedena deljena promenljiva `teardown: Promise<void> | null`.
  - `disposeFirebaseSession()` čeka postojeći `teardown` ukoliko je sesija već u procesu gašenja.
  - `ensureFirebaseSession()` baca grešku ako se pozove dok je `teardown !== null`.
  - Nova regresija `apps/web/test/session-teardown.test.ts` (4 testa) proverava preklapanje, barijeru remounta i zabranu kreiranja tokom gašenja sa stvarnim `firebase/app` SDK-om. Na starom kodu 3 testa padaju (fail-first potvrđen).

### 2.2. Zakašnjeli popup failure i značka pokušaja (`account-controller.ts`)
- **Problem na `d66b127`:** `noticeFailure` je uzimao trenutni tiket gejta (`this.gate.ticket()`). Ako korisnik klikne prijavu, pa se predomisli i klikne ponovo, ili ako se u međuvremenu uloguje drugi korisnik, zakašnjelo odbijanje prvog pop-upa bi pozvalo `applyError` na novom tiketu i obrisalo podatke novog korisnika.
- **Fail-first dokaz:** Novi test u `apps/web/test/account-ownership.test.ts` (`stari failure posle novog klika ostaje bez dejstva` i `stari failure posle dolaska i kraja identiteta ostaje bez dejstva`) pada na starom kodu gde se greška bezuslovno primenjivala.
- **Ispravka u `4bc44b6`:** `beginSignIn` vraća značku `{ uid: this.gate.uid, seq: this.nextSignInSeq(), endedEpoch: this.endedEpoch }`. Metoda `noticeFailure(message, attempt)` proverava sva tri polja pre poziva `applyError`. Ukoliko je promenjen UID, redni broj klika ili epoha identiteta, greška se ignoriše.

### 2.3. Razrešavanje `lastUid` u `finally` granama (`use-account.ts`)
- **Problem na `d66b127`:** `deleteAccount().finally` je bezuslovno postavljao `lastUid.current = null`. Ukoliko bi nova prijava stigla pre nego što se sporo brisanje prethodnog naloga razreši, novi UID bi bio obrisan iz reference.
- **Ispravka u `4bc44b6`:** Obe grane (`signOut` i `deleteAccount`) delegiraju na `settleUidAfterAccountEnd(current, endedUid)`. Referenca se nulira samo ukoliko i dalje odgovara nalogu koji se gasio. Pokriveno namenskim testom u `apps/web/test/account-uid-settlement.test.ts`.

### 2.4. Dokaz raskida veze uređaja sa posejanim podacima (`check-auth-browser.mjs`)
- **Problem na `d66b127`:** Provera `odjava-unlink` je samo konstatovala da je lista uređaja prazna pre i posle odjave, što nije bio dokaz brisanja postojećeg zapisa pod pravilima.
- **Ispravka u `4bc44b6`:** Pre klika na odjavu, test kroz emulator admin REST API upisuje dva validna dokumenta: dokument tekuće instalacije (`installationId`) i dokument drugog uređaja (`dev-drugi-uredjaj-0001`). Nakon odjave, test potvrđuje:
  1. `odjava-seed`: Oba dokumenta su postojala pre odjave (`seeded.length === 2`).
  2. `odjava-unlink`: Dokument tekuće instalacije je obrisan, dok je drugi uređaj očuvan (`leftover.length === 1 && leftover[0].id === 'dev-drugi-uredjaj-0001'`).

---

## 3. Razgraničenje autorovih dokaza i nezavisnih verifikacija

Sve nezavisne provere pokrenute su u čistom radnom stablu nad commitom `4bc44b6`.

| Grupa provera | Naredba / Izvršilac | Ishod / Rezultat | Trajanje / Detalji |
| :--- | :--- | :---: | :--- |
| **Tipovi (TypeScript)** | `./apps/web/node_modules/.bin/tsc --noEmit -p apps/web` (Gemini) | **0 grešaka** (Exit 0) | Proverena celokupna web aplikacija sa novim tipovima pokušaja. |
| **Domen testovi** | `node --experimental-strip-types --test packages/domain/test/*.test.ts` (Gemini) | **24/24 PASS** (Exit 0) | 115 ms. Ugovori rasporeda, identiteta i profila očuvani. |
| **Ugovori podataka** | `node scripts/check-data-contracts.mjs` (Gemini) | **24/24 PASS** (Exit 0) | 114 ms. Validacija sintetičkih i domenskih scenarija. |
| **Jedinični klijent & regresije** | `node --experimental-strip-types --test apps/web/test/*.test.ts` (Gemini) | **73/73 PASS** (Exit 0) | 281 ms. Uključuje 4 testa za `session-teardown`, 5 za `account-ownership` i 1 za `account-uid-settlement`. |
| **Pravila i izolacija (Emulator)** | `node scripts/check-auth.mjs` (Gemini) | **6/6 emulator PASS + 9/9 unit PASS** (Exit 0) | 2.6 s. Odbijanje tuđih upisa, izolacija pod zivim pravilima, tombstone status. |
| **PWA integracija** | `node apps/web/scripts/check-pwa.mjs` (Gemini) | **11/11 PASS** (Exit 0) | Dva build prolaza, offline servisiranje omotača i rasporeda, 1 SW, Pages baza. |
| **Headless browser harness** | `node apps/web/scripts/check-auth-browser.mjs` (Gemini) | **52/52 PASS** (Exit 0) | Chromium, pravi popup tok, 2 korisnika, posejani unlink, cancel-spreman, brisanje i brava. |
| **Nezavisni Incognito kontekst** | Namenska skripta (vidi sekciju 4) (Gemini) | **PASS** (Exit 0) | 3.0 s. `ana@example.com` povukla profil, omiljene i UTC zonu bez deljenog `localStorage`. |
| **Responzivnost na 360 px** | Puppeteer screenshot provera (Gemini) | **PASS** (Exit 0) | `scrollWidth === clientWidth === 360` na sve 4 rute (bez horizontalnog overflow-a). |

---

## 4. Reproduktibilni dokaz nezavisnog browser konteksta

Kako autorov test u `check-auth-browser.mjs` koristi tabove unutar istog browser konteksta (što dokazuje deljeno skladište, ali ne i čist mrežni prenos bez lokalnih tragova), Gemini je izvršio nezavisnu proveru sa potpuno izolovanim incognito kontekstom (`browser.createBrowserContext()`).

### Naredba za reprodukciju:
```bash
node -e '
import { writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import puppeteer from "./apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const DIST = "/tmp/matchahead-auth-browser-dist";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  const file = urlPath === "/" ? "index.html" : urlPath.slice(1);
  try {
    res.writeHead(200, { "content-type": mime["." + file.split(".").pop()] ?? "application/octet-stream" });
    res.end(readFileSync(join(DIST, file)));
  } catch {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(DIST, "index.html")));
  }
});
await new Promise((r) => server.listen(39875, "127.0.0.1", r));
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
function popupPage(b) {
  return new Promise((resolve) => {
    const onTarget = async (target) => {
      if (target.type() === "page") {
        const page = await target.page();
        if (page) { b.off("targetcreated", onTarget); resolve(page); }
      }
    };
    b.on("targetcreated", onTarget);
  });
}
const proofLog = [];
const log = (msg) => { console.log(msg); proofLog.push(msg); };
try {
  log("=== REPRODUCIBLE INCOGNITO CONTEXT PROOF ===");
  log("Start time: " + new Date().toISOString());
  const incognito = await browser.createBrowserContext();
  const page = await incognito.newPage();
  await page.goto("http://127.0.0.1:39875/#/podesavanja", { waitUntil: "load" });
  const waitPopup = popupPage(browser);
  await page.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.innerText.includes("Prijavi se Google"))?.click(); });
  const popup = await waitPopup;
  await popup.waitForFunction(() => document.body.innerText.includes("Google.com"), { timeout: 15000 });
  await popup.evaluate(() => { [...document.querySelectorAll("button, li, [role=\"button\"]")].find(el => el.innerText.includes("ana@example.com"))?.click(); });
  await new Promise(r => setTimeout(r, 2000));
  if (!popup.isClosed()) await popup.evaluate(() => { [...document.querySelectorAll("button")].find(b => b.innerText.includes("Sign in with Google"))?.click(); });
  await page.waitForFunction(() => document.body.innerText.includes("Prijavljen: ana@example.com"), { timeout: 20000 });
  const pressedFavorites = await page.$$eval(".club-list button[aria-pressed=\"true\"]", items => items.length);
  const selectedZone = await page.$eval("#account-zone", el => el.value);
  log("Verification: pressedFavorites=" + pressedFavorites + ", selectedZone=" + selectedZone);
  if (pressedFavorites < 1 || selectedZone !== "UTC") throw new Error("Assertion failed");
  log("PASS: Fresh incognito browser context loaded profile and favorites over Firestore network without shared local storage.");
  log("End time: " + new Date().toISOString());
  await incognito.close();
  writeFileSync("/tmp/matchahead-incognito-proof.txt", proofLog.join("\n") + "\n", "utf8");
} finally {
  await browser.close();
  server.close();
}
'
```

### Sačuvani izlazni artefakt (`/tmp/matchahead-incognito-proof.txt`):
```text
=== REPRODUCIBLE INCOGNITO CONTEXT PROOF ===
Start time: 2026-10-01T15:50:52.374Z
Verification: pressedFavorites=1, selectedZone=UTC
PASS: Fresh incognito browser context loaded profile and favorites over Firestore network without shared local storage.
End time: 2026-10-01T15:50:55.350Z
```

---

## 5. Status konfiguracije i promenljivih okruženja

Usklađenost handoff dokumentacije i stanja repozitorijuma je potvrđena:
- Koordinator je potvrdio da `gh variable list --repo mlsivanovic/matchahead` vraća svih 6 javnih `VITE_FIREBASE_*` varijabli sa datumom ažuriranja `2026-10-01T12:45:21Z`.
- `docs/handoffs/04-auth-client.md` u commitu `4bc44b6` je ažuriran i više ne sadrži zastarelu tvrdnju o pending varijablama.
- U `.github/workflows/pages.yml` postoji čisto mapiranje varijabli u proces izgradnje.
- Klijentski kod pri odsustvu ovih varijabli ostaje potpuno funkcionalan u javnom DEMO režimu bez grešaka.

---

## 6. Granice testiranja i nedokazani aspekti (NOT_TESTED Bounds)

Sledeće stavke ostaju eksplicitno **NOT_TESTED** i ne smeju se smatrati pokrivenim ovim pregledom:
1. **Pravi Google mobilni OAuth:** Provereno isključivo na Chromium headless pregledaču protiv Firebase Auth emulator widgeta. Ponašanje pravih Google servera, mobilnih webview-a i Safari popup blokera nije provereno.
2. **Produkciona pravila na Firebase Cloudu:** Provereno na lokalnom Firestore emulatoru verzije 1.22.0. Pravila na oblaku nisu deploy-ovana.
3. **Fizičke Push notifikacije i FCM tokeni:** Faza 02 i Faza 09 ostaju BLOCKED/OFF. Klijent ne traži notifikacione dozvole i ne registruje FCM tokene (trošak 0 EUR, bez billing servisa).
4. **Edge CPU i Cloudflare Workers live migracija:** Nije testirano u produkciji; tombstone čišćenje ostaje zadatak budućeg backend radnika.
5. **Fizički drugi uređaj:** Incognito test dokazuje da se podaci prenose preko Firestore mreže na novi klijent, ali hardverska odvojenost push tokena i instalacionih ID-jeva na fizičkim telefonima ostaje van opsega ove faze.
6. **Obrada rasporeda i automatski kalendar:** Faze 05 i 07 ostaju blokirane do spajanja ovog lanca u `main`.

---

## 7. Zaključak

Commit `4bc44b6` uspešno otklanja sve blokirajuće nalaze iz prethodne iteracije, uvodi fail-first testove i dokazuje raskid veze uređaja sa posejanim podacima. U okviru definisanih granica i emulator okruženja, klijentski kod je spreman za integraciju u `main`.
