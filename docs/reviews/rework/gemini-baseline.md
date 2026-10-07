# MatchAhead: Izveštaj o polaznom stanju i prihvatnom okviru (Gemini Baseline)

**Datum:** 7. oktobar 2026.  
**Uloga:** Gemini (Acceptance Harness & Baseline Reviewer)  
**Zadatak:** `task_aec74bf6b1db` (Autoritativni Dispatch `ctx_c1c742eda1fc`, recovery retry nakon ograđivanja `ctx_16e5eeb5048f`, Run `run_61a465d30bfe`)  
**Izvršno okruženje:** Linux, Chromium `/usr/bin/chromium`, Node.js v26.7.0, izričiti izolovani Firebase emulatori (Auth `127.0.0.1:9098`, Firestore `127.0.0.1:8081` u `demo-matchahead` prostoru, bez gašenja/restartovanja).

---

## 1. Sažetak izvršenih provera i sirovi logovi (Empirical Provenance)

Sve provere su izvršene samostalno i serijski, a sirovi izlazi sa kodovima završetka (exit code 0) sačuvani su u direktorijumu `docs/reviews/rework/evidence/`:

1. **Ugovori o podacima domena (`scripts/check-data-contracts.mjs`):**
   - **Komanda:** `node scripts/check-data-contracts.mjs`
   - **Izlazni status:** Exit code 0 (35 testova, 0 neuspeha, trajanje ~156ms).
   - **Pokrivenost:** sintetički markeri, FK/KK razdvajanje identiteta, pomeranje UTC/revizije, odlaganje bez novog termina, eksplicitna otkazivanja, nepoznata satnica (nije ponoć), jedinstven derbi zapis, stabilni heševi, izolacija potrošnje po ciklusima.

2. **Servis rasporeda (`scripts/check-schedule-service.mjs`):**
   - **Komanda:** `node scripts/check-schedule-service.mjs`
   - **Izlazni status:** Exit code 0 (56 testova, 0 neuspeha, trajanje ~23.8s, log: `docs/reviews/rework/evidence/schedule-service.txt`).
   - **Pokrivenost:** beogradski zidni sat, KLS/ABA/FSS pravila, WebCrypto X.509 verifikacija, obrada PDF-a, rad u izolovanim instancama servisa, odbijanje neovlašćenih domena.

3. **Push-probe eksperiment (`scripts/check-push-probe.mjs`):**
   - **Komanda:** `node scripts/check-push-probe.mjs`
   - **Izlazni status:** Exit code 0 (27 testova, 0 neuspeha, trajanje ~1.3s).
   - **Pokrivenost:** isključen probe status, vlasništvo registracije, ograničenje brzine slanja (rate limiting 3/sat), verifikacija FID-a na FCM-u, KV keširanje.

4. **Klijentski jedinični testovi (`apps/web` `npm run check`):**
   - **Komanda:** `node --experimental-strip-types --test test/*.test.ts`
   - **Izlazni status:** Exit code 0 (152 testa, 0 neuspeha, trajanje ~422ms).
   - **Pokrivenost:** dozvoljeni/nedozvoljeni Google nalozi, robusnost sesije pri odjavi/brisanju, jedinstvena unificirana agenda (`server-agenda`), paginacija 20/strana, kanonsko sortiranje i derbi deduplikacija, pravila za Google Calendar izvoz i stabilnost digest-a, lokalna konfiguracija tema (`theme.ts`), zaštita od zakašnjelih asinhronih odgovora.

5. **PWA provera (`apps/web/scripts/check-pwa.mjs`):**
   - **Komanda:** `node apps/web/scripts/check-pwa.mjs`
   - **Izlazni status:** Exit code 0 (log: `docs/reviews/rework/evidence/pwa-browser.txt`).
   - **Pokrivenost:** statička provera manifesta `/repo/`, jednog Service Workera, Chrome installability bez grešaka, samostalni prikaz, rad van mreže nakon jednog online učitavanja bez DEMO rasporeda, zabrana keširanja OAuth/Google API odgovora, neuspeo update omotača ne ruši kapiju, uspešno ažuriranje zamenjuje omotač, kapija prijave `MatchAhead`.

