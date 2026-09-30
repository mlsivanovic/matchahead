# Provera spremnosti infrastrukture i pristupa (Infrastructure Readiness)

Datum provere: 30. septembar 2026.  
Status infrastrukture: VERIFIKOVANO (Spark / besplatni nivo, bez naplate)  
Autori / uloge: Gemini CLI (infrastrukturna revizija i provera pristupa), orkestrirano u okviru Orca run-a `run_b1cd86cb71c5`.

---

## Sažetak nalaza

1. **GitHub Pages produkcija:** Repozitorijum `mlsivanovic/matchahead` je aktivan na grani `main` (poslednji deploy commit `be48495`). Aplikacija je javno dostupna na adresi `https://mlsivanovic.github.io/matchahead/` (HTTP 200 OK, učitava PWA manifest i service worker). Raniji navod u dokumentaciji da git nije inicijalizovan i da projekat nije objavljen je zastareo i ovim ažuriran.
2. **Firebase nalog i projekat:** Korisnik je prijavljen kao `mls.ivanovic@gmail.com`. Namenski projekat `matchahead` (broj projekta `298957530037`) već postoji na besplatnom Spark planu (0 €, bez uključene naplate).
   - **Firestore:** Aktivan u Native režimu u evropskoj zoni `eur3` (`europe-west3` Frankfurt). Besplatna kvota (`freeTier: true`) je aktivna.
   - **Google prijava (Identity Platform):** Provajder `google.com` je omogućen (`enabled: true`, Client ID `298957530037-tign4u584abrmhegrlejpb0rci88juqi.apps.googleusercontent.com`).
   - **Ovlašćeni domeni:** `localhost`, `matchahead.firebaseapp.com`, `matchahead.web.app`, kao i `mlsivanovic.github.io` su autorizovani za Google prijavu.
   - **Web aplikacija:** Registrovana aplikacija `MatchAhead` (App ID `1:298957530037:web:e60964d052cc34662d6ffc`). Javna web SDK konfiguracija je predata koordinatoru i Groku za fazu 04.
3. **Cloudflare Wrangler / Workers:** Korisnik je prijavljen kao `mls.ivanovic@gmail.com` (Account ID `691fe270f7bcf12734823eed7f29a559`). Worker `matchahead-push-probe` je već postavljen na Cloudflare Workers Free planu (verzija od 27. septembra 2026).
4. **Lokalni alati i emulatori:** Node.js v26.7.0, Java OpenJDK 21.0.2, Firebase CLI 15.32.0 i Wrangler 4.144.0 su instalirani. Preuzeti su JAR paketi za Firestore emulator (`v1.22.0`) i UI emulator (`v1.15.0`).
5. **Izvori sportskih podataka:** Prepreka ostaje na snazi — nijedan besplatan izvor nema istovremeno i punu pokrivenost mečeva (Superliga, KLS, ABA, Evroliga, Liga konferencije) i pravo ponovne objave. MatchAhead ostaje na sintetičkom DEMO rasporedu dok se ne definiše ovlašćeni izvor.

---

## 1. Verifikacija lokalnog okruženja i alata

Izvršene komande na sistemu (30. septembar 2026):

```bash
$ node -v && npm -v
v26.7.0
11.19.0

$ java -version
openjdk version "21.0.2" 2024-01-16
OpenJDK Runtime Environment (build 21.0.2+13-58)
OpenJDK 64-Bit Server VM (build 21.0.2+13-58, mixed mode, sharing)

$ firebase --version
15.32.0

$ npx wrangler --version
⛅️ wrangler 4.144.0
```

- **Emulatori:** Pokrenuto `firebase setup:emulators:firestore` i `firebase setup:emulators:ui`; `cloud-firestore-emulator-v1.22.0.jar` (137 MB) i `ui-v1.15.0.zip` (4 MB) su uspešno keširani lokalno za potrebe testova faze 04.

---

## 2. GitHub Pages verifikacija

Komanda za proveru zaglavlja javne adrese:

