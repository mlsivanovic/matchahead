# Nezavisni završni QA pregled: Servis rasporeda i klijent (Faza 05)

**Datum:** 6. oktobar 2026.  
**Pregledač:** Gemini CLI (nezavisna revizija i verifikacija faze 05)  
**Pregledani commit proizvoda (HEAD):** `bbbe9bb856aa6850b6744f00df9afb41ffc2766e` (`fix: read saved schedule pages by their real headings`)  
**Status pregleda:** **INTERIM AUDIT CHECKPOINT — PROVERENO NA bbbe9bb, KONAČNO ODOBRENJE ČEKA INTEGRISANI HEAD SA POPRAVKOM DELJENOG KEŠA TAKMIČENJA (TASK task_7edd2f982824)**.  
*Faza 05 se ne proglašava završenom (DONE); status prava na izvore ostaje `unknown`, produkcija ostaje `source-blocked`, a Cloudflare nalog ostaje pod neproverenim nivoom pretplate bez deploya.*

---

## 1. Sažetak nalaza (Executive Summary)

Na integrisanom komitu `bbbe9bb856aa6850b6744f00df9afb41ffc2766e` izvršena je nezavisna verifikacija svih slojeva koda Faze 05.

### 1.1. Verifikovane komponente i prolaznost
1. **Domenski ugovori (`packages/domain`):** Svih **35 testova** prolazi sa exit 0 (`node scripts/check-data-contracts.mjs`, trajanje 177 ms).
2. **Klijentski PWA testovi (`apps/web`):** Svih **113 testova** prolazi sa exit 0 (`npm --prefix apps/web run check`, trajanje 394 ms pod Node 22).
3. **TypeScript i PWA build:** `npm --prefix apps/web run build` prolazi sa 0 grešaka (`tsc --noEmit` i `vite build` generišu bundle od 855 KB i service worker od 59.4 KB sa 13 precache unosa).
4. **PWA regresija (`scripts/check-pwa.mjs`):** Svih **11 provera** prolazi sa exit 0 (manifest, shell, `/repo/` baza, instalabilnost, offline keš).
5. **Izolovani Auth emulator (`apps/web/scripts/check-auth-browser.mjs` adaptiran za portove 9099/8080):** Svih **52 provere** u Chromium browseru prolazi sa exit 0 kroz Firebase emulator popup widget (prijava, odjava, raskid veze instalacije, `accountTombstones` brava). Spoljni emulatori na portovima `9098`/`8081` ostali su potpuno netaknuti.
6. **Servis rasporeda i workerd (`experiments/schedule-service`):** Svih **40 testova** prolazi sa exit 0 (`node scripts/check-schedule-service.mjs`, trajanje 18.3 s pod Node 22), uključujući 12 testova unutar stvarnog `workerd` okruženja (Durable Object perzistencija, SQLite tabela, kvote po korisniku/IP-u, CORS, i izvršavanje parsera unutar izolata).
7. **Serversko-klijentska granica (`ScheduleService` -> `parseFindResponse`):** Provereni su i prazni produkcijski odgovori (`source-blocked`, `checkedAt: null`) i 5 složenih nepraznih scenarija (neprazan verifikovani odgovor, delimičan uspeh sa mešavinom dozvoljenih i zabranjenih takmičenja, očuvanje `source_error` stanja, semantičko odbijanje kros-sport mečeva i odbijanje mečeva bez učesnika u imeniku). Svi scenariji prolaze klijentski validator sa exit 0.
8. **Nezavisni brojevi mečeva na sačuvanim istorijskim snimcima od 1. oktobra 2026:**
   - **FSS Superliga:** Tačno **182 meča** (26 kola po 7 mečeva), po 1 meč po kolu za Partizan i Zvezdu. Dupli blokovi 11. kola iz gornjeg widgeta se filtriraju bez lažnog konflikta. `complete: true`.
   - **ABA liga:** Tačno **180 mečeva**. U regularnom delu (kola 1–18) Partizan ima 18, a Zvezda **18 mečeva**. Otklonjen je kvar sa deljenjem po dvotački u imenu sponzora `m:tel` (meč 41). `complete: true`.
   - **Evroliga PDF:** Tačno **380 mečeva** i tačno **38 kola** (po 10 mečeva po kolu). Oba kluba imaju po 38 mečeva, uz 2 derbija (kolo 7 i kolo 28). Geometrijsko mapiranje zaglavlja kola po Y-koordinati dodeljuje kola 1..38. `complete: true`.