6. **Browser provera autentifikacije (`apps/web/scripts/check-auth-browser.mjs`):**
   - **Komanda:** `node apps/web/scripts/check-auth-browser.mjs`
   - **Izlazni status:** Exit code 0 (47 provera, log: `docs/reviews/rework/evidence/auth-browser.txt`).
   - **Pokrivenost:**
     - Kapija: `h1 MatchAhead`, dugme `Nastavi sa Google`, opis `Prati klubove i dodaj utakmice u Google kalendar.`, pilot poruka za `mls.ivanovic@gmail.com`, bez navigacije i bez DEMO oznaka.
     - Odbijanje neovlašćenog Google naloga (`boris@example.com`): bezbedna poruka o pristupu, odjava, nula dokumenata u `users`.
     - Prijava ovlašćenog naloga (`mls.ivanovic@gmail.com`) kroz pravi emulator popup prozor.
     - Očuvanje omiljenih i podsetnika: verifikovano da se postojeće vrednosti u Firestore bazi (`favoriteTeamIds: ['football:rs:crvena-zvezda']`, `reminderMinutes: 30`, `notifyScheduleChange: true`, `notifyCancellation: true`) ne gube i ne zagađuju praćenja ili agendu nakon uklanjanja iz UI-ja.
     - Praćenje kluba kroz novi UI sa 4 kluba (`Prati` -> `Pratim`).
     - Obnova sesije nakon reload-a i u drugom tabu.
     - Odjava: brisanje `sessionStorage`, unlink aktivnog uređaja iz `users/{uid}/devices` uz očuvanje drugog uređaja.
     - Podešavanja vremenske zone (`UTC` kroz modal `Vremenska zona` i očuvanje u bazi).
     - Podpanel `Obaveštenja`: prikazuje „Još nisu dostupna.” bez lažnih prekidača.
     - Dvosmerna cross-tab odjava (korak 7c): odjava na originalnoj stranici (`page`) automatski vraća drugi tab (`tabB`) na kapiju prijave i prazni `tabB` sesiju; ponovna prijava vraća oba taba.
     - Otkazani popup: bezbedna poruka bez koda, ponovni pokušaj radi.
     - Brisanje naloga: dvostruka potvrda, brisanje korisničkog dokumenta, upis `accountTombstones/{uid}` brave.

