# Nezavisni završni QA pregled: Servis rasporeda i klijent (Faza 05)

**Datum:** 6. oktobar 2026.  
**Pregledač:** Gemini CLI (nezavisna završna verifikacija i revizija faze 05)  
**Konačni integrisani commit proizvoda (HEAD):** `a2ab384a3a74ff27135317164e3260e790db90dc` (`fix: preserve the latest real aggregate source success time`)  
**Status konačne revizije:** **FINAL APPROVED UNDER BOUNDED SCOPE (KONAČNO ODOBRENO U OKVIRU ZADATOG OPSEGA — PREPORUČENO ZA GITHUB PUSH)**.  
*Svi tehnički, arhitektonski i funkcionalni defekti u domenu, servisu i klijentu su u potpunosti otklonjeni i nezavisno verifikovani. Faza 05 se ne proglašava formalno završenom (DONE) jer status prava na javne izvore ostaje `unknown`, produkcija ostaje `source-blocked`, a Cloudflare nalog ostaje pod neproverenim nivoom pretplate bez deploya.*

---

## 1. Sažetak nalaza (Executive Summary)

Na konačnom integrisanom komitu `a2ab384a3a74ff27135317164e3260e790db90dc` sprovedena je nezavisna, sveobuhvatna završna QA verifikacija celokupnog lanca Faze 05.

Sve komponente sistema — domenski ugovori, servis rasporeda pod Node 22/26 i `workerd` okruženjem, klijentski PWA kod, TypeScript build, prava browser provera, izolovani Firebase emulacioni tokovi, end-to-end granica sa klijentskim validatorom i nezavisne provere parsera nad sačuvanim istorijskim izvorima — uspešno su verifikovane sa izlaznim kodom 0.

### 1.1. Ključni verifikovani ishodi
1. **Domenski ugovori (`packages/domain`):** Svih **35 testova** prolazi sa exit 0 (`node scripts/check-data-contracts.mjs`, trajanje 147 ms na Node v26.7.0). Očuvani su ugovori o stabilnom identitetu mečeva, razdvojenosti FK i KK klubova, determinističkom spajanju večitog derbija, semantici statusa `time_tbd` (`startsAtUtc: null`), i pravilima opoziva izvora unutar prozora keša.
2. **Servis rasporeda i workerd (`experiments/schedule-service`):** Svih **55 testova** prolazi sa exit 0 (`node scripts/check-schedule-service.mjs`, trajanje 23.5 s na Node v26.7.0). Unutar `worker.test.ts` uspešno je izvršeno **17 testova** (1 statička provera bundle-a, 1 test čitača tela, i 15 `workerd` slučajeva izvođenja koji pokrivaju Durable Object perzistenciju, SQLite tabelu, kvote po nalogu/IP-u, CORS, deljenje ligaške strane, i izvršavanje parsera unutar izolata uz merenje wall-clock vremena: FSS HTML 39 ms, Evroliga PDF 48 ms).
3. **Klijentski PWA testovi (`apps/web`):** Svih **113 testova** prolazi sa exit 0 (`npm --prefix apps/web run check`, trajanje 337 ms na Node v26.7.0; klijentski kod je 100% identičan prethodno verifikovanom komitu `b3cdbf2`). Pokriveni su svi scenariji: unificirana agenda, prekid zahteva pri zameni naloga, tajmaut na telu odgovora (20 s), stroga semantika revizija i detekcija zlonamernog/neusklađenog tela.
4. **TypeScript i produkcioni build:** `npm --prefix apps/web run build` prolazi sa 0 grešaka (`tsc --noEmit` i `vite build` generišu klijentski bundle od 855 KB i service worker od 59.4 KB sa 13 precache unosa).
5. **Mobilna browser provera (`apps/web/scripts/check-schedule-ui.mjs`):** Svih **16 provera** prolazi sa exit 0 u pravom Puppeteer browseru na 390px i 360px širini, uz zamrznuti sat browsera na 1. oktobar u podne (`d746ccd`).
6. **PWA regresija (`scripts/check-pwa.mjs`):** Svih **11 provera** prolazi sa exit 0 (manifest, shell, `/repo/` baza, instalabilnost, offline keširanje omotača).
7. **Izolovani Auth emulator (`apps/web/scripts/check-auth-browser.mjs` adaptiran za portove 9099/8080):** Svih **52 provere** u Chromium browseru prolazi sa exit 0 kroz Firebase emulator popup widget (prijava, odjava, raskid veze instalacije, `accountTombstones` brava). Spoljni emulatori na portovima `9098`/`8081` ostali su potpuno netaknuti.
8. **Serversko-klijentska granica (`ScheduleService` -> `parseFindResponse`):** Svih **13 provera** u skripti `/tmp/matchahead-05-boundary-qa.mjs` prolazi sa exit 0 (8 stvarnih poziva `ScheduleService.handle()` za 4 kluba u produkcijskom i sintetičkom režimu + 5 namenskih semantičkih scenarija klijentske šeme).
9. **Pomoćne regresije deljenog keša i novih provajdera:**
   - `/tmp/matchahead-05-shared-source-regression.mjs`: **PASS (exit 0)** — Jedno ligaško preuzimanje opslužuje oba kluba.
   - `/tmp/matchahead-05-new-provider-regression.mjs`: **PASS (exit 0)** — Novoobjavljeni kup stiže do oba kluba uz tačno 2 ukupna preuzimanja.
   - `/tmp/matchahead-05-existing-provider-regression.mjs`: **PASS (exit 0)** — Istekla liga na 16:00 preuzima ažuriranu ligu bez kvarenja kupa.