---

## 2. Otvoreni defekti i korekcije u toku

### 2.1. Defekt deljenog keša takmičenja na `bbbe9bb` (Zadatak `task_7edd2f982824`)
- **Nalaz:** Na komitu `bbbe9bb`, ključ trajnog keša servisa je vezan isključivo za par klub+sezona (`teamId:seasonId`).
- **Dokaz uzastopnih poziva (sequential requests):** Kada se unutar istog prozora ponovne upotrebe (reuse window) zatraži raspored za KK Partizan, zatim za KK Crvena zvezda, pa ponovo za KK Partizan:
  - Kumulativni broj stvarnih preuzimanja utakmica raste kao `1 -> 2 -> 2`.
  - Prva dva poziva imaju `cacheStatus: "fetched"` i vrše dva odvojena preuzimanja iste stranice lige umesto da prvo preuzimanje opsluži oba kluba.
  - Tek treći poziv koristi keš (`cacheStatus: "reused"`).
- **Status:** Koordinatorski dokaz evidentiran u `/tmp/matchahead-05-shared-source-proof.log`. Ugovor zahteva deljeni keš takmičenja kako bi jedno preuzimanje opslužilo oba kluba. Grok je raspoređen na novi korektivni zadatak `task_7edd2f982824` / `ctx_108bbf005f6f`.

### 2.2. Zavisnost satnice u browser testu (`check-schedule-ui.mjs`)
- **Nalaz:** Testna skripta `check-schedule-ui.mjs` sadrži fiksirane datume mock mečeva na 4. i 5. oktobar 2026. godine (`startsAtUtc: '2026-10-04T17:00:00.000Z'`).
- **Ponašanje pod novim datumom:** Kada se test izvršava 6. oktobra 2026, browser tretira 4. oktobar kao prošli termin (`archived`), pa se meč ne pojavljuje pod naslovom „Sledeća utakmica”, što izaziva pad na liniji 590 (`assert(nextDerby === 1)`). Evidentirano u `/tmp/matchahead-05-oct06-browser-precheck.log`.
- **Korekcija:** Koordinator je na `main`-u popravio testni harness uvođenjem fiksnog sata browsera (1. oktobar u podne) preko `page.evaluateOnNewDocument` na sva 3 kreirana page objekta. Provereno u `/tmp/matchahead-05-oct06-browser-fixed-clock.log` (16/16 PASS, exit 0). Proizvodni kod ostaje neizmenjen.

### 2.3. Ispravka žive probe za FK Crvena zvezda (`scripts/probe-schedule-sources.mjs`)
- **Nalaz:** Proba `probeFkCzv()` je padala na živom pozivu 6. oktobra jer je u PASS uslovu zahtevala prisustvo stringa `13:00`, koji je predstavljao istorijsku opservaciju od 1. oktobra. Na dan 6. oktobra stranica FKCZ prikazuje `19:00` uz datum 10.10.2026, dok se u tabeli rasporeda nalazi i `00:00`. Evidentirano u `/tmp/matchahead-05-oct06-live-probe.log`.
- **Ispravka:** Predikat u `scripts/probe-schedule-sources.mjs` proverava status 200 i prisustvo mečeva (Lugano i Radnički), dok se štampani sat `19:00` (`datedClockObservation`) i prisustvo ponoći (`unscopedMidnightObserved`) beleže kao činjenične tekstualne opservacije bez nagađanja o uzroku; potvrda zone i satnice ostaje `unknown`. Svih 8 živih proba prolazi sa exit 0.

---

## 3. Detaljni rezultati verifikacione matrice