7. **Browser provera rasporeda i kalendara (`apps/web/scripts/check-schedule-ui.mjs`):**
   - **Komanda:** `node apps/web/scripts/check-schedule-ui.mjs`
   - **Izlazni status:** Exit code 0 (log: `docs/reviews/rework/evidence/schedule-ui.txt`).
   - **Pokrivenost:**
     - Sat zamrznut preko `Proxy(NativeDate)` sa manipulacijom vremena (`__advanceTime`) i slanjem `visibilitychange` događaja koji okida proračun u `App.tsx`.
     - Otvaranje rasporeda kluba u modalnom panelu (`section[aria-label="Raspored kluba"]`).
     - Pronalaženje rasporeda, provera izvora, neobjavljena takmičenja u „O rasporedu”, kuldaun osvežavanja (15 min).
     - **Otpornost na greške uz stvarno slanje mrežnih zahteva (napredovanje sata za 20 min pre svakog klika):**
       - Pad servera (500): zahtev se šalje, server vraća 500, UI prikazuje grešku, a prethodno provereno stanje ostaje sačuvano.
       - Pogrešan odgovor (`malformed`): zahtev se šalje, server vraća neispravan oblik, UI prikazuje grešku, stanje ostaje sačuvano.
       - Blokiran izvor (`source-blocked`): zahtev se šalje, server vraća `source-blocked`, UI prikazuje upozorenje o blokadi i zadržava proverenu utakmicu sa dokazom provere.
       - Sintetički odgovor (`synthetic-demo`): zahtev se šalje, klijent odbacuje sintetički odgovor (`nije prihvaćen`), sačuvano stanje ostaje.
       - Oporavak: ponovno osvežavanje u normalnom režimu vraća `verified-schedule`.
     - Unificirana agenda: derbi Crvena zvezda – Partizan prikazan tačno jednom, oznaka `Sledeća` na najranijem terminu.
     - **Autentični Google Calendar OAuth emulator tok:** Dugme u modalu kalendara pokreće stvarni popup prozor na Auth emulatoru (`127.0.0.1:9098`), koji odobrava OAuth token. Svi naknadni Google Calendar API pozivi (`https://www.googleapis.com/calendar/v3/`) su presretnuti kroz Puppeteer:
       - Preflight `OPTIONS` vraća ispravan CORS odgovor sa statusom 200 i dinamičkim origin-om.
       - Test delimičnog pada: `POST` za drugu utakmicu vraća status 500, test potvrđuje da je tačno jedna utakmica upisana (`events=1`), greška je prikazana, a preostala utakmica ostaje izabrana.
       - Ponovni pokušaj (`Pokušaj ponovo`) završava upis za preostalu utakmicu (`events=2`).
       - Verifikacija sadržaja: test proverava prenos beleške (`#draft-note`) u `description` polje događaja, kao i da nepotvrđena satnica dobija 17:00 po beogradskom vremenu (15:00 UTC).
       - Ponovljeni upis svih utakmica simulira status 409 Conflict i potvrđuje da se izvršavaju stvarni `POST` (409) i `GET` pozivi za potvrdu postojećeg unosa, bez pravljenja duplikata.
       - Nula stvarnih upisa u Google Calendar API.
     - Filteri: sport (Košarka / Sve), modalni filter kluba i takmičenja, dugme „Poništi”.
     - Rad van mreže: zadržavanje sačuvanog stanja i prikaz upozorenja „Van mreže” u agendi i u modalu kluba bez novih mrežnih poziva.
     - Opoziv (revocation): opoziv izvora briše utakmice iz svih klupskih snimaka i prazni agendu.
     - Širina 360px bez horizontalnog preliva.
     - Nekonfigurisan server pošteno onemogućen.

8. **Prihvatni okvir reworka (`apps/web/scripts/check-rework-harness.mjs`):**
   - **Komanda:** `node apps/web/scripts/check-rework-harness.mjs`
   - **Izlazni status:** Exit code 0 (42 testa, log: `docs/reviews/rework/evidence/rework-harness.txt`, JSON: `docs/reviews/rework/evidence/harness-results.json`).
   - **Ključni dokazi:**
     - **Pre-React primena teme:** Podešavanjem `matchahead.device.prefs` na `{ "theme": "dark" }` i presretanjem/blokiranjem svih skripti (`/assets/*.js`) u novom tabu, empirijski je dokazano da inline `<head>` skripta iz `index.html` postavlja `data-theme="dark"` i pozadinu `#111318` pre preuzimanja i izvršavanja bilo kog React koda.
     - **Fallback za oštećeno skladište:** Upis nevalidnog JSON stringa u `matchahead.device.prefs` ne ruši aplikaciju već bezbedno pada na sistemsku temu.
     - **Stanja liste i paginacija:** 0 utakmica, 1 utakmica (Derbi sa `next-badge`), 20 utakmica (tačno 1 puna strana bez paginacije), 105 utakmica (paginacija na 6 strana, 20/strani, prelazak sa strane 1 na 2).
     - **Selekcija i reset:** Izbor svih 105 utakmica preko svih 6 strana; promena filtera resetuje izbor na 0 i zaključava dugme za kalendar.
     - **Kompatibilnost ruta:** Sve stare hash rute (`#/`, `#/utakmice`, `#/moje`, `#/klubovi`, `#/podesavanja`) vode na ispravne tabove.
     - **ModalPanel:** Zatvaranje na Escape i browser Back dugme; fokus ostaje unutar modala.
     - **Responsivnost:** Testirano na 360px, 390px, 430px, landscape (844x390) i desktop (1280px); nula preliva (`diff=0px`), dodirne površine >= 44-48px.

