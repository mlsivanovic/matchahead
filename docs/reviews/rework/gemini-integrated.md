# MatchAhead: Završni integrisani audit lokalne aplikacije (Gemini Integrated Audit)

**Datum:** 7. oktobar 2026.  
**Uloga:** Gemini (Independent Integrated Auditor)  
**Zadatak:** `task_0bf6be9ad03a` (Dispatch `ctx_e76ca9e46fab`, Run `run_61a465d30bfe`)  
**Izvršno okruženje:** Linux, Chromium `/usr/bin/chromium`, Node.js v26.7.0, izričiti izolovani Firebase emulatori (Auth `127.0.0.1:9098`, Firestore `127.0.0.1:8081` u `demo-matchahead` prostoru, bez gašenja/restartovanja).

---

## 1. Sažetak izvršenja i empirijski dokazi (Executive Summary)

U skladu sa ugovorom zadatka, koordinacionim smernicama i objedinjenom listom zahteva iz `docs/reviews/rework/audit-return.md`, sproveden je sveobuhvatni, nezavisni audit integrisane lokalne aplikacije prema specifikacijama iz `approved-plan.md` i `coordination.md`.

Sve provere su izvršene na stvarnom Chromium pretraživaču preko Puppeteer-a, izolovanim lokalnim Firebase emulatorima i presretnutim (mockovanim) Google Calendar API pozivima. Nije vršen nijedan upis u žive spoljne servise, a proizvodni fajlovi u vlasništvu Grok-a i Muse-a nisu menjani od strane Gemini agenta.

### Pregled pokrenutih provera i sirovih logova

| Podsistem / Testna skripta | Komanda za pokretanje | Ishod | Sirovi log |
|---|---|---|---|
| **Integrisani audit aplikacije** | `node apps/web/scripts/check-integrated-audit.mjs` | **PASS (82/82)** | `docs/reviews/rework/evidence/integrated-audit.txt` |
| **Prihvatni okvir (Harness)** | `node apps/web/scripts/check-rework-harness.mjs` | **PASS (43/43)** | `docs/reviews/rework/evidence/rework-harness.txt` |
| **Raspored i Google kalendar** | `node apps/web/scripts/check-schedule-ui.mjs` | **PASS (Exit 0)** | `docs/reviews/rework/evidence/schedule-ui.txt` |
| **Autentifikacija i sesija** | `node apps/web/scripts/check-auth-browser.mjs` | **PASS (47/47)** | `docs/reviews/rework/evidence/auth-browser.txt` |
| **PWA omotač i offline** | `node apps/web/scripts/check-pwa.mjs` | **PASS (Exit 0)** | `docs/reviews/rework/evidence/pwa-browser.txt` |
| **Servis rasporeda** | `node scripts/check-schedule-service.mjs` | **PASS (56/56)** | `docs/reviews/rework/evidence/schedule-service.txt` |
| **Push-probe eksperiment** | `node scripts/check-push-probe.mjs` | **PASS (27/27)** | `docs/reviews/rework/evidence/push-probe.txt` |
| **Ugovori domena** | `node scripts/check-data-contracts.mjs` | **PASS (35/35)** | Terminal stdout (Exit 0) |
| **Klijentski jedinični testovi** | `npm --prefix apps/web run check` | **PASS (152/152)**| Terminal stdout (Exit 0) |
| **TypeScript i Vite build** | `npm --prefix apps/web run build` | **PASS (Exit 0)** | Terminal stdout (precache 12) |

---

## 2. Detaljna matrica integrisanog audita (Matrix Verification)

### 2.1. Kapija prijave, teme i pre-React izvršavanje

- **Kapija prijave:**
  - Naslov je `h1 MatchAhead`, primarno dugme nosi tekst `Nastavi sa Google`, a opis glasi `Prati klubove i dodaj utakmice u Google kalendar.`.
  - Prikazuje se jednokratna pilot poruka: `Pilot je otvoren samo za nalog mls.ivanovic@gmail.com.`.
  - Nema navigacije, nema unosa za pretragu, i nema internih razvojnih DEMO termina.
  - Odbijeni nalozi (`boris@example.com`): emulator popup prikazuje poruku o uskraćenom pristupu, nalog se odmah odjavljuje, a u Firestore `users` kolekciji ostaje 0 dokumenata.