| # | Oblast verifikacije | Komanda / Skripta | Rezultat | Izlazni kod | Detalji |
|---|---|---|---|---|---|
| 1 | Domenski ugovori | `node scripts/check-data-contracts.mjs` | **35 / 35 PASS** | `0` | Vreme: 177 ms. Svi ugovori stabilnog identiteta, razdvojenosti i kvota. |
| 2 | Klijentski testovi | `npm --prefix apps/web run check` | **113 / 113 PASS** | `0` | Vreme: 394 ms na Node 22. Validacija tela, tajmaut, abort, unifikacija agende. |
| 3 | Build & TypeScript | `npm --prefix apps/web run build` | **PASS (0 grešaka)** | `0` | `tsc --noEmit` čist; Vite PWA generiše `dist/sw.js` (13 precache unosa). |
| 4 | PWA regresija | `node scripts/check-pwa.mjs` | **11 / 11 PASS** | `0` | Provereni manifest, offline keš, 360px viewport i stabilnost omotača. |
| 5 | Izolovani Auth emulator | Adapted `check-auth-browser.mjs` (9099/8080) | **52 / 52 PASS** | `0` | Firebase emulator popup widget, brisanje brave, netaknuti portovi 9098/8081. |
| 6 | Servis & workerd | `node scripts/check-schedule-service.mjs` | **40 / 40 PASS** | `0` | Vreme: 18.3 s na Node 22 (`/tmp/matchahead-05-final-service-node22.log`). |
| 7 | Granica server-klijent | `ScheduleService` -> `parseFindResponse` | **13 / 13 PASS** | `0` | 8 produkcijskih/sintetičkih + 5 nepraznih graničnih scenarija. |
| 8 | Sačuvani izvori (brojevi) | Independent parser test | **PASS** | `0` | ABA 18 po klubu, FSS 182, Evroliga 380 (38 kola po 10 mečeva, 2 derbija). |
| 9 | Negativne regresije | Truncated/corrupted inputs | **PASS** | `0` | Skraćeni podaci i netačna sezona striktno vraćaju `complete: false`. |

### 3.1. Provera nepraznih graničnih scenarija (`parseFindResponse`)
Izvršena je namenskom skriptom provera 5 ključnih graničnih odgovora:
1. **Neprazan verifikovani odgovor:** Potpuno strukturiran odgovor sa fixtures listom, učesnicima u imeniku, `nextFixture` i `nextConfirmedFixture` poljima, i pokrivenošću prolazi validaciju sa `kind: "synthetic-demo"`.
2. **Mešoviti delimičan uspeh:** Odgovor gde je jedno takmičenje uspešno i dozvoljeno (`publication: "allowed"`), a drugo zabranjeno (`publication: "forbidden"`) prolazi validaciju bez odbacivanja dozvoljenog dela.
3. **Očuvanje prethodnog stanja (`source_error`):** Odgovor sa `cacheStatus: "reused"` i statusom pokrivenosti `source_error` uz `publication: "allowed"` ispravno se prepoznaje i prihvata.
4. **Semantičko odbijanje kros-sport utakmice:** Pokušaj ubacivanja košarkaške utakmice u odgovor za fudbalski klub striktno baca `ScheduleApiError` (greška u polju `sport`).
5. **Semantičko odbijanje meča bez učesnika u imeniku:** Pokušaj vraćanja utakmice čiji gostujući tim nije naveden u `teams` listi striktno baca `ScheduleApiError` (`učesnik nije u imeniku`).

---

## 4. Analiza ispravki parsera na `bbbe9bb`

### 4.1. Evroliga PDF (`experiments/schedule-service/src/sources/euroleague-pdf.ts`)
- **Prethodni defekt:** `readRows` je proveravao da li se `ROUND \d+` nalazi na neposredno prethodnoj liniji teksta (`lines[index - 1]`). Zbog kolonskog rasporeda u PDF-u, naslovi kola su se nalazili u odvojenim tokovima, pa je `round` ostajao `null` za svih 380 redova.
- **Implementacija na `bbbe9bb`:** Parser koristi dvodimenzionalno mapiranje po koordinatama i stranicama: ekstrahuje zaglavlja `ROUND X` i dodeljuje ih utakmicama na osnovu vertikalne geometrije (Y-koordinata) i broja strane.
- **Nezavisna verifikacija:**
  - Svih 380 mečeva ima dodeljeno kolo od 1 do 38 (tačno 10 mečeva po kolu).
  - KK Partizan i KK Crvena zvezda imaju po tačno 38 mečeva.
  - Obe derbi utakmice imaju potvrđene GMT satnice i tačna kola (kolo 7: 22.10.2026. 18:45 UTC; kolo 28: 11.02.2027. 19:00 UTC).