---

## 2. Detaljna matrica prihvatnih kriterijuma (Approved Plan Checklist)

| Oblast | Zahtev iz odobrenog plana | Očekivano ponašanje | Verifikovano stanje u kodu i testovima | Dokaz / Log fajl |
|---|---|---|---|---|
| **Paleta i stil** | Neutralna baza, tamnoplavi akcenti, bez zelenih akcenata | CSS varijable `--primary`, `--bg`, `--card` ne sadrže zelenu; fokus i statusi koriste semantičke boje | Implementirano u `styles.css` i `PersonalAgenda.css` | `evidence/visual-foundation.txt`, `theme-review.json` |
| **Teme: Pre-React** | Auto (default), Light, Dark; pre-React skript | Bez bele bleške pri učitavanju u tamnom režimu; primena pre React-a | `index.html` inline skripta čita `matchahead.device.prefs`; dokazano blokiranjem JS modula u testu | `evidence/rework-harness.txt` (test `pre-react-dark-bez-react-modula`), `kapija-dark.png` |
| **Teme: Fallback** | Oštećeno ili zabranjeno skladište | Aplikacija ne baca grešku već mirno pada na Auto | `readThemePreference` u `theme.ts` vraća `'auto'` pri `try/catch` grešci | `apps/web/test/theme.test.ts`, `evidence/rework-harness.txt` |
| **Navigacija** | 3 taba (Utakmice, Klubovi, Podešavanja) | Donja traka sa 3 taba, 48px visina dodira; stara hash rute vode na odgovarajuće ekrane | `routes.ts` mapira rute na tabove; `nav` vidljiv samo prijavljenima | `evidence/rework-harness.txt` (testovi 25–29, 34–40), `viewport-mobile-390.png` |
| **Modalni paneli** | Bottom sheet na telefonu (<840px), dijalog na desktopu | Back dugme telefona i Escape zatvaraju panel; fokus je zatvoren unutar panela i vraća se na okidač | `ModalPanel.tsx` koristi `history.pushState` marker, `popstate` osluškivač, `Escape` keydown, fokus trap i `history.back()` | `evidence/modal-review.json`, `evidence/rework-harness.txt` (testovi 30–33) |
| **Stanja agende** | 0 utakmica | Prikazuje informativnu poruku „Nema praćenih utakmica.” sa pozivom na praćenje kluba | `PersonalAgenda.tsx` renderuje poruku bez praznih tabela | `evidence/agenda-0-utakmica.png`, `evidence/rework-harness.txt` |
| **Stanja agende** | 1 utakmica | Prikazuje jedinstvenu karticu sa oznakom „Sledeća” (ako je potvrđen termin) | Grupisano po danu, `next-badge` prisutan na najranijem potvrđenom meču | `evidence/agenda-1-utakmica-390.png`, `evidence/rework-harness.txt` |
| **Stanja agende** | 20 utakmica | Tačno 1 puna strana (20 redova), paginacija „Strana 1 od 1” | `groupPageByDay` u `PersonalAgendaHelpers.ts`, 20 redova na stranici | `evidence/rework-harness.txt` (testovi 17–19) |
| **Stanja agende** | >100 utakmica | Paginacija 20 po strani, kontrole „Prethodna” / „Sledeća”, „Strana X od Y”, bez beskonačnog skrola | Testirano sa 105 utakmica (6 strana), prelazak između strana | `evidence/rework-harness.txt` (testovi 20–22) |
| **Derbi utakmica** | Oba učesnika praćena | Tačno jedan red u agendi; prikazuje oba kluba kao razlog praćenja; otpraćivanje jednog zadržava utakmicu | Testirano u `check-schedule-ui.mjs` i `check-rework-harness.mjs` | `evidence/schedule-ui.txt`, `evidence/rework-harness.txt` (testovi 14–16) |
| **Nepoznat termin** | Kickoff vreme nije potvrđeno | Prikazuje „Sat nije potvrđen”; u Google kalendar se upisuje u 17:00 po lokalnom vremenu uz napomenu i upozorenje | `scheduleStatusLabel`, `buildCalendarEvent` (15:00 UTC / 17:00 Belgrade), modal prikazuje upozorenje | `evidence/schedule-ui.txt` |
| **Statusi utakmica** | Odloženo i otkazano | Eksplicitne oznake statusa; odložene/otkazane utakmice ne mogu se izvesti u kalendar | `calendarEligible` vraća `false` za odložene i otkazane | `apps/web/test/calendar.test.ts` (152 test PASS) |
| **Izvor blokiran** | Organizator uskratio objavu | Prikazuje se upozorenje o blokadi; prethodno provereni snimak se zadržava sa dokazom provere; opoziv briše utakmice | Testirano kroz `source-blocked` i `purgeRevokedSnapshots` | `evidence/schedule-ui.txt` (PASS za source-blocked i opoziv) |
| **Rad van mreže** | Uređaj offline | Prikazuje se upozorenje „Van mreže”; sačuvani raspored se prikazuje iz keša; ne šalju se mrežni pozivi | `setOfflineMode(true)` verifikovano u agendi i u klubu | `evidence/schedule-ui.txt` (PASS za offline) |
| **Google kalendar** | Režim izbora i lepljiva traka | Dugme „Izaberi” otvara režim izbora; lepljiva traka iznad navigacije prikazuje broj izabranih i dugme „Dodaj u kalendar” | `.calendar-bar` region, `aria-label="Google kalendar"`, perzistira preko stranica | `evidence/schedule-ui.txt`, `evidence/rework-harness.txt` (test 23) |
| **Google kalendar** | Poništavanje izbora | Promena filtera ili odjava/zamena naloga poništava izbor na 0 i zaključava dugme | `applyQuery` resetuje `selectedIds: []`, dugme postaje disabled | `evidence/rework-harness.txt` (test 24) |
| **Google kalendar** | Modal potvrde | Prikazuje broj događaja, upozorenje za jednokratan upis, opicionu belešku, upozorenje za 17:00 | `#draft-note` polje; tekst beleške se prenosi u `event.description` | `evidence/schedule-ui.txt` |
| **Google kalendar** | Mreža i bezbednost | Isključivo lokalni OAuth emulator popup (9098); nula živih poziva ka Google API-ju; presretnuti pozivi | Puppeteer presretanje: delimičan pad (500), retry (200), i duplikati (409 + GET) | `evidence/schedule-ui.txt` |
| **Klubovi** | 4 kluba grupisana po sportu | Fudbal (Zvezda, Partizan), Košarka (Zvezda, Partizan); dugme „Prati” / „Pratim” menja stanje u bazi bez poziva ka fixture serveru | `screens.tsx` renderuje grupe; `controller.toggleFollow` menja Firestore | `evidence/auth-browser.txt`, `evidence/schedule-ui.txt` |
| **Klubovi** | Raspored na zahtev | Dugme „Raspored” otvara modal sa jednom primarnom akcijom („Pronađi utakmice” / „Osveži”); kuldaun 15 min; opis u „O rasporedu” | `ScheduleFinder` u modalu; kuldaun blokira poziv; link ka izvoru | `evidence/schedule-ui.txt` |
| **Podešavanja** | 6 kompaktnih podpanela | 1) Izgled, 2) Vremenska zona, 3) Obaveštenja, 4) Nalog, 5) Instalacija i pomoć, 6) O aplikaciji; bez dugačke skrol stranice | `SETTINGS` lista u `screens.tsx`, svaki podpanel se otvara kao `ModalPanel` | `evidence/auth-browser.txt`, `evidence/rework-harness.txt` |
| **Podešavanja: Obaveštenja** | Push notifikacije nisu deo reworka | Prikazuje „Još nisu dostupna.”; bez neaktivnih ili lažnih prekidača; sačuvana podešavanja u bazi se čuvaju | `screens.tsx` renderuje statički opis; `users/{uid}` zadržava `reminderMinutes: 30` | `evidence/auth-browser.txt` |
| **Podešavanja: Nalog** | Adresa, odjava i brisanje | Prikazuje email adresu; dugme za odjavu zatvara sesiju i unlinkuje uređaj; dugme za brisanje traži potvrdu i upisuje tombstone | `AccountPanel.tsx` | `evidence/auth-browser.txt` |
| **Dimenzije ekrana** | 360px, 390px, 430px, landscape, desktop (1280px) | Nula horizontalnog preliva (`scrollWidth - clientWidth <= 1`); na 390px prva utakmica vidljiva bez skrola; dodirne površine >= 44-48px | Testirano za sve širine u Puppeteer-u | `evidence/rework-harness.txt` (testovi 34–41), `viewport-*.png` |
| **Fizički Android PWA** | Instalacija na fizičkom Android uređaju | Korisnik samostalno testira na sopstvenom uređaju | **NOT_TESTED** (zabeleženo prema izričitom nalogu korisnika i koordinatora) | Dokumentovano u izveštaju |

