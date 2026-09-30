# Revizija spremnosti i bezbednosti push infrastrukture (Push Readiness & Security Review)

Datum revizije: 30. septembar 2026.  
Status spremnosti faze 02: **DELIMIČNO SPREMNO (Infrastruktura raspoređena, kod verifikovan, slanje zaštićeno/onemogućeno, živa isporuka na uređaju `NOT_TESTED`)**  
Autori / uloge: Gemini CLI (revizor bezbednosti i koda push infrastrukture), orkestrirano u okviru Orca zadatka `task_9e6968cb1a4a` / run `run_b1cd86cb71c5`.

---

## Sažetak nalaza i ispravka stanja projekta

Prethodna dokumentacija je sadržala zastarele pretpostavke da nalozi i resursi za push ne postoje. Ova revizija potvrđuje činjenično stanje na sistemu:

1. **Cloudflare Worker je već raspoređen na produkciji:** Worker `matchahead-push-probe` (verzija `2ee78270-c9d8-4374-ba09-623d590ec448`, uploadovana 27. septembra 2026) je aktivan i javan na adresi:
   `https://matchahead-push-probe.mls-ivanovic.workers.dev`
2. **Javna PWA i VAPID konfiguracija je već ugrađena na produkciji:** Na pomenutoj adresi endpoint `https://matchahead-push-probe.mls-ivanovic.workers.dev/config.json` servira važeću konfiguraciju za Firebase web aplikaciju `MatchAhead` (`appId: 1:298957530037:web:e60964d052cc34662d6ffc`) sa javnim VAPID ključem (`BIXoXs...`). U lokalnom repozitorijumu fajl `experiments/push-probe/pwa/config.json` je namerno prazan templejt kako se javni ključevi ne bi nekontrolisano menjali kroz git commit-e.
3. **Zaštitna kapija slanja je podrazumevano isključena:** Živi endpoint `/api/probe/status` vraća `HTTP 200` sa telom:
   ```json
   {"enabled":false,"fcmConfigured":true,"sdk":"firebase@12.19.0","identifier":"fid","delivery":"NOT_TESTED","synthetic":true,"store":"durable-object","storeBound":true}
   ```
   Slanje i registracija su blokirani na Cloudflare nivou jer tajna `PROBE_SEND_ENABLED` nije postavljena na `1`, a tajna `PROBE_ENROLL_SECRET` nije uneta u Cloudflare Secret Store.
4. **FCM HTTP v1 i FID semantika su usklađeni sa zvaničnim Google standardima:** Kod u `experiments/push-probe` koristi najnoviji Firebase 12.19.0 API (`register` / `onRegistered` i `message.fid`), a u potpunosti izbegava zastareli `getToken()` / `message.token`.
5. **Testovi i merenja prolaze lokalno:** Svih 22 testa u `experiments/push-probe` prolaze (`pass 22, fail 0`), esbuild kompajlira klijentske skripte bez greške, a lokalni `measure-cpu.mjs` potvrđuje da WebCrypto RSA PKCS8 potpis troši svega 1–2 ms (daleko ispod limita od 10 ms za besplatni Cloudflare plan).
6. **Stvarna isporuka na fizičkim telefonima ostaje `NOT_TESTED`:** Dozvola za notifikacije i prijem sistemske poruke na zatvorenoj PWA na fizičkim uređajima (Android i iPhone/iOS 16.4+) nisu izvršeni tokom ove revizije u skladu sa bezbednosnim mandatom.

---

## 1. Verifikacija FCM API-ja i SDK semantike

Pregledano i verifikovano u odnosu na zvaničnu Google dokumentaciju i izvorni kod instaliranog paketa `firebase@12.19.0` (`@firebase/messaging@0.13.3` i `@firebase/installations@0.6.14`):