- **Teme (Light / Dark / Auto):**
  - Izbirač teme je dostupan i na kapiji i u podešavanjima (`Podešavanja` -> `Izgled`).
  - Podrazumevana tema je `auto`, koja prati sistemski `prefers-color-scheme`.
  - Izbor korisnika se trajno čuva pod ključem `matchahead.device.prefs` u formatu `{ "theme": "light" | "dark" | "auto" }`.
- **Pre-React dokaz protiv bele bleške:**
  - U testu `audit-pre-react-dark-postavljen` pokrenuta je nova stranica u kojoj su kroz presretanje zahteva blokirani svi spoljni JavaScript moduli (`/assets/*.js`).
  - Potvrđeno je da je inline skripta u `<head>` tagu iz `index.html` pročitala `matchahead.device.prefs` i postavila atribut `data-theme="dark"` i `style.backgroundColor = "#111318"` dok je kontejner `#root` bio potpuno prazan, a `h1` element još nije postojao.
  - Fallback: pri upisu neispravnog JSON formata (`invalid-corrupt-json-{{{`), aplikacija ne puca već bezbedno pada na podrazumevanu Auto temu.
- **Dokazi screenshot-ova:**
  - `docs/reviews/rework/evidence/login-light-app.png` (Svetla kapija)
  - `docs/reviews/rework/evidence/login-dark-app.png` (Tamna kapija)

### 2.2. Pristupačnost tastature i skip link

- **Skip link (`#sadrzaj`):**
  - Link `Preskoči na sadržaj` je prva fokusabilna stavka.
  - Na ekranu `Klubovi` (`#/klubovi`), aktivacija skip linka tastaturom poziva `preventDefault()`, fokusira `main#sadrzaj` i skroluje ga u vidokrug, zadržavajući hash rutu `#/klubovi` i ne praveći novi unos u istoriji pretraživača.
  - Na ekranu `Podešavanja` (`#/podesavanja`), aktivacija skip linka zadržava rutu `#/podesavanja` i fokusira `main#sadrzaj`.
  - Potvrđeno kroz `audit-skip-fokus-na-main`, `audit-skip-cuva-hash-klubovi` i `audit-skip-cuva-hash-podesavanja`.

### 2.3. Ekran Klubovi

- **Katalog klubova:**
  - Prikazana su tačno 4 kluba raspoređena u 2 sekcije po sportu (`Fudbal`: FK Crvena zvezda, FK Partizan; `Košarka`: KK Crvena zvezda, KK Partizan).
  - Svaki red ima dugme za praćenje (`Prati` / `Pratim`, sa `aria-pressed`) i dugme `Raspored` sa klasom `.club-open`.
  - Klik na `Prati` ažurira `users/{uid}/follows` podkolekciju u Firestore bazi bez slanja mrežnih zahteva ka spoljnim fixture serverima.
  - Klik na `Raspored` otvara modalni panel specifičan za izabrani klub.
- **Dokazi screenshot-ova:**
  - `docs/reviews/rework/evidence/clubs-light-app.png` (Svetla tema klubova)
  - `docs/reviews/rework/evidence/clubs-dark-app.png` (Tamna tema klubova)

### 2.4. Jedinstvena agenda, derbi razlozi i ručni izbor

- **Stanja liste:**
  - **0 utakmica:** Prikazuje poruku `Nema praćenih utakmica.` sa linkom za praćenje klubova.
  - **1 utakmica:** Najraniji potvrđeni meč ima bedž `Sledeća`. Na viewportu od 390px, kartica je vidljiva u gornjem delu ekrana bez potrebe za skrolovanjem (`top=393px, bottom=529px`).
  - **20 utakmica:** Prikazuje se tačno 20 redova (jedna puna strana), paginator prikazuje `Strana 1 od 1`.
  - **105 utakmica:** Paginacija deli listu na 6 stranica (20 po strani). Kontrole „Prethodna” i „Sledeća” omogućavaju navigaciju bez beskonačnog skrola.
