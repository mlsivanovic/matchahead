# Orkestracioni plan i mapa razvoja (Orchestration Plan)

Datum: 30. septembar 2026.  
Orkestracioni run: `run_b1cd86cb71c5`  
Koordinator: `term_c83e83d8-4eef-4b6c-8602-fe2195768cce`  
Učesnici: Grok (04 Auth/Firestore), Muse (06 Agenda), Gemini CLI (Infrastruktura i revizija)

---

## 1. Trenutni prvi talas (First Wave)

Talas pokrenut 30. septembra 2026. radi paralelnog rešavanja nezavisnih osnova aplikacije:

| Agent / Zaduženje | Radno stablo (Worktree) / Zadatak | Delokrug i ciljevi | Status realizacije |
|---|---|---|---|
| **Grok** | `matchahead-04-auth` (`task_63b6f64a7676`) | **Faza 04: Google prijava, Firestore i privatnost.** Implementacija modela profila, omiljeni timovi odvojeni od praćenih klubova, vremenska zona i notifikacione preference, Firestore sigurnosna pravila (samo vlasnik), 2-user izolacija, brisanje naloga i odjava. Testiranje u Firebase emulatorima. | U radu (isporučuje model i pravila bez menjanja agende). |
| **Muse** | `matchahead-06-agenda` (`task_2192e0e9d10c`) | **Faza 06: Agenda, razlozi uključivanja i vreme.** Čista logika korisničke agende kao unije praćenih klubova i ručno izabranih utakmica. Stabilan ID, očuvanje razloga, deterministički UTC redosled, grupe arhive/poremećaja/budućnosti, prelazak na zimsko/letnje vreme. Rad se odvija u direktnom terminalu (odobreno usled Orca agent-readiness greške). | U radu (isporučuje čistu domensku logiku nad DEMO podacima). |
| **Gemini CLI** | `matchahead-readiness` (`task_349b47cb2a62`) | **Pristupi, blokade i ažurna dokumentacija.** Revizija i potvrda CLI alata, nulto-budžetskih resursa (Firebase Spark `matchahead`, eur3 Firestore, omogućen Google Auth, Cloudflare Wrangler), ispravka zastarelog statusa o neobjavljenom Pages-u (`https://mlsivanovic.github.io/matchahead/`), reevaluacija sportskih blokada i predaja javnih konfiguracija. | Završeno (kreirana `docs/infrastructure-readiness.md` i ažurirana dokumentacija). |

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
| **05** | Pronalazak na zahtev | **IZRIČITO BLOKIRANO** dok se ne reši pravna dozvola i pokrivenost izvora | Samo mock/sintetički adapteri | Za live: ugovor/dozvola nosioca prava za preuzimanje i javnu distribuciju |
| **07** | Automatski kalendar (ICS) | Čeka integraciju | **DA** (generisanje standardnog RFC 5545 ICS fajla iz agende) | Za live distribuciju: javni HTTPS hosting bezbedan od curenja ličnih podataka |
| **08** | Ručni Google Calendar upis | Čeka fazu 04 | Delimično (mock OAuth tokena i Calendar API tela) | Za live: Google Calendar OAuth saglasnost i nalog sa pravima upisa |
| **09** | Push notifikacije na uređaju | Čeka fazu 04 (FID) i 02 | Delimično (lokalni workerd potpis prolazi) | **DA** (fizički Android i iPhone telefoni, VAPID ključ, instalirana zatvorena PWA) |
| **10** | Zakazivanje podsetnika | Čeka faze 06, 08 i 09 | **DA** (logika izračunavanja termina -2h/-24h, mock crona) | Za live: Cloudflare Workers Cron Trigger i siguran limit CPU vremena (< 10 ms) |
| **11** | Provera celog toka | Čeka sve prethodne celine | Delimično | **DA** (krajnji E2E test na mobilnom uređaju) |
| **12** | Pilot i predaja | Završna faza | Ne | **DA** (stvarni korisnici na telefonima tokom takmičarskih kola) |

---

## 4. Razgraničenje: Šta je izvodljivo u DEMO/emulator režimu vs. Stvarni svet

### A. Potpuno izvodljivo na sintetičkim podacima i emulatorima (0 € budžet)
- Razvoj i testiranje Firestore šeme i pravila (kroz `firebase emulators:exec`).
- Logika deduplikacije utakmica, vremenskih zona, DST pomeranja i statusa odloženih mečeva.
- Korisnički interfejs: navigacija, izbor klubova iz fiksnog kataloga, prikaz bedževa i statusa.
- Service Worker keširanje statičkih resursa i rukovanje ažuriranjima.
- Generisanje ICS tekstualnog formata.

### B. Zahteva stvarne spoljne servise ili fizičke uređaje
- **Stvarni sportski podaci:** Nijedan besplatan API ne daje kompletan raspored za FK/KK Partizan i FK/KK Crvenu zvezdu uz pravo redistribucije. Bez komercijalnog ugovora ili dozvole, aplikacija mora ostati na opciji eksternih klupskih linkova ili sintetičkog DEMO rasporeda.
- **Google Sign-In u produkciji:** Zahteva raspoređivanje konfiguracije i test na javnom domenu (`https://mlsivanovic.github.io/matchahead/`).
- **PWA Push na zaključanom telefonu:** Prijem obaveštenja dok je aplikacija potpuno zatvorena (naročito na iOS 16.4+ uz WebPush i Android Chrome-u) mora se empirijski dokazati na fizičkom uređaju.
