# Orkestracioni plan i mapa razvoja (Orchestration Plan)

Datum: 30. septembar 2026.  
Orkestracioni run: `run_b1cd86cb71c5` (status: normalan, final+idle; bez lifecycle komandi, bez push/deploy akcija)  
Koordinator: `term_c83e83d8-4eef-4b6c-8602-fe2195768cce`  
Učesnici: Grok (04 Auth/Firestore jezgro), Muse (04 klijent ekran + 06 Agenda), Gemini CLI (infrastruktura i revizije)

> Checkpoint karakter: IN_PROGRESS. Koordinator još nije poslao finalne dokaze klijenta (Muse `matchahead-auth-client`), push probne isporuke (Grok `matchahead-readiness`) ni završne preglede. Ništa od toga se ovde ne izmišlja — čeka se dopunska korekcija kada rezultati stignu.

---

## 1. Prvi talas — zadaci, ishodi i commiti (First Wave, završen krug)

Talas pokrenut 30. septembra 2026. radi paralelnog rešavanja nezavisnih osnova aplikacije:

| Agent / Zaduženje | Radno stablo (Worktree) / Zadatak | Delokrug i ciljevi | Ishod i commiti |
|---|---|---|---|
| **Grok** | `matchahead-04-auth` | **Faza 04 jezgro: model naloga, Firestore pravila, emulator pomoćnici (bez React ekrana).** | Jezgro isporučeno i commitovano: `f7f3213` (schema+pravila checkpoint), `5246e6d` (brava u `accountTombstones/{uid}`), `5be2809` (bezbednosni pregled arhitekture). Status faze: **IN_PROGRESS** — ekran prijave/odjave/podešavanja/brisanja nije urađen; živa Google prijava NOT_TESTED; pravila nisu deployovana. Predaja: `docs/handoffs/04-prijava-i-podesavanja.md`. |
| **Muse (ručno, uz odobrenje korisnika)** | `matchahead-06-agenda` | **Faza 06: agenda logika + samostalne UI komponente nad DEMO podacima.** | Isporučeno i commitovano: `f9f7952` (osnova: unija, razlozi, grupe, next, bezbedan status), `d0f8469` (samostalne `PersonalAgendaHome`/`PersonalAgendaScreen`, pomoćnici, testovi), `4e80cef` (DOM verifikacioni izveštaj). Finalni pregled `docs/reviews/06-agenda-ui.md`: 13/13 browser scenarija prolazi; 2 manje mane i 3 zapažanja evidentirani. Status faze: **IN_PROGRESS** — integracija u `App.tsx`/`screens.tsx` namerno ostavljena koordinatoru; živi Auth i uređaji NOT_TESTED. |
| **Muse (ručno, uz odobrenje korisnika)** | `matchahead-auth-client` (živo stablo, samo proizvod) | **Faza 04 klijent: browser adapter i ekran na Grok jezgru.** | U radu u živom stablu (ne dirati iz drugih checkouta). Finalni dokaz koordinator još nije poslao — ovaj checkpoint ga ne izmišlja. |
| **Gemini CLI** | `matchahead-readiness` (`task_349b47cb2a62`) | **Infrastrukturna revizija + push readiness revizija (docs).** | Dokazi isporučeni i commitovani kao docs: `a667913` (infrastruktura), `66d294f` (orkestracioni plan), `db5ba30` (korekcije), `d2ea0ab` (push revizija), `36289e9` (korekcije push revizije). `worker_done` je odbijen jer izvođač nema traženu sposobnost — to NIJE prihvaćeno završavanje. Koordinator je oporavio proverene isporuke, zaustavio/oslobodio radnika i stablo ostavio settlovano. Grok in-progress push fajlovi iz živog stabla se ne preuzimaju dok koordinator ne pošalje finalni commit. |

### Runtime devijacije (zabeleženo pošteno)
- Muse je radio ručno u direktnom terminalu nakon što je korisnik odobrio zaobilaženje readiness grešaka — nije tihi agent-run, već odobreni ručni rad.
- Gemini `worker_done` je odbijen (nedostaje sposobnost); isporučene i proverene docs-commite koordinator je preuzeo, radnika zaustavio/oslobodio. Ne evidentira se kao prihvaćeno završavanje zadatka.
- Ovaj (Muse docs) checkout `matchahead-04-auth` je settlovan na jezgru/p pregledu `5be2809`; samo durable docs se ovde uređuju. Cherry-pickovani docs-commiti gore su integracioni ulaz; ovaj checkpoint je novi commit.

---

## 2. Sledeći korak: Integracija i nezavisna provera (Next Wave)