10. **Nezavisni brojevi mečeva na sačuvanim istorijskim snimcima od 1. oktobra 2026:**
    - **FSS Superliga:** Tačno **182 meča** (26 kola po 7 mečeva), po 1 meč po kolu za Partizan i Zvezdu. Dupli blokovi 11. kola iz gornjeg widgeta se filtriraju bez lažnog konflikta. `complete: true`.
    - **ABA liga:** Tačno **180 mečeva**. U regularnom delu (kola 1–18) Partizan ima 18, a Zvezda **18 mečeva**. Otklonjen je kvar sa deljenjem po dvotački u imenu sponzora `m:tel` (meč 41). `complete: true`.
    - **Evroliga PDF:** Tačno **380 mečeva** i tačno **38 kola** (po 10 mečeva po kolu). Oba kluba imaju po 38 mečeva, uz 2 derbija (kolo 7 i kolo 28). Geometrijsko mapiranje zaglavlja kola po Y-koordinati dodeljuje kola 1..38. `complete: true`.
11. **Žive probe izvora (`scripts/probe-schedule-sources.mjs`):** Svih **8 proba** prolazi sa exit 0 na živoj mreži na dan 6. oktobra 2026, uz pravilno evidentiranje očekivanog 429 bot-challenge-a na Game Center-u i ograničenja besplatnog TheSportsDB ključa na 15 mečeva.

---

## 2. Razrešenje prethodnih defekata i istorijski fail-first dokazi

Tokom ciklusa verifikacije Faze 05 uspešno su dijagnostikovani, reprodukovani kroz fail-first testove i razrešeni sledeći problemi:

### 2.1. Deljeni keš takmičenja za oba kluba (Razrešeno u `e5d434b` i `8db3ad1`)
- **Istorijski problem:** Na komitu `bbbe9bb`, ključ trajnog keša servisa bio je vezan isključivo za par klub+sezona (`teamId:seasonId`). Uzastopni pozivi za KK Partizan, zatim za KK Crvena zvezda, pa ponovo za KK Partizan rezultovali su u kumulativnom broju stvarnih preuzimanja `1 -> 2 -> 2`, umesto da prvo preuzimanje lige opsluži oba kluba.
- **Fail-first dokaz:** Skripta `/tmp/matchahead-05-shared-source-regression.mjs` je na `bbbe9bb` padala sa izlaznim kodom 1 (`AssertionError: actual 2 !== expected 1`), evidentirano u koordinatorskom logu `/tmp/matchahead-05-shared-source-fail-first.log`.
- **Verifikovano rešenje na `a2ab384`:** Uvedeno je deljenje stranica lige na nivou `(competitionId, seasonId, provider)` preko `SharedSourcePage`. Ista skripta na `a2ab384` prolazi sa tačno 1 uzvodnim preuzimanjem (`PASS: one league fetch, two validated club views, same derby identity/revision`, exit 0).