### 1.1. Prelazak sa `token` na `fid` (Firebase Installation ID)
- **Zvanična referenca:** [Firebase Cloud Messaging REST API: projects.messages](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
- **Zvanični vodič za web klijent:** [Set up a JavaScript Firebase Cloud Messaging client app](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- **JavaScript SDK referenca:** [Firebase Messaging Web SDK Reference](https://firebase.google.com/docs/reference/js/messaging.md)

| Funkcionalnost | Zastareli pristup (Legacy) | Moderni FCM HTTP v1 pristup (MatchAhead implementacija) |
|---|---|---|
| **Klijentski poziv za registraciju** | `getToken(messaging, options)` *(označeno kao deprecated)* | `register(messaging, options)` u kombinaciji sa `onRegistered(messaging, callback)` |
| **Klijentski poziv za odjavu** | `deleteToken(messaging)` *(označeno kao deprecated)* | `unregister(messaging)` u kombinaciji sa `onUnregistered(messaging, callback)` |
| **Identifikator uređaja** | FCM Registration Token (dugačak string sa `:` ili preko 80 karaktera) | Firebase Installation ID (FID) — tačno 22 karaktera |
| **Format identifikatora (FID)** | N/A | Regex: `^[cdef][\w-]{21}$` (izvor: `generate-fid.ts` u `@firebase/installations`) |
| **Cilj u HTTP v1 REST pozivu** | `message.token` *(označeno kao deprecated)* | `message.fid` (preporučeni parametar) |
| **Međusobna isključivost** | `token`, `topic`, `condition` | Polja `fid`, `token`, `topic` i `condition` su striktno međusobno isključiva. U `src/message.ts` se proverava da poruka sadrži samo `fid`. |

### 1.2. Klijentski i serverski ugovor
- U klijentskoj skripti `experiments/push-probe/src/client-entry.ts`:
  Poziva se `register(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration })`, a FID se dohvata isključivo kroz pretplaćeni slušalac `onRegistered(messaging, (fid) => ...)`.
  Skripta `scripts/check-push-probe.mjs` proverava da se reči `getToken` i `deleteToken` ne pojavljuju u klijentskom kodu.
- U serverskom slanju `experiments/push-probe/src/message.ts`:
  Metoda `syntheticFcmMessage` kreira telo:
  ```json
  {
    "message": {
      "fid": "<22-znaka-fid>",
      "notification": {
        "title": "MatchAhead proba",
        "body": "Sintetička poruka. Ovo nije utakmica."
      },
      "data": {
        "kind": "synthetic-probe",
        "probeMessageId": "synthetic-...",
        "clickPath": "/poruka.html?probe=synthetic&id=synthetic-..."
      },
      "webpush": {
        "headers": {
          "Urgency": "high",
          "TTL": "300"
        },
        "notification": {
          "icon": "/icons/icon-192.png"
        },
        "fcm_options": {
          "link": "https://.../poruka.html?probe=synthetic&id=synthetic-..."
        }
      }
    }
  }
  ```
  Slanje se vrši na:
  `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`
  uz Google OAuth2 Bearer token dobijen WebCrypto RS256 potpisivanjem servisnog naloga.

---

## 2. Rezultati izvršenih lokalnih testova i merenja

Izvršene komande u okviru revizije (30. septembar 2026):

### 2.1. Testiranje push-probe paketa (`check-push-probe.mjs`)
Komanda:
```bash
$ node scripts/check-push-probe.mjs
```
Rezultati:
- **Test runner:** `node --experimental-strip-types --test test/*.test.ts`
- **Ukupno testova:** 22
- **Uspešnih (pass):** 22
- **Neuspešnih (fail):** 0
- **Preskočenih (skipped):** 0
- **Trajanje testova:** 282.4 ms
- **Stavke verifikovane u testovima:**
  1. Isključen probe ne dozvoljava slanje (`status` ostaje vidljiv, `send` vraća 404 `probe_disabled`).
  2. Slanje ide samo vlasniku registracije (self-send provera `registrationSecret`), a FCM telo nema tuđi sadržaj.
  3. Ograničenje učestanosti: četvrto slanje u istom satu je odbijeno (429 `rate_limited`).
  4. Odsustvo servisnog ključa ne izaziva lažan uspeh (greška 500 `fcm_unconfigured`).
  5. Nevažeći FID (npr. Google FCM vrati 404 `UNREGISTERED`) automatski gasi registraciju u bazi/Durable Object-u.
  6. Toplo zakazivanje koristi keširani OAuth token i ne potpisuje ponovo PKCS8 ključ; osvežavanje odvaja mrežni poziv od potpisa.
  7. KV keš preskače potpis, dok je živi Firestore odvojen.
  8. Dozvola za notifikacije se traži isključivo na eksplicitan korisnički gest (klik).
  9. Klik otvara samo interni `poruka.html` uz verifikaciju UUID formata; taster za brisanje sklanja obaveštenje.
  10. Zabrana curenja tajni u klijentske logove i statičke izvore.
  11. Parsiranje sintetičkog Firestore formata je lokalno i iznosi 0 ms.
  12. Klijentski kod ne sadrži reference na zastareli token API.
- **Build klijentskih skripti:** `node scripts/build-client.mjs` generiše `pwa/app.js` (81.6 KB bundle sa Firebase messaging-om) i `pwa/firebase-messaging-sw.js` (80.1 KB bundle) bez grešaka.

### 2.2. Merenje lokalne CPU potrošnje (`measure-cpu.mjs`)
Komanda:
```bash
$ cd experiments/push-probe && npm run measure
```
Rezultati (izvršeno na lokalnom `workerd` preko Miniflare `5.20260926.0-alpha` i `workerd 1.20260926.1`):
```json
{
  "runtime": "workerd-local-via-miniflare",
  "edgeCpu": "NOT_TESTED",
  "freeCpuLimitMs": 10,
  "timerAdvancesDuringCpu": true,
  "timerDeltaMs": 2,
  "coldSignMs": {
    "samples": 5,
    "min": 1,
    "median": 2,
    "max": 2
  },
  "warmSignMs": {
    "samples": 5,
    "min": 0,
    "median": 0,
    "max": 0
  },
  "refreshSignMs": {
    "samples": 3,
    "min": 1,
    "median": 1,
    "max": 1
  },
  "refreshExchangeMs": {
    "samples": 3,
    "min": 40,
    "median": 40,
    "max": 41
  },
  "firestoreParseMs": 0,
  "firestoreLive": "NOT_TESTED",
  "bundleBytes": 27034,
  "coldSignFitsTenMs": true,
  "refreshSignFitsTenMs": true
}
```
- **Veličina workers snopa:** 27 034 bajta (~26.4 KB, gzip ~7.56 KB).
- **Hladan potpis (PKCS8 import + WebCrypto RS256):** Medijana 2 ms (ispod 10 ms limita besplatnog plana).
- **Topao potpis:** 0 ms (keširan pristupni token u memoriji).
- **Mrežno čekanje na razmenu tokena:** ~40 ms (mrežni I/O koji ne opterećuje CPU budžet radnika).
- **Edge CPU (Workers Logs):** `NOT_TESTED` (stvarna CPU potrošnja na Cloudflare edge serverima se mora potvrditi iz live logova).

---

## 3. Sigurnosna i arhitektonska revizija koda

| Oblast revizije | Implementacija i mehanizam zaštite | Nalaz / Status |
|---|---|---|
| **Registracija i Enrollment** | Zahteva zaglavlje `x-matchahead-enroll: <PROBE_ENROLL_SECRET>`. Provera se vrši korišćenjem `timingSafeEqualSecret` (SHA-256 heširanje i konstantno poređenje bajtova protiv timing napada). | **ODLIČNO** — neovlašćeni klijenti ne mogu kreirati probne registracije. |
| **Self-Send autorizacija** | `POST /api/probe/send` prima `registrationId` i `registrationSecret`. Slanje je vezano isključivo za FID koji pripada toj registraciji. Klijent ne može navesti tuđi FID, ne može navesti tekst poruke niti ciljni URL. | **ODLIČNO** — potpuno onemogućeno korišćenje workera kao otvorenog push releja (open proxy). |
| **Disabled-default kapija** | Funkcija `probeEnabled(env)` proverava da li je `PROBE_SEND_ENABLED === '1'`. Ako nije, i registracija i slanje vraćaju 404 `probe_disabled`. | **ODLIČNO** — na produkciji je slanje trenutno onemogućeno (`enabled: false`). |
| **Istek i Rate Limiting** | Implementirano u `src/limits.ts`: dozvoljeno je maksimalno 3 slanja po registraciji (`MAX_PROBE_SENDS_PER_REGISTRATION = 3`) i najviše 3 slanja po satu. Četvrti zahtev vraća HTTP 429 `rate_limited`. | **ODLIČNO** — sprečava iscrpljivanje Google i Cloudflare kvota. |
| **Opozvane registracije** | Klijent može pozvati `/api/probe/unregister` koji postavlja `revokedAtMs`. Ako FCM API javi 404 `UNREGISTERED` (obrisana aplikacija na telefonu), worker registraciju automatski gasi u bazi. | **ODLIČNO** — eliminiše nepotrebne podzahteve ka neaktivnim uređajima. |
| **Bezbedan klik na notifikaciju** | Link u poruci je striktno ograničen na `/poruka.html?probe=synthetic&id=synthetic-<uuid>`. U `poruka.js` se koristi `textContent` (nema `innerHTML`), a URL parametri se strogo validiraju regexom. | **ODLIČNO** — eliminiše rizik od Cross-Site Scripting (XSS) i Open Redirect ranjivosti. |
| **Rukovanje tajnama i ključevima** | Tajne `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` i `FIREBASE_PROJECT_ID` su tipa `secret_text` na Cloudflare-u. Repozitorijum ne sadrži privatne ključeve (`.gitignore` štiti `.env`, `.dev.vars`, itd.). | **ODLIČNO** — servisni nalog koristi least-privilege ulogu `roles/firebasecloudmessaging.admin`. |
| **CPU i Batch ograničenja** | Free nivo ima 10 ms CPU po HTTP pozivu. Proba šalje poruke pojedinačno (1 subrequest po slanju, plus 1 za povremenu razmenu tokena), što je daleko ispod limita od 50 podzahteva. | **VERIFIKOVANO LOKALNO** (Edge ostaje `NOT_TESTED`). |

---

## 4. Status raspoređivanja i spremnost konfiguracije (Cloud State)

Nalazi utvrđeni bezbednim inspekcijama komandama `gcloud`, `firebase`, `npx wrangler` i `curl`:

### 4.1. Cloudflare Workers
- **Javni URL workera:**  
  `https://matchahead-push-probe.mls-ivanovic.workers.dev`
- **Javni status probe:**  
  `GET https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/status` -> `HTTP/2 200 OK`
  ```json
  {
    "enabled": false,
    "fcmConfigured": true,
    "sdk": "firebase@12.19.0",
    "identifier": "fid",
    "delivery": "NOT_TESTED",
    "synthetic": true,
    "store": "durable-object",
    "storeBound": true
  }
  ```
- **Stanje tajni na Cloudflare-u (`npx wrangler secret list --name matchahead-push-probe`):**
  - `FCM_CLIENT_EMAIL`: **Prisutno** (`secret_text`)
  - `FCM_PRIVATE_KEY`: **Prisutno** (`secret_text`)
  - `FIREBASE_PROJECT_ID`: **Prisutno** (`secret_text`)
  - `PROBE_ENROLL_SECRET`: **Nedostaje** (nije definisano u Cloudflare Secrets)
  - `PROBE_SEND_ENABLED`: **Nedostaje / Nije postavljeno na 1** (podrazumevano onemogućeno)
- **Stanje javne PWA konfiguracije na Worker-u:**  
  `GET https://matchahead-push-probe.mls-ivanovic.workers.dev/config.json` -> `HTTP/2 200 OK`
  - `apiKey`: `AIzaSyA7yBiKl1Cngb_MIUEIWwpj-gQ3dZUtv-g`
  - `authDomain`: `matchahead.firebaseapp.com`
  - `projectId`: `matchahead`
  - `messagingSenderId`: `298957530037`
  - `appId`: `1:298957530037:web:e60964d052cc34662d6ffc`
  - `vapidKey`: `BIXoXsMLvzfyDPgtoqB_9E3ECgtafBAuLkvx5IVb5YpaIIy2fIrUbGifd2qaYuP2vFQhm4VlkKYgoAAdYzreBLk`

### 4.2. Google Cloud i Firebase
- **Projekat:** `matchahead` (Project Number `298957530037`).
- **Plan:** Spark (besplatni nivo, Firestore koristi `freeTier: true` u višenamenskoj regiji `eur3`). Status naplate samog krovnog Google naloga nije eksplicitno proveravan.
- **Aktivni FCM API servisi:**
  - `fcm.googleapis.com` (Firebase Cloud Messaging API) — **Omogućen**
  - `fcmregistrations.googleapis.com` (FCM Registration API) — **Omogućen**
- **Servisni nalog:** `matchahead-fcm-sender@matchahead.iam.gserviceaccount.com`
  - Status: Aktivan (`DISABLED: False`)
  - Uloga (IAM Role): `roles/firebasecloudmessaging.admin` (restriktivna, namensko pravo samo za FCM)
  - Ključ: Servisni ključ je kreiran 27. septembra 2026. i postavljen kao tajna na Cloudflare-u.

---

## 5. Da li se FCM može testirati i tačni preostali blokeri

### Može li se FCM isporuka testirati u ovom trenutku?
**NE.** Sistem je bezbedno zaključan i spreman za kontrolisano testiranje, ali slanje poruka i registracija su blokirani na Cloudflare nivou.

### Tačni preostali blokeri do verifikacije `PASS`:

1. **Bloker 1 (Nedostaje tajna za registraciju):** Tajna `PROBE_ENROLL_SECRET` nije uneta u Cloudflare Secrets store. Korisnik u interfejsu probe mora uneti istu lozinku koja je konfigurisana na serveru.
2. **Bloker 2 (Kapija slanja je zatvorena):** Promenljiva/tajna `PROBE_SEND_ENABLED` nije postavljena na `1`. Bez ovoga, server odbija sve zahteve sa `404 probe_disabled`.
3. **Bloker 3 (Fizički mobilni uređaji nisu testirani — `NOT_TESTED`):**
   - **Android:** PWA mora biti otvorena u Chrome-u, zatražena dozvola, aplikacija poslata u pozadinu ili potpuno zatvorena (swipe away), pa potvrđen prijem sistemskog obaveštenja.
   - **iPhone / iPad (iOS 16.4+):** Web Push na Apple uređajima radi **isključivo** kada se sajt doda na početni ekran („Add to Home Screen”) kao instalirana PWA i pokrene kao standalone prozor pre traženja dozvole.
4. **Bloker 4 (Edge `cpuTime` nije očitan):** Tokom live poziva potrebno je kroz `npx wrangler tail` očitati stvarni `cpuTime` kako bi se potvrdilo da hladan start i WebCrypto potpis na Cloudflare edge infrastrukturi ne probijaju granicu od 10 ms.
5. **Bloker 5 (Lokalni `config.json` u repozitorijumu):** Za lokalno testiranje preko `npm run serve`, operater mora kopirati javne vrednosti iz sekcije 4.1 u `experiments/push-probe/pwa/config.json`.

---

## 6. Akcioni plan verifikacije (Actionable Proof Plan)

Kada koordinator i korisnik odobre izvođenje fizičke probe, sledeći koraci vode do prevođenja statusa iz `NOT_TESTED` u `PASS` ili `FAIL`:

```text
               +-------------------------------------------+
               |  1. Postavljanje Cloudflare tajni         |
               |     npx wrangler secret put PROBE_ENROLL  |
               |     npx wrangler secret put PROBE_SEND    |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |  2. Provera živog statusa                 |
               |     GET /api/probe/status -> enabled:true |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |  3. Pokretanje praćenja logova            |
               |     npx wrangler tail matchahead-push-... |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |  4. Registracija na telefonu              |
               |     Unos tajne probe -> Dozvola -> FID    |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |  5. Zatvaranje PWA aplikacije na telefonu |
               |     (Swipe away iz task managera)         |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |  6. Slanje probne notifikacije            |
               |     (FCM HTTP v1 šalje ka FID-u)          |
               +---------------------+---------------------+
                                     |
                     +---------------+---------------+
                     |                               |
                     v                               v
         [Notifikacija stigla]             [Nije stigla / Greška]
                     |                               |
                     v                               v
       +---------------------------+   +---------------------------+
       | Provera klika -> URL      |   | Provera FCM greške u logu |
       | Provera cpuTime u logu    |   | Analiza uzroka            |
       | STATUS: PASS              |   | STATUS: FAIL              |
       +-------------+-------------+   +-------------+-------------+
                     |                               |
                     +---------------+---------------+
                                     |
                                     v
               +-------------------------------------------+
               |  7. Bezbedno gašenje kapije               |
               |     PROBE_SEND_ENABLED=0                  |
               +-------------------------------------------+
```

### Korak po korak instrukcije za operatera:

1. **Aktivacija kapije i tajne na Cloudflare-u:**
   ```bash
   $ npx wrangler secret put PROBE_ENROLL_SECRET --name matchahead-push-probe
   # Uneti odabranu privremenu lozinku (npr. proba-2026)

   $ npx wrangler secret put PROBE_SEND_ENABLED --name matchahead-push-probe
   # Uneti vrednost: 1
   ```
2. **Provera statusa radnika:**
   ```bash
   $ curl -s https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/status
   # Očekivani odgovor: {"enabled":true,"fcmConfigured":true,...}
   ```
3. **Pokretanje Workers tail sesije u posebnom terminalu:**
   ```bash
   $ npx wrangler tail matchahead-push-probe --format pretty
   ```
4. **Test na Android telefonu:**
   - Otvoriti Chrome i posetiti `https://matchahead-push-probe.mls-ivanovic.workers.dev/`.
   - U polje "Ključ probe" uneti privremenu lozinku.
   - Kliknuti na taster "Uključi probu". Kada browser zatraži dozvolu za obaveštenja, odabrati "Dozvoli" (Allow).
   - Sačekati poruku: "Uređaj je registrovan za probu".
   - Kliknuti na taster "Pošalji probnu poruku sebi".
   - Odmah prevući prstom i potpuno zatvoriti Chrome i PWA prozor.
   - **Kriterijum uspeha:** U roku od nekoliko sekundi na zaključanom ekranu ili u sistemskoj traci Androida pojavljuje se sistemska notifikacija "MatchAhead proba" sa tekstom "Sintetička poruka. Ovo nije utakmica.".
   - Kliknuti na obaveštenje: Mora se otvoriti stranica `/poruka.html?probe=synthetic&id=...` sa detaljima poruke.
5. **Test na iPhone uređaju (iOS 16.4+):**
   - Otvoriti Safari i posetiti `https://matchahead-push-probe.mls-ivanovic.workers.dev/`.
   - Pritisnuti dugme Share (Deli) i odabrati "Add to Home Screen" (Dodaj na početni ekran).
   - Izaći iz Safarija i pokrenuti aplikaciju MatchAhead sa početnog ekrana.
   - Ponoviti proceduru unosa ključa, davanja dozvole, zatvaranja aplikacije i prijema notifikacije.
6. **Očitavanje CPU vremena iz tail loga:**
   - Proveriti polje `cpuTime` u zabeleženim Workers Log zapisima za `POST /api/probe/send`.
   - Potvrditi da je `cpuTime <= 10 ms`.
7. **Vraćanje u sigurno stanje (Deaktivacija kapije):**
   ```bash
   $ npx wrangler secret put PROBE_SEND_ENABLED --name matchahead-push-probe
   # Uneti vrednost: 0
   ```

---

## 7. Predloženi opsežni sledeći koraci (Scoped Followups)

1. **Paralelni rad (Faza 04):** Rad na fazi 04 (Google Auth i Firestore bezbednosna pravila) može nesmetano da teče. Push-probe je potpuno izolovan na namenskom Cloudflare origin-u i ne ometa rad na `apps/web` i GitHub Pages.
2. **Buduća integracija (Faza 09 — Push na uređaju):**
   Kada dođe vreme za uvođenje push funkcionalnosti u glavni klijent (`apps/web`), rešenje iz `experiments/push-probe` poslužiće kao direktna osnova:
   - Zadržati `firebase/messaging` sa `register` / `onRegistered` pozivima.
   - U bazi korisnika čuvati isključivo `fid` polje.
   - Za potrebe slanja na GitHub Pages produkciji voditi računa o `PUBLIC_BASE_URL` parametru kako bi link notifikacije gađao `/matchahead/` poddirektorijum na GitHub Pages, a ne korenski domen.