Nakon završetka rada Groka i Muse-a:
1. **Spajanje i integracija:**
   - Usklađivanje Grokovog modela korisnika sa Muse-ovom funkcijom agende (ulazi: `followedTeamIds: readonly string[]`, `manualFixtureIds: readonly string[]`).
   - Povezivanje ekrana „Moje utakmice” i „Podešavanja” unutar PWA shell-a (`apps/web`).
2. **Nezavisna bezbednosna i PWA revizija:**
   - Provera Firestore pravila: onemogućeno curenje privatnih podataka, sprečena zloupotreba kvota, validirana polja profila i kataloga timova (`selectableTeams`).
   - Provera PWA invarijanti: jedan registrovani service worker (bez paralelnih registracija), offline omotač ne kešira privatne Google/Firestore odgovore, manifest ID ostaje stabilan.

---

## 3. Dalje faze projekta (Roadmap)

| Faza | Naziv | Tehnički status i preduslovi | Može se raditi na DEMO / emulatorima? | Zahteva žive resurse / fizički uređaj? |
|---|---|---|---|---|
| **04** | Google prijava i podešavanja | U toku (Grok) | **DA** (Firebase Auth & Firestore emulatori) | Za live: deploy pravila i provera Google Sign-In na `github.io` |
| **06** | Moje utakmice (Agenda) | U toku (Muse) | **DA** (čista TypeScript logika, DEMO raspored) | Ne |
| **Integracija** | Povezivanje 04 + 06 u PWA | Planirano nakon prvog talasa | **DA** (Vite build, lokalni testovi) | Ne |
| **05** | Pronalazak na zahtev (data05) | **IZRIČITO BLOKIRANO** — odobren izvor nedostaje; javni rasporedi ostaju DEMO | Samo mock/sintetički adapteri | Za live: odobren izvor sa pokrivenošću i pravom unosa |
| **07** | ICS (automatski kalendar) | Planirano, nije implementirano | **DA** (generisanje standardnog RFC 5545 ICS fajla iz agende) | Za live distribuciju: javni HTTPS hosting bezbedan od curenja ličnih podataka |
| **08** | separateCalendarOAuth (ručni Google upis, odvojen OAuth korak) | Planirano, nije implementirano; nije deo faze 04 | Delimično (mock OAuth tokena i Calendar API tela) | Za live: Google Calendar OAuth saglasnost i nalog sa pravima upisa |
| **09** | pushdevice (push na uređaju) | Planirano, nije implementirano; čeka fazu 04 (FID) i 02 | Delimično (lokalni workerd potpis prolazi) | **DA** (dostupni Android prvi kandidat, iPhone nepotvrđen, VAPID ključ, zatvorena PWA pre slanja) |
| **10** | serverCron (zakazivanje podsetnika) | Planirano, nije implementirano; čeka faze 06, 08 i 09 | **DA** (logika izračunavanja termina 15/30/60 min, mock crona) | Za live: Cloudflare Workers Cron Trigger i dokumentovana CPU granica (10 ms; plan naloga nije verifikovan) |
| **11** | E2E (provera celog toka) | Planirano, nije implementirano; čeka sve prethodne celine | Delimično | **DA** (krajnji E2E test na mobilnom uređaju) |
| **12** | Pilot i predaja | Završna faza, nije implementirano | Ne | **DA** (stvarni korisnici na telefonima tokom takmičarskih kola) |

---

## 4. Razgraničenje: Šta je izvodljivo u DEMO/emulator režimu vs. Stvarni svet

### A. Potpuno izvodljivo na sintetičkim podacima i emulatorima (0 € budžet)
- Razvoj i testiranje Firestore šeme i pravila (kroz `firebase emulators:exec`).
- Logika deduplikacije utakmica, vremenskih zona, DST pomeranja i statusa odloženih mečeva.
- Korisnički interfejs: navigacija, izbor klubova iz fiksnog kataloga, prikaz bedževa i statusa.
- Service Worker keširanje statičkih resursa i rukovanje ažuriranjima.
- Generisanje ICS tekstualnog formata.

### B. Zahteva stvarne spoljne servise ili fizičke uređaje
- **Stvarni sportski podaci:** Postojeće revizije navode da nema potvrđene dozvole za besplatne API-je. Aplikacija se mora osloniti na DEMO raspored dok se ne potvrdi izvor sa dozvolom.
- **Google Sign-In u produkciji:** Zahteva raspoređivanje konfiguracije i test na javnom domenu (`https://mlsivanovic.github.io/matchahead/`).
- **PWA Push na zatvorenoj aplikaciji:** Prijem obaveštenja na PWA zatvorenoj pre slanja sa odvojenog pošiljaoca (NE Force stop, NE gašenje browsera, NE „pošalji pa zatvori”) mora se empirijski dokazati na fizičkom uređaju. Android je dostupan po korisniku; iPhone nije potvrđen; nijedan fizički push test nije izvršen.