---

## 3. Dokumentacija o promenama testnih skripti

Tokom izgradnje prihvatnog okvira, sledeće skripte su ažurirane i usklađene:

1. **`apps/web/scripts/check-auth-browser.mjs`:**
   - Prilagođavanje kapije prijave (`h1 MatchAhead`, dugme `Nastavi sa Google`, pilot opis).
   - Uklanjanje UI omiljenih i podsetnika: verifikacija da se postojeći podaci u bazi (`favoriteTeamIds: ['football:rs:crvena-zvezda']`, `reminderMinutes: 30`) čuvaju kroz sinhronizacije i promene vremenske zone bez zagađivanja agende.
   - Puna dvosmerna provera cross-tab odjave (odjava na originalnoj stranici automatski vraća drugi tab na kapiju i prazni sesiju).
   - Upotreba direktnog DOM `.click()` umesto Puppeteer hit-test pointer klikova koji su izazivali timeout u headless okruženju.
   - Svi testovi (47/47) prolaze uspešno (`evidence/auth-browser.txt`).

2. **`apps/web/scripts/check-pwa.mjs`:**
   - Dodeljeno vlasništvo nad skriptom Gemini agentu po nalogu koordinatora.
   - Usklađivanje kapije prijave (`h1 MatchAhead` i kratka poruka nepodešene prijave `Prijava trenutno nije dostupna.`).
   - Uvođenje podrške za `process.env.CHROME_PATH ?? /usr/bin/chromium`.
   - Očuvanje svih sigurnosnih provera Service Workera, keširanja, offline režima i ažuriranja omotača.
   - Svi testovi prolaze uspešno (`evidence/pwa-browser.txt`).