### 2.2. Projekcija novoobjavljenog kupa u svež klupski snimak (Razrešeno u `8db3ad1`)
- **Istorijski problem:** Kada Partizan u 10:00 preuzme ligu, a Zvezda u 10:01 preuzme keširanu ligu i novoobjavljeni kup, ponovni poziv za Partizan u 10:02 je vraćao stari klupski snimak koji je sadržao samo ligu (dobijao je 1 umesto 2 meča), jer klupski snimak nije bio istekao.
- **Fail-first dokaz:** Skripta `/tmp/matchahead-05-new-provider-regression.mjs` je na `e5d434b` padala sa izlaznim kodom 1 (`expected 2 fixtures, actual 1`), evidentirano u koordinatorskom logu `/tmp/matchahead-05-new-provider-fail-first.log`.
- **Verifikovano rešenje na `a2ab384`:** Uvedena je funkcija `projectSourcePages` koja proverava nedostajuća ili novija deljena takmičenja i ažurira klupski snimak bez novog mrežnog poziva. Ista skripta na `a2ab384` prolazi sa exit 0 (`PASS: newly listed cup reaches both strict-validated club responses without refetching`).

### 2.3. Ažuriranje istekle lige bez blokiranja od strane svežeg kupa (Razrešeno u `b3cdbf2`)
- **Istorijski problem:** Ako klupski snimak sadrži ligu (istek 6h) i kup (istek 24h), a liga istekne na 16:00, servis bi preuzeo novu ligu, ali bi domen mogao ponovo iskoristiti klupski snimak jer mu je agregatni `lastSuccessAt` pomeren kasnijim kupom.
- **Verifikovano rešenje na `a2ab384`:** Test `istekla liga objavljuje pomeraj i dok je klupski snimak kupa još svež` u `source-share.test.ts` i pomoćna skripta `/tmp/matchahead-05-existing-provider-regression.mjs` dokazuju da se novo preuzeta liga projektuje u odgovor, a agregatni `checkedAt` pomera na 16:00 bez brisanja kupa (exit 0).

### 2.4. Agregatni sat servisa (`servedClock`) usklađen sa domenskim ugovorom (Razrešeno u `a2ab384`)
- **Istorijski problem:** Na `b3cdbf2`, funkcija `servedClock` je uzimala najstariji `goodAt` preko svih stranica. Domenski ugovor definiše `checkedAt` / `lastSuccessAt` kao najsvežiju uspešnu objavu za traženi tim, dok se svežina pojedinačnih izvora štiti kroz ključeve deljenih stranica i zaobilaženje klupskog keša u `projectSourcePages`.
- **Verifikovano rešenje na `a2ab384`:** `servedClock` koristi najnoviji realni `goodAt` među izvorima koji sadrže traženi klub (`a2ab384`), dok satovi pojedinačnih izvora i manifesti ostaju neizmenjeni. Verifikovano kroz `node scripts/check-schedule-service.mjs` (exit 0) i koordinatorski log `/tmp/matchahead-05-final-aggregate-service.log`.

### 2.5. Zavisnost satnice u browser testu (`check-schedule-ui.mjs`) (Razrešeno u `d746ccd`)
- **Istorijski problem:** Testna skripta je hardkodirala mock termine mečeva na 4. i 5. oktobar 2026. Kada se test izvršava 6. oktobra 2026, browser tretira 4. oktobar kao prošli termin, pa `nextAgendaFixtures` nije prikazivao derbi u sekciji „Sledeća utakmica” (pad na liniji 590: `assert(nextDerby === 1)`). Evidentirano u `/tmp/matchahead-05-oct06-browser-precheck.log`.
- **Verifikovano rešenje na `a2ab384`:** Testni harness je dopunjen zamrzavanjem sata browsera na 1. oktobar u podne (`page.evaluateOnNewDocument`) na sva 3 page objekta. Skripta `check-schedule-ui.mjs` stabilno prolazi sa svih 16 PASS provera (exit 0), evidentirano u `/tmp/matchahead-05-oct06-browser-fixed-clock.log`.

### 2.6. Otklanjanje kvara sa dvotačkom u ABA ligi (`experiments/schedule-service/src/sources/aba.ts`)
- **Istorijski problem:** Deljenje linije parova vršeno je preko obične dvotačke `split(':')`. Domaćin `Igokea m:tel` u 5. kolu (meč 41) sadržao je dvotačku u nazivu sponzora, što je deformisalo naziv gostujućeg tima u `tel:Crvena zvezda Meridianbet` i izgubilo Zvezdin meč 5. kola (zbir je bio 17 umesto 18).
- **Verifikovano rešenje na `a2ab384`:** Razdvajanje timova se vrši po HTML tagu `<span>:</span>` ili razmaknutoj dvotački `\s+:\s+`. Zvezda ima tačno 18 mečeva u regularnom delu, a meč 41 je mapiran na `basketball:xx:igokea-m-tel` i `basketball:rs:crvena-zvezda`.