- **Deduplikacija i razlozi praćenja (Derbi i Manual):**
  - Kada se prate oba kluba učesnika derbija (Crvena zvezda i Partizan), utakmica se prikazuje **tačno jednom**.
  - Detaljna inspekcija elementa `.agenda-reasons[aria-label="Razlozi praćenja"] li`:
    - Sa oba praćena kluba: tačno 2 razloga (`Pratim u aplikaciji: FK Crvena zvezda`, `Pratim u aplikaciji: FK Partizan`).
    - Nakon otpraćivanja Partizana: utakmica ostaje u agendi, a broj razloga u detaljima pada na tačno 1 (`Pratim u aplikaciji: FK Crvena zvezda`).
  - **Ručni izbor (Manual):**
    - Klik na `Dodaj ručno` dodaje razlog `Ručni izbor`, a dugme menja stanje u `Ukloni ručni izbor` sa `aria-pressed="true"`.
    - Otpraćivanje FK Crvena zvezda ostavlja utakmicu u agendi sa jednim razlogom (`Ručni izbor`).
    - Klik na `Ukloni ručni izbor` uklanja utakmicu i agenda postaje prazna (0 utakmica).
- **Dokazi screenshot-ova:**
  - `docs/reviews/rework/evidence/agenda-light-app.png` (Svetla tema agende)
  - `docs/reviews/rework/evidence/agenda-dark-app.png` (Tamna tema agende)
  - `docs/reviews/rework/evidence/agenda-0-utakmica.png` (Prazna agenda)
  - `docs/reviews/rework/evidence/agenda-1-utakmica-390.png` (1 utakmica sa bedžom Sledeća)

### 2.5. Google kalendar integracija (Mocked API)

- **Režim izbora i lepljiva traka pri skrolovanju (bez preklapanja):**
  - Klik na dugme `Izaberi` u traci agende aktivira režim višestrukog izbora i prikazuje checkbox-ove u redovima utakmica.
  - Dugme `Izaberi sve` bira sve podobne utakmice preko svih stranica (verifikovano na 105 utakmica).
  - Iznad donje navigacije prikazuje se lepljiva traka `.calendar-bar` sa brojem izabranih događaja (`105 izabrano`) i dugmetom `Dodaj u kalendar`.
  - Skrolovanjem na 800px niz listu, provereno je da `.calendar-bar` ostaje striktno iznad donje navigacije (`rBar.bottom <= rNav.top + 1`), a primarno dugme je u celosti dostupno i potvrđeno preko `document.elementFromPoint` (`audit-calendar-bar-sticky-skrol`).
  - Promena bilo kog filtera (npr. prelazak na Košarku) resetuje selekciju na 0 i onemogućava dugme za kalendar.
- **Otkazivanje/odbijanje OAuth dozvole:**
  - Otvaranjem modala potvrde i klikom na izvoz otvara se stvarni emulator popup.
  - Zatvaranjem popup prozora bez autorizacije, modal prikazuje grešku `Google dozvola nije dobijena.`, a primarno dugme se prebacuje u `Pokušaj ponovo`.
  - Selekcija svih 105 utakmica ostaje očuvana, a broj `POST` upisa je nula (`audit-kalendar-odbijena-dozvola-poruka`, `audit-kalendar-odbijena-dozvola-cuva-izbor`, `audit-kalendar-odbijena-nula-upisa`).
- **Pojedinačni izvoz iz detalja (sa potvrdom rezultata):**
  - Klik na karticu utakmice otvara modal detalja.
  - Primarno dugme `Dodaj u kalendar` u dnu detalja otvara modal potvrde za tačno tu jednu utakmicu.
  - Potvrda upisa pokreće OAuth popup tok, presreće se `POST` ka Calendar API-ju i utakmica se uspešno upisuje (`calendarEvents.size === 1`).
  - Nakon zatvaranja modala potvrde, modal detalja (`MatchDetail`) prikazuje vidljivi status uspeha: `<p role="status">Dodato u kalendar.</p>`.
  - Verifikovano kroz provere `audit-kalendar-pojedinacni-upisan` i `audit-kalendar-pojedinacni-potvrda-vidljiva`.