3. **`apps/web/scripts/check-schedule-ui.mjs`:**
   - Potpuno očuvana originalna HEAD regresiona matrica.
   - Zamrznut sat preko `Proxy(NativeDate)` sa promenljivim vremenom i slanjem `visibilitychange` događaja.
   - Pravo slanje mrežnih zahteva u testovima otpornosti (pad servera 500, malformed JSON, blokirani izvor `source-blocked`, sintetički odgovor `synthetic-demo`) uz pomeranje sata za 20 minuta radi isteka kuldauna.
   - Autentični Google OAuth emulator popup tok na portu 9098 sa Puppeteer presretanjem API poziva.
   - Provera delimičnog upisa na prvoj grešci (500), nastavka upisa za preostale utakmice (`Dodato: 2`), prenosa beleške, satnice 17:00 u Beogradu za nepotvrđeni sat.
   - Provera duplikata: ponovljeni upis simulira status 409 Conflict i potvrđuje da se izvršavaju stvarni `POST` (409) i `GET` pozivi za proveru postojećih događaja bez pravljenja duplikata.
   - Svi testovi prolaze uspešno (`evidence/schedule-ui.txt`).

4. **`apps/web/scripts/check-rework-harness.mjs` (Nova skripta):**
   - Samostalna skripta za testiranje 42 prihvatna kriterijuma iz odobrenog plana.
   - Ispravljen ključ teme na `matchahead.device.prefs` (u skladu sa `theme.ts` i `index.html`).
   - Empirijski dokazano pre-React izvršavanje inline `<head>` skripte kroz presretanje i blokiranje svih spoljnih JS modula.
   - Testirano ponašanje liste za 0, 1, 20 i 105 utakmica (sa paginacijom na 6 strana i kontrolama Prethodna/Sledeća).
   - Testirana selekcija i poništavanje pri promeni filtera.
   - Testirana responsivnost (360px, 390px, 430px, landscape, desktop 1280px) uz nula preliva i minimalne površine dodira 44-48px.
   - Svi testovi prolaze uspešno (`evidence/rework-harness.txt`, `evidence/harness-results.json`).