### 2.7. Geometrijsko mapiranje kola u Evroliga PDF-u (`experiments/schedule-service/src/sources/euroleague-pdf.ts`)
- **Istorijski problem:** `readRows` je proveravao da li se `ROUND \d+` nalazi na neposredno prethodnoj liniji teksta (`lines[index - 1]`). Zbog kolonskog toka teksta u PDF-u, naslovi kola su se nalazili u odvojenim tokovima, pa je `round` ostajao `null` za svih 380 redova.
- **Verifikovano rešenje na `a2ab384`:** Uvedeno je dvodimenzionalno geometrijsko mapiranje po Y-koordinati i stranici. Svih 380 mečeva ima dodeljeno kolo od 1 do 38 (tačno 10 mečeva po kolu), a oba kluba imaju po tačno 38 mečeva uz 2 derbija.

---

## 3. Detaljni rezultati verifikacione matrice na `a2ab384`

| # | Oblast verifikacije | Komanda / Skripta | Rezultat | Izlazni kod | Detalji |
|---|---|---|---|---|---|
| 1 | Domenski ugovori | `node scripts/check-data-contracts.mjs` | **35 / 35 PASS** | `0` | 147 ms na Node v26.7.0. Svi ugovori stabilnog identiteta, razdvojenosti i kvota. |
| 2 | Servis & workerd | `node scripts/check-schedule-service.mjs` | **55 / 55 PASS** | `0` | 23.5 s na Node v26.7.0. 17 testova u `worker.test.ts` (15 workerd izolata), kvote, CORS, sat. |
| 3 | Klijentski testovi | `npm --prefix apps/web run check` | **113 / 113 PASS** | `0` | 337 ms na Node v26.7.0. Validacija tela, tajmaut, abort, unifikacija agende (isti klijentski kod). |
| 4 | Build & TypeScript | `npm --prefix apps/web run build` | **PASS (0 grešaka)** | `0` | `tsc --noEmit` čist; Vite PWA bundle 855 KB. |
| 5 | Browser UI raspored | `node scripts/check-schedule-ui.mjs` | **16 / 16 PASS** | `0` | Puppeteer 390px/360px sa zamrznutim satom na 1. oktobar podne (`d746ccd`). |
| 6 | PWA regresija | `node scripts/check-pwa.mjs` | **11 / 11 PASS** | `0` | Provereni manifest, offline keš, 360px viewport i stabilnost omotača. |
| 7 | Izolovani Auth emulator | Adapted `check-auth-browser.mjs` (9099/8080) | **52 / 52 PASS** | `0` | Firebase emulator popup widget, brisanje brave, netaknuti portovi 9098/8081. |
| 8 | Granica server-klijent | `/tmp/matchahead-05-boundary-qa.mjs` | **13 / 13 PASS** | `0` | 8 stvarnih poziva `ScheduleService` + 5 namensko-validacionih scenarija. |
| 9 | Regresija deljenog keša | `/tmp/matchahead-05-shared-source-regression.mjs` | **PASS (1 fetch)** | `0` | Jedno ligaško preuzimanje opslužuje oba kluba. |
| 10 | Regresija novog kupa | `/tmp/matchahead-05-new-provider-regression.mjs` | **PASS (2 meča)** | `0` | Novoobjavljeni kup stiže do oba kluba bez novog uzvodnog preuzimanja. |
| 11 | Regresija mešanog isteka | `/tmp/matchahead-05-existing-provider-regression.mjs` | **PASS** | `0` | Istekla liga preuzima ažuriranu ligu bez kvarenja kupa. |
| 12 | Sačuvani izvori (brojevi) | Independent parser test | **PASS** | `0` | ABA 18 po klubu, FSS 182, Evroliga 380 (38 kola po 10 mečeva, 2 derbija). |
| 13 | Negativne regresije | Truncated/corrupted inputs | **PASS** | `0` | Skraćeni podaci i netačna sezona striktno vraćaju `complete: false`. |
| 14 | Žive probe izvora | `node scripts/probe-schedule-sources.mjs` | **8 / 8 PASS** | `0` | Svi živi izvori dostupni; opservacije satnica zabeležene bez nagađanja. |