- **F13: Novi Calendar pregled ne prikazuje prethodni rezultat (nema stale statusa):**
  - Nakon uspešnog pojedinačnog izvoza, otvoren je modal potvrde za drugu utakmicu.
  - Potvrđeno je da novi modal potvrde ima prazan status (`status=""`) pre nego što se pokrene izvoz, čime je dokazano da stari rezultat iz prethodnog pokušaja ne curi u novi pregled (`audit-f13-novi-pregled-bez-stale-statusa`).
- **Stvarni Deferred Ownership sa Promise Gate-om (za seriju od 2 događaja) i odjavom usred čekanja:**
  - Odabrana su tačno 2 događaja (`audit-deferred-modal-dva-dogadjaja`).
  - Presretnuti `POST` zahtev za prvi događaj u Puppeteer-u se zadržava preko Promise gate-a (`deferredPostObserved = true`).
  - Dok operacija čeka na mrežni odgovor, u drugom tabu (`tabB`) sa identičnim zamrznutim satom korisnik se odjavljuje.
  - U originalnom tabu A čeka se da se automatski pojavi kapija prijave (`[data-screen="gate"]`) **pre puštanja odgovora** (`audit-deferred-tabA-odjavljen-pre-odgovora`).
  - Nakon potvrđene kapije, zadržani `POST` se oslobađa sa statusom 200 OK.
  - Klijentski `stillOwned` mehanizam detektuje da je nalog promenjen/ugašen: ne šalje se drugi `POST` zahtev za preostali događaj iz serije (`extraPostsAfterLogout === 0`), a na ekranu nema zastarele potvrde (`audit-deferred-zero-extra-posts`, `audit-deferred-nema-stale-prikaza`).
- **Browser Back tokom pending POST-a (za seriju od 2 događaja):**
  - Odabrana su 2 događaja, otvoren modal potvrde i pokrenut izvoz koji stiže u zadržani POST (`audit-back-post-zadrzan`).
  - Zabeležen je broj poslatih POST zahteva na kapiji (`atGate = 3`).
  - Izvršava se `history.back()`.
  - Potvrđeno je da modal potvrde nestaje (`audit-back-confirm-nestao`).
  - Oslobađa se zadržani POST sa 200 OK.
  - Potvrđeno je da broj poslatih zahteva ostaje tačno 3 (`after = 3`), čime je dokazano da drugi POST iz serije nije poslat (`audit-back-zero-extra-posts`).
  - Potvrđeno je da na ekranu nema potvrde starog pokušaja (`audit-back-nema-potvrde-starog-pokusaja`).
- **Povratak skrola (Scroll Restore) i očuvanje upita:**
  - Na punoj listi od 105 utakmica izvršeno je skrolovanje na pozitivnu poziciju `scrollY = 500px`.
  - Izvršena je stvarna navigacija na `#klubovi` klikom na `nav a[href="#/klubovi"]`, a zatim povratak klikom na `nav a[href="#/utakmice"]`.
  - Izmereno: `saved = 500px, restored = 500px, diff = 0px` (`audit-scroll-restore-ocuvan`).
  - Potvrđeno je očuvanje izabranog sporta i stanja paginatora: `sport = Sve, page = PrethodnaStrana 1 od 6Sledeća` (`audit-scroll-query-ocuvan`).
- **Autentični OAuth emulator tok i presretanje API-ja:**
  - Preflight `OPTIONS` vraća status 200 sa ispravnim CORS zaglavljima.
  - Delimični neuspeh: namerni pad (500) na drugom upisu prekida seriju, uspešni upis se beleži, a neuspeli ostaje označen za ponovni pokušaj (`Pokušaj ponovo`).
  - Ponovni pokušaj uspešno dodaje preostale događaje (tačno 3 događaja, `calendarEvents.size === 3`).
  - Nepotvrđena satnica: utakmice sa statusom `time_tbd` upisuju se u 17:00 po lokalnom vremenu u Beogradu (15:00 UTC) uz upozorenje u modalu.
  - Opciona beleška: tekst unet u `#draft-note` prenosi se u `event.description`.
  - Provera duplikata: ponovljeni izvoz svih 3 postojećih utakmica simulira odgovor 409 Conflict i potvrđuje da se izvršavaju tačno 3 `POST` (409) i tačno 3 `GET` poziva za proveru bez dupliranja ID-jeva.