```bash
$ curl -sI https://mlsivanovic.github.io/matchahead/
HTTP/2 200 
server: GitHub.com
content-type: text/html; charset=utf-8
x-github-edge-region: fra
```

- **Status:** HTTP 200 OK.
- **Putanja:** Baza `/matchahead/`.
- **Servisirani resursi:** HTML omotač, Vite bundle (`assets/index-BVY2zMBy.js`), stilovi (`assets/index-DtsEIELt.css`), ikone i manifest (`/matchahead/manifest.webmanifest`).
- **Skripta za preusmeravanje:** Skripta u zaglavlju uspešno preslikava putanje na hash rute (npr. `/matchahead/klubovi` -> `#/klubovi`).

---

## 3. Firebase revizija (Projekat `matchahead`)

Prijavljeni nalog: `mls.ivanovic@gmail.com`

### 3.1. Detalji projekta i baza podataka

```json
{
  "projectId": "matchahead",
  "projectNumber": "298957530037",
  "displayName": "MatchAhead",
  "state": "ACTIVE"
}
```

- **Baza podataka:** `projects/matchahead/databases/(default)`
  - **Tip:** `FIRESTORE_NATIVE`
  - **Lokacija:** `eur3` (`europe-west3`, Frankfurt)
  - **Besplatni nivo (Free Tier):** `freeTier: true`
  - **Status brisanja:** `DELETE_PROTECTION_DISABLED`
  - **Kreirano:** 27. septembar 2026.

### 3.2. Firebase Authentication / Identity Toolkit

- **Google IDP:** Omogućen (`projects/298957530037/defaultSupportedIdpConfigs/google.com`, `enabled: true`).
- **Google OAuth Client ID:** `298957530037-tign4u584abrmhegrlejpb0rci88juqi.apps.googleusercontent.com`
- **Ovlašćeni domeni:**
  - `localhost`
  - `matchahead.firebaseapp.com`
  - `matchahead.web.app`
  - `mlsivanovic.github.io`
- **Postojeći korisnici:** 0 (čista baza).

### 3.3. Javna Web SDK konfiguracija (dodeljena Groku za fazu 04)

Ovo su javni parametri klijentske aplikacije (nisu admin tajne niti servisni ključevi):

```json
{
  "projectId": "matchahead",
  "appId": "1:298957530037:web:e60964d052cc34662d6ffc",
  "storageBucket": "matchahead.firebasestorage.app",
  "apiKey": "AIzaSyA7yBiKl1Cngb_MIUEIWwpj-gQ3dZUtv-g",
  "authDomain": "matchahead.firebaseapp.com",
  "messagingSenderId": "298957530037",
  "projectNumber": "298957530037"
}
```

---

## 4. Cloudflare Wrangler i Workers revizija

- **Nalog:** `mls.ivanovic@gmail.com`
- **Account ID:** `691fe270f7bcf12734823eed7f29a559`
- **Worker ime:** `matchahead-push-probe` (definisano u `experiments/push-probe/wrangler.jsonc`)
- **Istorija postavljanja:**
  - Poslednji upload: `2026-09-27T17:52:49.105Z` (verzija `2ee78270-c9d8-4374-ba09-623d590ec448`)
- **Ograničenja:** Worker je postavljen na besplatnom nalogu (10 ms CPU limit). Slanje je podrazumevano onemogućeno (`PROBE_SEND_ENABLED=0`) dok se ne unesu odobreni parametri i ne pokrene ciljano testiranje.

---

## 5. Razlikovanje statusa: Instalirano/Prijavljeno vs. Konfigurisano/Živo testirano

Da bi stanje bilo kristalno jasno u skladu sa standardima projekta:

| Komponenta | Instalirano / CLI prisutan | Nalog / Pristup | Konfigurisano u projektu | Testirano u emulatoru / lokalno | Živo testirano na uređaju (Live) |
|---|---|---|---|---|---|
| **GitHub Pages** | Da (`git`) | Da (`origin/main`) | Da (`.github/workflows/pages.yml`) | Da (lokalni build) | **DA** (`https://mlsivanovic.github.io/matchahead/`, HTTP 200) |
| **Firestore** | Da (`firebase`) | Da (`mls.ivanovic@gmail.com`) | Da (`matchahead`, `eur3`) | U toku (Grok faza 04 emulator testovi) | **NE** (pravila i podaci još nisu raspoređeni na produkcioni Firestore) |
| **Google Auth** | Da (`gcloud`) | Da (`mls.ivanovic@gmail.com`) | Da (`google.com` aktivan, `github.io` dodat) | U toku (faza 04 emulator testovi) | **NE** (klik na Google prijavu na živom `github.io` još nije izvršen) |
| **Cloudflare Worker** | Da (`wrangler`) | Da (`mls.ivanovic@gmail.com`) | Da (`matchahead-push-probe`) | Da (`workerd` testovi, 22/22) | Delimično (worker postavljen, slanje ugašeno) |
| **FCM Push na telefonu** | N/A | N/A | U probnom obliku | Da (lokalni FID test) | **NE (NOT_TESTED)** — fizički Android/iPhone nisu primili sistemsko obaveštenje na zatvorenoj PWA |
| **Sportski podaci** | N/A | N/A | Sintetički ugovor | Da (`check-data-contracts.mjs`, 20/20) | **BLOCKED** — nema besplatnog izvora sa licencom i punom pokrivenošću |

---

## 6. Stanje sportskih izvora i blokada

- **Superliga i Kup Srbije:** FSS nema javni mašinski API. Rasporedi se objavljuju kao HTML sa nepreciznim satnicama (00:00). Fixtur.es pruža ICS, ali uslovi korišćenja zabranjuju ponovnu objavu ili preprodaju u tuđim aplikacijama.
- **Evropska takmičenja (Liga konferencije / Liga šampiona):** UEFA pruža samo korisnički „Add to calendar” link, bez API licence za treća lica.
- **Košarka (ABA, Evroliga, KLS):** ABA i Evroliga imaju objavljene termine na sajtovima, ali bez zvaničnog besplatnog API-ja sa pravom distribucije. TheSportsDB besplatni nalog daje najviše 15 utakmica i seče sezonu. API-Sports uslovi zabranjuju javnu redistribuciju na besplatnom nalogu.
- **Akcioni zaključak za sportski raspored:**
  1. Za potrebe razvoja faza 04, 06 i 07 koristi se sintetički DEMO raspored definisan u `data/synthetic/` i `public/data/demo-schedule.json`.
  2. Za buduću fazu 05, ukoliko korisnik ne obezbedi komercijalni API ključ ili direktan pisani ugovor, rešenje je:
     - Ponuditi direktne linkove ka oficijelnim klupskim pretplatama gde postoje.
     - Omogućiti korisniku ručni uvoz / izbor utakmica.
     - Prikazati status `BLOCKED / UNKNOWN` uz svako takmičenje bez potvrđenog otvorenog izvora.

---

## 7. Preostali koraci za potpuno živo testiranje

1. **Faza 04 (Grok):** Završetak Auth i Firestore pravila u emulatoru, priprema modela korisnika.
2. **Raspoređivanje Firestore pravila:** Nakon pregleda Grokovih pravila, izvršiti `firebase deploy --only firestore:rules --project matchahead`.
3. **Živa provera Google prijave:** Otvoriti `https://mlsivanovic.github.io/matchahead/#/podesavanja` na računaru i telefonu i testirati prijavu Google nalogom.
4. **Verifikacija na fizičkom telefonu (Android / iPhone):**
   - Instalirati PWA sa `https://mlsivanovic.github.io/matchahead/` na početni ekran.
   - Proveriti rad offline režima.
   - Za push notifikacije: kada faza 09 bude spremna, proveriti prijem sistemske notifikacije kada je aplikacija potpuno zatvorena.