### 4.2. ABA Liga (`experiments/schedule-service/src/sources/aba.ts`)
- **Prethodni defekt:** Deljenje linije parova vršeno je preko obične dvotačke `split(':')`. Domaćin `Igokea m:tel` u 5. kolu (meč 41) sadržao je dvotačku u nazivu sponzora, što je deformisalo naziv gostujućeg tima u `tel:Crvena zvezda Meridianbet` i izgubilo Zvezdin meč 5. kola (zbir je bio 17 umesto 18).
- **Implementacija na `bbbe9bb`:** Razdvajanje timova se vrši po HTML tagu `<span>:</span>` ili razmaknutoj dvotački `\s+:\s+`, čime unutrašnja dvotačka u `m:tel` ostaje očuvana.
- **Nezavisna verifikacija:** KK Crvena zvezda ima tačno 18 mečeva u kolima 1–18, a meč 41 je ispravno mapiran na `basketball:xx:igokea-m-tel` i `basketball:rs:crvena-zvezda`.

### 4.3. FSS Superliga (`experiments/schedule-service/src/sources/fss.ts`)
- **Prethodni defekt:** Stranica na vrhu ima widget za predstojeće 11. kolo, nakon čega sledi kompletna tabela od 1. do 26. kola. Parser je detektovao ponovljene parove 11. kola kao nelegitiman konflikt (`conflict = true`) i obarao kompletnost.
- **Implementacija na `bbbe9bb`:** Ponovljeni blokovi za isto kolo i iste timove se tretiraju kao legitimno ponavljanje na stranici i ne aktiviraju konflikt, dok bi stvarni konflikt (isti par sa oprečnim datumom/satnicom) i dalje oborio kompletnost.
- **Nezavisna verifikacija:** Ekstrahovana su tačno 182 jedinstvena meča, a `complete` je postavljen na `true`.

---

## 5. Ograničenja platforme, prava i operativni status

1. **Istorijski status sačuvanih izvora naspram živog stanja:**
   - Fajlovi u `/tmp/ma-sources/` (`aba.html`, `fss.html`, `el-2026-27.pdf`, itd.) predstavljaju **istorijske snimke od 1. oktobra 2026. godine**. Oni dokazuju sposobnost parsera da deterministički obrade te dokumente, ali ne garantuju stanje živih sajtova na današnji dan (6. oktobar 2026).
2. **Pravni i ugovorni status (Nema utvrđene licence):**
   - Na osnovu pregledanih dokaza nije utvrđeno postojanje licence ili odobrenja sportskih saveza i liga za preuzimanje i redistribuciju podataka od strane MatchAhead-a (što ne predstavlja kategorički dokaz da takvo odobrenje uopšte ne postoji u nekom drugom obliku).
   - Prema praksi Suda pravde EU (*Ryanair v PR Aviation*, C-30/14), vlasnici sajtova zadržavaju ugovornu slobodu da uslovima korišćenja regulišu ili ograniče automatizovano preuzimanje svojih podataka, bez obzira na autorskopravni status baze.
   - U produkcijskom režimu, svi izvori ostaju označeni statusom `publication: "unknown"` / `source-blocked`, a odgovor servisa postavlja `checkedAt: null` i vraća prazan spisak mečeva u skladu sa politikom operatera radi izbegavanja ugovornog rizika.
3. **Infrastrukturne granice i budžet 0 €:**
   - Status Cloudflare naloga: pokušaj pristupa dashboard-u (`https://dash.cloudflare.com`) preusmerava na `/login` bez aktivne sesije, a OAuth pretplatnički API vraća 403. Nivo plana ostaje nepotvrđen iz konkretnih razloga pristupa (runtime/account evidence limitation), bez pretpostavke da besplatni DO ne može izvršavati parser.
   - Nisu vršeni nikakvi deploy pozivi, izmene DNS-a niti plaćeni API zahtevi.
   - Wall-clock trajanje parsiranja unutar `workerd` izolata iznosi 58 ms za PDF i 40 ms za HTML. Ovo predstavlja **zidno vreme (wall-clock)** u testnom okruženju, a ne obračunati Cloudflare CPU. Standardni limit ulaznog Workera je 10 ms CPU, dok SQLite Durable Object raspolaže sa 30 s CPU po zahtevu.

---

## 6. Zaključak

Commit `bbbe9bb856aa6850b6744f00df9afb41ffc2766e` uspešno razrešava krive pretpostavke parsera (ABA `m:tel`, FSS gornji widget, PDF geometrijsko mapiranje).  
Konačno odobrenje (final approval) i zaključenje revizije biće doneto nakon integracije popravke za deljeni keš takmičenja (zadatak `task_7edd2f982824`) na novom integrisanom HEAD-u.