### 2.6. Ekran Podešavanja i podpaneli u obe teme

- **Svih 6 kompaktnih podpanela u Svetloj i Tamnoj temi:**
  - Svih 6 podpanela otvoreno je, snimljeno i zatvoreno preko Escape tastera u obe teme (`audit-svih-6-podpanela-light-dark-potvrdjeno`):
    1. `Izgled`: `evidence/settings-panel-izgled-light.png` i `settings-panel-izgled-dark.png`
    2. `Vremenska zona`: `evidence/settings-panel-zona-light.png` i `settings-panel-zona-dark.png`
    3. `Obaveštenja`: `evidence/settings-panel-obavestenja-light.png` i `evidence/settings-panel-obavestenja-dark.png`
    4. `Nalog`: `evidence/settings-panel-nalog-light.png` i `settings-panel-nalog-dark.png`
    5. `Instalacija i pomoć`: `evidence/settings-panel-pomoc-light.png` i `settings-panel-pomoc-dark.png`
    6. `O aplikaciji`: `evidence/settings-panel-o-aplikaciji-light.png` i `settings-panel-o-aplikaciji-dark.png`
- **Očuvanje stanja filtera između tabova:**
  - Izbor filtera za sport (`Košarka`) ostaje aktivan nakon prelaska na ekran Klubovi i povratka nazad na Agendu (`audit-filter-ocuvan-posle-taba`).
- **Glavni ekranski dokazi:**
  - `docs/reviews/rework/evidence/settings-light-app.png` (Svetla tema podešavanja)
  - `docs/reviews/rework/evidence/settings-dark-app.png` (Tamna tema podešavanja)

### 2.7. ModalPanel interakcije i fokus

- **Ponašanje i istorija:**
  - Otvaranje modala postavlja unikatni marker u `history.state` (`matchaheadPanel`).
  - Pritiskom na taster `Escape` ili dugme `Back` na telefonu, modal se zatvara bez dupliranja unosa u istoriji.
  - Fokus se automatski zaključava unutar modala (`focus trap`) i vraća se na element koji je pokrenuo modal nakon zatvaranja.
  - Ugnježdeni modali (npr. raspored kluba koji otvara detalje utakmice): prvi `Escape` zatvara gornju potvrdu, a drugi `Escape` zatvara osnovni modal detalja (`audit-tastatura-escape-1-ostavlja-detalj`, `audit-tastatura-escape-2-zatvara-sve`).

### 2.8. Responsivnost, geometrija, dodirne površine i tastatura

- **Testirani viewport-ovi:**
  - `360x740` (mali telefon): nula preliva (`diff=0px`), dodirne površine >= 48px na svim ekranima.
  - `390x844` (standardni telefon): nula preliva, dodirne površine >= 48px, prva utakmica vidljiva bez skrolovanja.
  - `430x932` (veliki telefon): nula preliva, dodirne površine >= 48px.
  - `844x390` (položeni telefon / landscape): prilagođen prikaz, donja navigacija kompaktna, nula preliva.
  - `1280x800` (desktop): centrirana aplikacija maksimalne širine, modal se renderuje kao centrirani dijalog umesto bottom sheet-a.
- **Dodirne površine od 48px na svim ekranima (Touch targets >= 48px):**
  - **Agenda:** 35 kontrola uz aktiviran režim izbora, uključujući 20 stvarnih checkbox omotača (`article.match-row > label`, gde je `input` od 22px unutar dodirne zone od najmanje 48px). Provereno tačno 20 labela i 35 kontrola (`checked=35, labels=20, failures=[]`).
  - **Klubovi:** 8 dugmadi (`ul.club-list button`), gde svako dugme za praćenje i raspored ima minimalnu veličinu 48x48px (`checked=8, failures=[]`).
  - **Podešavanja:** 6 dugmadi podpanela (`button.settings-row`), svako ima minimalnu veličinu 48x48px (`checked=6, failures=[]`).
  - Provereno bez ijednog neuspeha na širinama 360px, 390px i 430px.