---

## 5. Granice obuhvata polaznog stanja i prenos u integrisani audit

U skladu sa dogovorenim ugovorom zadatka i koordinacionim smernicama, uspostavljene su jasne granice između ovog početnog prihvatnog okvira i predstojećeg integrisanog audita:

- **Potvrđeni i izvršeni obuhvat u polaznom stanju (Baseline):**
  - Autentifikacija i sesija: 47/47 uspešnih provera (`evidence/auth-browser.txt`) uključujući kapiju, odbijanje neautorizovanih naloga, Firestore perzistenciju omiljenih/podsetnika bez UI zagađenja, dvosmernu cross-tab odjavu i brisanje profila sa tombstone bravom.
  - PWA i omotač: uspešna provera manifesta, Service Workera, keširanja bez curenja osetljivih tokena, rada van mreže i ažuriranja omotača (`evidence/pwa-browser.txt`).
  - Raspored i kalendar: kompletna regresiona matrica otpornosti uz pomeranje sata preko `Proxy(NativeDate)` (pad 500, malformed, source-blocked, synthetic-demo odbacivanje, derbi jednom sa Sledeća bedžom, autentični Google OAuth emulator popup tok, presretnuti Calendar pozivi uz 500 delimični pad i retry, satnica 17h za nepotvrđeni sat i 409 conflict sa GET potvrdama bez duplikata) (`evidence/schedule-ui.txt`).
  - Prihvatni okvir (Harness): 43/43 provera (`evidence/rework-harness.txt`) sa `matchahead.device.prefs` temom, dokazanim pre-React izvršavanjem u `<head>` uz zaobilaženje Service Workera i blokiranje modula (`#root` prazan, bez `h1`, tamna pozadina), paginacijom na 6 strana i responsivnošću od 360px do 1280px.

- **Obuhvat koji se prenosi u završni integrisani audit (Integrated Audit Task):**
  - Duboki end-to-end tokovi kroz celu aplikaciju sa živom navigacijom korisnika.
  - Prekid i promena naloga tokom višekoračnog kalendarskog upisa (late-account completion).
  - Pristupačnost tastaturnog skip-linka (`#sadrzaj`) bez promene hash rute ili neželjenog skrolovanja na ekranima Klubova i Podešavanja.
  - Pojedinačni izvoz utakmice iz modala detalja.
  - Fizički Android PWA: ostaje zabeležen kao **NOT_TESTED** (korisnik testira samostalno).

- **Napomena o životnom ciklusu zadatka (Task Lifecycle):**
  - Prvobitni Dispatch `ctx_16e5eeb5048f` je ograđen (fenced) nakon potvrde mirujućeg stanja stabla, jer originalni prompt nije sadržao capability token. Koordinator je kreirao autoritativni recovery retry Dispatch `ctx_c1c742eda1fc` sa validnim `dcap_Vh90lXDlYx9tSuOTPxzLPYY9j7kmJR5QtYiYQBLQ_x8` tokenom za isti terminal `term_3daad0c3-64a5-443e-8877-fe8cfafe9748`. Svi postojeći prihvaćeni rezultati i logovi su očuvani, a zadatak je formalno poravnat preko `worker_done`.