### 3.1. Razgraničenje serverske integracije i validacionih scenarija
U okviru provere granice (`parseFindResponse`) u skripti `/tmp/matchahead-05-boundary-qa.mjs` jasno se razlikuju dve kategorije testova:
1. **Stvarna integracija servisa i klijenta (8 poziva):** Sirovi izlaz metode `ScheduleService.handle()` za sva 4 kluba u produkcijskom (`source-blocked`, `checkedAt: null`) i sintetičkom režimu prosleđuje se direktno klijentskoj funkciji `parseFindResponse`. Svi pozivi su stvarni end-to-end prolazi servisa i vraćaju exit 0.
2. **Namenski validacioni testovi klijentske šeme (5 scenarija):** Konstruisani ispitni omotači prosleđeni direktno u `parseFindResponse` radi provere graničnih semantičkih pravila:
   - Neprazan verifikovani odgovor (`synthetic-demo` sa kompletnom fixtures listom, učesnicima i next pokazivačima).
   - Mešoviti delimičan uspeh (dozvoljeno takmičenje uz prisustvo drugog zabranjenog takmičenja u pokrivenosti).
   - Očuvanje prethodnog stanja (`source_error` uz `cacheStatus: "reused"` i `publication: "allowed"`).
   - Striktno odbijanje kros-sport utakmice (`ScheduleApiError: sport`).
   - Striktno odbijanje meča čiji učesnik nije naveden u `teams` imeniku (`ScheduleApiError: učesnik nije u imeniku`).

---

## 4. Ograničenja platforme, prava i operativni status

1. **Istorijski status sačuvanih izvora naspram živog stanja:**
   - Fajlovi u `/tmp/ma-sources/` (`aba.html`, `fss.html`, `el-2026-27.pdf`, itd.) predstavljaju **istorijske snimke od 1. oktobra 2026. godine**. Oni dokazuju sposobnost parsera da deterministički obrade te dokumente, ali ne garantuju stanje živih sajtova na današnji dan (6. oktobar 2026).
2. **Pravni i ugovorni status (Nema utvrđene licence):**
   - Na osnovu pregledanih dokaza nije utvrđeno postojanje licence ili odobrenja sportskih saveza i liga za preuzimanje i redistribuciju podataka od strane MatchAhead-a (što ne predstavlja kategorički dokaz da takvo odobrenje uopšte ne postoji u nekom drugom obliku).
   - Prema praksi Suda pravde EU (*Ryanair v PR Aviation*, C-30/14), vlasnici sajtova zadržavaju ugovornu slobodu da uslovima korišćenja regulišu ili ograniče automatizovano preuzimanje svojih podataka, bez obzira na autorskopravni status baze.
   - U produkcijskom režimu, svi izvori ostaju označeni statusom `publication: "unknown"` / `source-blocked`, a odgovor servisa postavlja `checkedAt: null` i vraća prazan spisak mečeva u skladu sa politikom operatera radi izbegavanja ugovornog rizika.
3. **Infrastrukturne granice i budžet 0 €:**
   - Status Cloudflare naloga: pokušaj pristupa dashboard-u (`https://dash.cloudflare.com`) preusmerava na `/login` bez aktivne sesije, a OAuth pretplatnički API vraća 403. Nivo plana ostaje nepotvrđen iz konkretnih razloga pristupa (runtime/account evidence limitation), bez pretpostavke da besplatni DO ne može izvršavati parser.
   - Nisu vršeni nikakvi deploy pozivi, izmene DNS-a niti plaćeni API zahtevi.
   - Wall-clock trajanje parsiranja unutar `workerd` izolata iznosi 48 ms za PDF i 39 ms za HTML. Ovo predstavlja **zidno vreme (wall-clock)** u testnom okruženju, a ne obračunati Cloudflare CPU. Standardni limit ulaznog Workera je 10 ms CPU, dok SQLite Durable Object raspolaže sa 30 s CPU po zahtevu.

---

## 5. Zaključak i preporuka

Konačni integrisani commit proizvoda `a2ab384a3a74ff27135317164e3260e790db90dc` u potpunosti ispunjava sve ugovorene tehničke, arhitektonske i bezbednosne zahteve zadate u orkestraciji Faze 05. Svi testovi i granične provere prolaze sa izlaznim kodom 0.

Kod je stabilan, dobro izolovan i preporučuje se za GitHub push.