- **Skaliranje teksta (Text Zoom 32px na documentElement):**
  - Postavljanjem `fontSize = '32px'` na `document.documentElement` (200% od baseline 16px), potvrđeno je da se visina navigacije udvostručila sa 72px na 144px (`audit-zoom-nav-uvecan`).
  - Horizontalni preliv je ostao tačno 0px (`audit-zoom-teksta-bez-preliva`).
  - Snimljen je screenshot: `docs/reviews/rework/evidence/audit-text-zoom-32px.png`.
- **Geometrija sa simuliranom virtuelnom tastaturom (Keyboard Viewport 390x480):**
  - Otvoren modal potvrde sa poljem za belešku, fokusirano polje `#draft-note` i unet tekst `Test tastature`.
  - Simuliran visual viewport resize na 480px visine.
  - Proverom na gornjem panelu (`panels.at(-1)`) potvrđeno:
    - Beleška je fokusirana (`noteFocused=true`).
    - Dugme za zatvaranje je min 48x48px, unutar vidokruga i klikabilno preko `document.elementFromPoint` (`closeOk=true`).
    - Primarno dugme je min 48x48px, unutar vidokruga i klikabilno preko `document.elementFromPoint` (`primaryOk=true`).
    - Horizontalni preliv je tačno 0px (`overflow=0`).
  - Snimljen je screenshot: `docs/reviews/rework/evidence/audit-keyboard-viewport-modal.png`.
  - Prvi `Escape` zatvara gornju potvrdu i ostavlja 1 modal (`audit-tastatura-escape-1-ostavlja-detalj`).
  - Drugi `Escape` zatvara detalje i ostavlja 0 modala (`audit-tastatura-escape-2-zatvara-sve`).
- **Dokazi screenshot-ova:**
  - `docs/reviews/rework/evidence/viewport-mobile-360.png`
  - `docs/reviews/rework/evidence/viewport-mobile-390.png`
  - `docs/reviews/rework/evidence/viewport-mobile-430.png`
  - `docs/reviews/rework/evidence/viewport-landscape-844x390.png`
  - `docs/reviews/rework/evidence/viewport-desktop-1280.png`
  - `docs/reviews/rework/evidence/audit-text-zoom-32px.png`
  - `docs/reviews/rework/evidence/audit-keyboard-viewport-modal.png`

### 2.9. Rad van mreže (Offline) i opoziv izvora

- **Rad van mreže:**
  - Postavljanjem offline režima (`setOfflineMode(true)`), aplikacija prikazuje žuto upozorenje `Van mreže. Prikazan je poslednji sačuvan raspored.`.
  - Sačuvane utakmice u agendi i rasporedu klubova ostaju vidljive iz lokalnog keša.
  - Klik na `Osveži` u klubu dok je uređaj offline ne šalje mrežne zahteve ka serveru.
- **Opoziv prava objave (Revocation):**
  - Kada izvor dobije status `publication: 'forbidden'` (`revoked`), klijent pokreće `purgeRevokedSnapshots`.
  - Sve utakmice tog izvora se automatski brišu iz svih klupskih snimaka i agenda se prazni.

---

## 3. Nalazi, neslaganja i rešeni problemi (Findings & Bug Disclosures)

Tokom sprovođenja integrisanog audita uočeni su i razrešeni sledeći detalji:

1. **Vidljiva potvrda pojedinačnog izvoza (Rešio Grok u `task_f8a94fe20028`):**
   - *Problem:* Kod pojedinačnog izvoza iz modala detalja, uspešan izvoz je zatvarao confirm modal (`setConfirm(null)`), ali poruka o uspehu (`calendar.message`) je bila prikazivana samo u selekcionoj traci (`.calendar-bar`) ili unutar confirm modala, pa je modal detalja ostajao bez povratne informacije.
   - *Rešenje:* Koordinator je identifikovao ovaj UX nedostatak i dodelio zadatak Grok-u, koji je uveo stanje `singleNotice` i prosledio `exportNotice` u `MatchDetail`. Sada modal detalja prikazuje `<p role="status">Dodato u kalendar.</p>`. U integrisanom auditu to je potvrđeno kroz `audit-kalendar-pojedinacni-potvrda-vidljiva`.
2. **Uklanjanje zaostale poruke u novom pregledu (F13, Rešio Grok u `PersonalAgenda.tsx`):**
   - *Problem:* Uspešan pojedinačni izvoz ostavljao je `calendar.message` u memoriji hook-a, pa je otvaranje novog modalnog pregleda prikazivalo staru poruku pre novog klika na izvoz.
   - *Rešenje:* Grok je uveo `confirmAttemptStarted` stanje koje status prikazuje samo nakon pokretanja tekućeg pokušaja. U integrisanom auditu potvrđeno je da novi pregled ima prazan status (`status=""`) pre pokretanja izvoza (`audit-f13-novi-pregled-bez-stale-statusa`).
3. **Pristupačnost skip linka (Rešio Grok u `task_7e8ceee8e24c`):**
   - *Problem:* Link `href="#sadrzaj"` je menjao hash rutu u pretraživaču i resetovao trenutni tab sa Klubova ili Podešavanja na početnu stranicu.
   - *Rešenje:* Grok je dodao `onClick` hendler u `App.tsx` koji poziva `event.preventDefault()`, eksplicitno fokusira `main#sadrzaj` i skroluje ga u vidokrug bez promene hash rute (`audit-skip-cuva-hash-klubovi` i `audit-skip-cuva-hash-podesavanja`).
4. **Povećanje teksta na korenskom elementu (Root 32px):**
   - *Uočeno:* Početni probni skript je postavljao `fontSize` na `body`, što nije uticalo na elemente čije su veličine definisane u `rem` jedinicama (poput `nav` i naslova).
   - *Ispravka:* Usklađeno sa preporukom koordinatora: `document.documentElement.style.fontSize = '32px'` verifikuje stvarno skaliranje celokupne aplikacije na 200%, uz dokaz udvostručenja visine navigacije (sa 72px na 144px) i očuvanje 0px preliva.
5. **Stroga provera dodirnih površina od 48px na svim ekranima:**
   - *Uočeno:* Prethodna provera koristila je prag od 44px i mogla je dati lažni prolaz na praznim selektorima, a checkbox-ovi nisu bili u režimu izbora.
   - *Ispravka:* Uvedena je stroga provera minimalnih dimenzija >= 48px na svim vidljivim kontrolama: 35 kontrola na Agendi uključujući 20 stvarnih checkbox omotača (`article.match-row > label`), 8 dugmadi na Klubovima i 6 dugmadi na Podešavanjima.
6. **Tačni brojevi ponovnog pokušaja i duplikata u kalendaru:**
   - *Uočeno:* U `check-schedule-ui.mjs` stajalo je `>= 2` i `>= 1`.
   - *Ispravka:* Usklađeno sa tačnim brojevima iz plana: tačno 3 događaja na retry-ju (`calendarEvents.size === 3`), i tačno 3 `POST` (409) i tačno 3 `GET` poziva za proveru bez dupliranja ID-jeva. Takođe uklonjeno logovanje `request.headers()` iz ispisa.

---

## 4. Ograničenja i status plana (Honest Scope Boundaries)

- **Fizički Android PWA uređaj:**
  - Instalacija i ponašanje na fizičkom Android telefonu sa uključenim sistemskim podešavanjima zabeleženi su kao **`NOT_TESTED`**. Prema izričitom dogovoru sa korisnikom i uputstvu koordinatora, fizičko testiranje na uređaju korisnik sprovodi lično u kasnijoj fazi.
- **Status validacije plana:**
  - Svi automatizovani, simulatorni i integrisani zahtevi iz odobrenog plana su uspešno verifikovani i prošli bez greške u headless Chromium okruženju sa izolovanim emulatorima (ukupno 82 integrisane provere, 43 provere okvira, 47 provera sesije, 152 klijentska testa, 56 testova servisa i 35 ugovora domena).
  - Celokupan plan se **ne proglašava u potpunosti zatvorenim** (ne izdaje se blanket completion) sve dok korisnik lično ne verifikuje PWA iskustvo na sopstvenom fizičkom uređaju.

---

## 5. Zaključak

Integrisani audit je **uspešno završen** (`outcome: succeeded`). Lokalna aplikacija je u potpunosti stabilna, odgovara specifikacijama iz `approved-plan.md`, poštuje sve ugovore o podacima i bezbednosne granice, a svi logovi i slikovni dokazi su trajno sačuvani u repozitorijumu.
