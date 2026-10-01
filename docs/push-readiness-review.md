# Revizija spremnosti i bezbednosti push infrastrukture (Push Readiness & Security Review)

Datum revizije: 30. septembar 2026.  
Status spremnosti faze 02: **BLOCKED (praćeni kod usklađen sa DO, kapije ugašene, fizička isporuka na zatvorenoj PWA i edge `cpuTime` ostaju `NOT_TESTED`)**  
Autori / uloge: Gemini CLI (revizor bezbednosti i koda push infrastrukture), orkestrirano u okviru Orca zadatka `task_9e6968cb1a4a` / run `run_b1cd86cb71c5`.

> **Dopuna dokumentacije (30. septembar 2026, doc patch nad `d582885`):** istorijski nalazi ove revizije čuvaju se kao istorija. Raskorak „deployed DO vs. repo in-memory” iz odeljka 2 je **istorijski nalaz pre commita `6af69c1`** — praćeni kod je od `6af69c1` usklađen sa Durable Object skladištem (`PROBE_DIRECTORY` / `ProbeDirectoryObject` / tag `v1-probe-directory`), lokalno provereno sa **27/27 testova (23 funkcionalna + 4 workerd)** prema `docs/handoffs/02-push-reconciliation.md` i `docs/reviews/02-push-reconciliation.md`. Repo `6af69c1` je **rekonstrukcija ponašanja + 3 namerne bezbednosne razlike, nije bajt-identičan snopu i nije deployovan** — na produkciji i dalje radi verzija `2ee78270-c9d8-4374-ba09-623d590ec448` od 27. septembra 2026. Konzistentnost namespace-a/šeme/migracije je statička (konfiguracija + `CREATE TABLE IF NOT EXISTS`); **živa migracija i očuvanje stvarnih redova su `NOT_TESTED`**. Akcioni primeri u odeljku 7 ispravljeni su na važeći ugovor: `POST /api/registrations` (`x-matchahead-enroll` + `fid`) → 201 `{registrationId, selfSendKey}`; `POST /api/probe/send` prima **samo** `registrationId` uz `Authorization: Bearer <selfSendKey>`; odjava je `DELETE /api/registrations/<id>` uz isti Bearer; `/api/probe/unregister` ne postoji; UI **ne ispisuje** ID/tajnu — 201 se prepisuje iz browser Network zapisa. Stari primeri sa `registrationSecret` u telu ne važe ni za živi snop ni za ovaj kod.

---

## Sažetak nalaza i ispravka stanja projekta

Prethodna dokumentacija je sadržala zastarele pretpostavke da nalozi i resursi za push ne postoje. Ova revizija potvrđuje činjenično stanje na sistemu, ali identifikuje i **kritičan raskorak između raspoređenog koda i koda u repozitorijumu**:

1. **Cloudflare Worker je već raspoređen na produkciji:** Worker `matchahead-push-probe` (verzija `2ee78270-c9d8-4374-ba09-623d590ec448`, uploadovana 27. septembra 2026) je aktivan i javan na adresi:
   `https://matchahead-push-probe.mls-ivanovic.workers.dev`
2. **Kritičan raskorak koda (Deployed Durable Object vs. Repo In-Memory):**
   - Živi radnik na adresi `GET /api/probe/status` vraća:
     ```json
     {"enabled":false,"fcmConfigured":true,"sdk":"firebase@12.19.0","identifier":"fid","delivery":"NOT_TESTED","synthetic":true,"store":"durable-object","storeBound":true}
     ```
   - Pregledom metapodataka raspoređene verzije (`npx wrangler versions view 2ee78270... --json`), potvrđeno je da raspoređeni radnik koristi binding `PROBE_DIRECTORY` tipa `durable_object_namespace` i klasu `ProbeDirectoryObject` (migracioni tag `v1-probe-directory`).
   - Međutim, u praćenom repozitorijumu (`experiments/push-probe/wrangler.jsonc` i `src/`), Durable Object binding uopšte ne postoji, a `src/app.ts` koristi lokalnu `Map<string, StoredRegistration>` u memoriji.
   - **Upozorenje koordinatoru:** Svih 22 lokalna testa izvršavaju se nad *in-memory* verzijom i ne mogu garantovati ispravnost raspoređenog Durable Object snopa. Svako neoprezno ponovno postavljanje (`wrangler deploy`) iz trenutnog repozitorijuma pregazilo bi produkcioni Durable Object radnik starijom in-memory verzijom.
3. **Javna PWA i VAPID konfiguracija je već ugrađena na produkciji:** Na pomenutoj adresi endpoint `https://matchahead-push-probe.mls-ivanovic.workers.dev/config.json` servira važeću konfiguraciju za Firebase web aplikaciju `MatchAhead` (`appId: 1:298957530037:web:e60964d052cc34662d6ffc`) sa javnim VAPID ključem (`BIXoXs...`). U lokalnom repozitorijumu fajl `experiments/push-probe/pwa/config.json` je namerno prazan templejt kako se javni ključevi ne bi nekontrolisano menjali kroz git commit-e.
4. **Zaštitna kapija slanja je podrazumevano isključena:** Slanje i registracija su blokirani na Cloudflare nivou jer tajna `PROBE_SEND_ENABLED` nije postavljena na `1`, a tajna `PROBE_ENROLL_SECRET` nije uneta u Cloudflare Secret Store.
5. **FCM HTTP v1 i FID semantika su usklađeni sa zvaničnim Google standardima:** Kod koristi moderni Firebase 12.19.0 API (`register` / `onRegistered` i `message.fid`), a u potpunosti izbegava zastareli `getToken()` / `message.token`.
6. **Stvarna isporuka na fizičkim telefonima ostaje `NOT_TESTED`:** Dozvola za notifikacije i prijem sistemske poruke na zatvorenoj PWA nisu izvršeni ni na jednom fizičkom uređaju tokom ove revizije u skladu sa bezbednosnim mandatom. Android uređaj je dostupan po korisniku; iPhone nije potvrđen.

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

## 2. Raskorak raspoređenog koda i koda u repozitorijumu (Deployed vs. Tracked Drift) — ISTORIJSKI NALAZ pre `6af69c1`

> **Status ovog odeljka nakon `6af69c1`:** tekst ispod čuva se kao istorijski zapis stanja pre usklađivanja. Praćeni kod od commita `6af69c1` („Restore the push probe Durable Object registration store”) sadrži `PROBE_DIRECTORY` binding, klasu `ProbeDirectoryObject`, migraciju `v1-probe-directory` i polja `store`/`storeBound` u statusu — ista statička konfiguracija kao raspoređena verzija `2ee78270...`. Nezavisni pregled (`docs/reviews/02-push-reconciliation.md`, `ea0a993` + `8d9a048`) ponovio je matricu: **27/27 prolaza (23 funkcionalna + 4 nativna workerd Miniflare testa)**. Repo ostaje rekonstrukcija sa 3 zabeležene namerne razlike (redjanje DO zahteva, prag `enroll_weak` 32 znaka/16 različitih, 400 `invalid_body`), **bez tvrdnje bajt-pariteta i bez deploya**. Živa migracija produkcionih redova i očuvanje stvarnih zapisa nisu izvršeni i ostaju `NOT_TESTED`. Zabrana slepog deploya i dalje važi: svaki budući deploy mora ponovo upotrebiti tag `v1-probe-directory` i postojeći namespace `a6557e79488a4c648b9f198a9d8b986a`, bez novog namespace-a.

Tokom revizije uočena je suštinska razlika između stanja na Cloudflare produkciji i lokalnog repozitorijuma (stanje pre `6af69c1`):

### 2.1. Dokaz iz Cloudflare inspekcije
Komanda `npx wrangler versions view 2ee78270-c9d8-4374-ba09-623d590ec448 --name matchahead-push-probe --json` daje:
```json
{
  "named_handlers": [
    {
      "name": "ProbeDirectoryObject",
      "handlers": [ "class" ]
    }
  ],
  "script_runtime": {
    "migration_tag": "v1-probe-directory"
  },
  "bindings": [
    {
      "class_name": "ProbeDirectoryObject",
      "name": "PROBE_DIRECTORY",
      "namespace_id": "a6557e79488a4c648b9f198a9d8b986a",
      "type": "durable_object_namespace"
    }
  ]
}
```
A poziv `curl -s https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/status` potvrđuje:
`"store": "durable-object", "storeBound": true`.

### 2.2. Stanje u praćenom repozitorijumu
- `experiments/push-probe/wrangler.jsonc` sadrži samo `ASSETS` binding, bez Durable Object konfiguracije.
- `experiments/push-probe/src/worker.ts` ne eksportuje klasu `ProbeDirectoryObject`.
- `experiments/push-probe/src/app.ts` sadrži samo lokalnu promenljivu `inMemoryRegistrations = new Map<string, StoredRegistration>()`.
- Tracked `/api/probe/status` kod uopšte ne generiše polja `store` i `storeBound`.

### 2.3. Ozbiljnost i preporuke (Severity: HIGH)
1. **Lokalni testovi ne sertifikuju produkciju:** Svih 22 testa u `test/app.test.ts` i `test/contract.test.ts` testiraju ponašanje in-memory mape. Oni ne testiraju skladištenje niti perzistenciju `ProbeDirectoryObject` Durable Object-a koji se trenutno izvršava na Cloudflare-u.
2. **Zabrana slepog deploy-a:** Izričito se zabranjuje pokretanje `npx wrangler deploy` iz trenutnog stanja repozitorijuma, jer bi to obrisalo Durable Object binding i degradiralo produkciju na in-memory rešenje (koje gubi registracije pri svakom gašenju izolata ili preusmeravanju na drugu edge lokaciju).
3. **Akcija za koordinatora:** U posebnom scoped zadatku potrebno je uskladiti kod repozitorijuma sa raspoređenim stanjem (preneti Durable Object implementaciju u `src/` i `wrangler.jsonc`).

---

## 3. Rezultati izvršenih lokalnih testova i merenja

Izvršene komande u okviru revizije (30. septembar 2026):

### 3.1. Testiranje push-probe paketa (`check-push-probe.mjs`)
Komanda:
```bash
$ node scripts/check-push-probe.mjs
```
Rezultati (istorijski niz nad in-memory modelom, pre `6af69c1` — čuva se kao istorija; važeća matrica je 27/27 iz `docs/handoffs/02-push-reconciliation.md` i `docs/reviews/02-push-reconciliation.md`):
- **Test runner:** `node --experimental-strip-types --test test/*.test.ts`
- **Ukupno testova:** 22
- **Uspešnih (pass):** 22
- **Neuspešnih (fail):** 0
- **Preskočenih (skipped):** 0
- **Trajanje testova:** 282.4 ms
- **Stavke verifikovane u testovima (napomena: nad in-memory modelom):**
  1. Isključen probe ne dozvoljava slanje (`status` ostaje vidljiv, `send` vraća 404 `probe_disabled`).
  2. Slanje ide samo vlasniku registracije (self-send provera `registrationSecret`), a FCM telo nema tuđi sadržaj.
  3. Ograničenje učestanosti: četvrto slanje u istom satu je odbijeno (429 `rate_limited`).
  4. Odsustvo servisnog ključa ne izaziva lažan uspeh (greška 500 `fcm_unconfigured`).
  5. Nevažeći FID (npr. Google FCM vrati 404 `UNREGISTERED`) automatski gasi registraciju u bazi.
  6. Toplo zakazivanje koristi keširani OAuth token i ne potpisuje ponovo PKCS8 ključ; osvežavanje odvaja mrežni poziv od potpisa.
  7. KV keš preskače potpis, dok je živi Firestore odvojen.
  8. Dozvola za notifikacije se traži isključivo na eksplicitan korisnički gest (klik).
  9. Klik otvara samo interni `poruka.html` uz verifikaciju UUID formata; taster za brisanje sklanja obaveštenje.
  10. Zabrana curenja tajni u klijentske logove i statičke izvore.
  11. Parsiranje sintetičkog Firestore formata je lokalno i iznosi 0 ms.
  12. Klijentski kod ne sadrži reference na zastareli token API.
- **Build klijentskih skripti:** `node scripts/build-client.mjs` generiše `pwa/app.js` (81.6 KB) i `pwa/firebase-messaging-sw.js` (80.1 KB) bez grešaka.

### 3.2. Merenje lokalne CPU potrošnje (`measure-cpu.mjs`)
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
- **Hladan potpis (PKCS8 import + WebCrypto RS256):** Medijana 2 ms (lokalno unutar 10 ms limita).
- **Topao potpis:** 0 ms (keširan pristupni token u memoriji).
- **Mrežno čekanje na razmenu tokena:** ~40 ms (mrežni I/O koji ne opterećuje CPU budžet radnika).
- **Važno razlikovanje — Edge CPU vs Lokalni tajmer:** Lokalni `workerd` meri prolazno vreme petlje tajmerom koji otkucava i tokom CPU ciklusa. Na Cloudflare edge-u tajmer je zamrznut tokom I/O i meri se strogi `cpuTime`. Stvarni edge CPU ostaje **`NOT_TESTED`** dok se ne očita iz live Workers Logs.

---

## 4. Sigurnosna i arhitektonska revizija koda

| Oblast revizije | Implementacija i mehanizam zaštite | Nalaz / Status |
|---|---|---|
| **Registracija i Enrollment** | Zahteva zaglavlje `x-matchahead-enroll: <PROBE_ENROLL_SECRET>`. Provera se vrši u konstantnom vremenu pomoću `timingSafeEqualSecret` (SHA-256 heširanje i poređenje bajtova protiv timing napada). | **ODLIČNO** — neovlašćeni klijenti ne mogu kreirati probne registracije. |
| **Self-Send autorizacija** | `POST /api/probe/send` prima **tačno jedno polje `registrationId`** u JSON telu uz zaglavlje `Authorization: Bearer <selfSendKey>` (ključ iz 201 odgovora na `POST /api/registrations`). Svako dodatno polje (uključujući zastareli `registrationSecret`, tuđi FID, naslov ili URL) server odbija sa 400 `payload_not_allowed`. Slanje je vezano isključivo za FID koji pripada toj registraciji. | **ODLIČNO** — potpuno onemogućeno korišćenje workera kao otvorenog push releja (open proxy). |
| **Disabled-default kapija** | Funkcija `probeEnabled(env)` proverava da li je `PROBE_SEND_ENABLED === '1'`. Ako nije, i registracija i slanje vraćaju 404 `probe_disabled`. | **ODLIČNO** — na produkciji je slanje trenutno onemogućeno (`enabled: false`). |
| **Istek i Rate Limiting** | Implementirano u `src/limits.ts`: dozvoljeno je maksimalno 3 slanja po registraciji (`MAX_PROBE_SENDS_PER_REGISTRATION = 3`) i najviše 3 slanja po satu. Četvrti zahtev vraća HTTP 429 `rate_limited`. | **ODLIČNO** — sprečava iscrpljivanje Google i Cloudflare kvota. |
| **Opozvane registracije** | Odjava je `DELETE /api/registrations/<registrationId>` uz `Authorization: Bearer <selfSendKey>` (putanja `/api/probe/unregister` ne postoji). Ako FCM API javi 404 `UNREGISTERED` (obrisana aplikacija na telefonu), worker registraciju automatski gasi u bazi. | **ODLIČNO** — eliminiše nepotrebne podzahteve ka neaktivnim uređajima. |
| **Bezbedan klik na notifikaciju** | Link u poruci je striktno ograničen na `/poruka.html?probe=synthetic&id=synthetic-<uuid>`. U `poruka.js` se koristi `textContent` (nema `innerHTML`), a URL parametri se strogo validiraju regexom. | **ODLIČNO** — eliminiše rizik od Cross-Site Scripting (XSS) i Open Redirect ranjivosti. |
| **Rukovanje tajnama i ključevima** | Tajne `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` i `FIREBASE_PROJECT_ID` su tipa `secret_text` na Cloudflare-u. Repozitorijum ne sadrži privatne ključeve (`.gitignore` štiti `.env`, `.dev.vars`, itd.). | **ODLIČNO** — servisni nalog koristi least-privilege ulogu `roles/firebasecloudmessaging.admin`. |
| **CPU i Batch ograničenja** | Dokumentovana granica besplatnog nivoa je 10 ms CPU po HTTP pozivu (plan ovog naloga nije verifikovan dokazom). Proba šalje poruke pojedinačno (1 subrequest po slanju, plus 1 za povremenu razmenu tokena), što je daleko ispod dokumentovanog limita od 50 podzahteva. | **VERIFIKOVANO LOKALNO** (Edge ostaje `NOT_TESTED`). |

---

## 5. Status raspoređivanja i spremnost konfiguracije (Cloud State)

Nalazi utvrđeni bezbednim inspekcijama komandama `gcloud`, `firebase`, `npx wrangler` i `curl`:

### 5.1. Cloudflare Workers
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

### 5.2. Google Cloud i Firebase
- **Projekat:** `matchahead` (Project Number `298957530037`).
- **Firestore nivo kvote:** `freeTier: true` u višenamenskoj regiji `eur3`. Naplata projekta je read-only proverena 30. septembra 2026: `gcloud billing projects describe matchahead --format='json(billingEnabled)'` → `{"billingEnabled": false}`.
- **Aktivni FCM API servisi:**
  - `fcm.googleapis.com` (Firebase Cloud Messaging API) — **Omogućen**
  - `fcmregistrations.googleapis.com` (FCM Registration API) — **Omogućen**
- **Servisni nalog:** `matchahead-fcm-sender@matchahead.iam.gserviceaccount.com`
  - Status: Aktivan (`DISABLED: False`)
  - Uloga (IAM Role): `roles/firebasecloudmessaging.admin` (restriktivna, namensko pravo samo za FCM)
  - Ključ: Servisni ključ je kreiran 27. septembra 2026. i postavljen kao tajna na Cloudflare-u.

---

## 6. Da li se FCM može testirati i tačni preostali blokeri

### Može li se FCM isporuka testirati u ovom trenutku?
**NE.** Sistem je bezbedno zaključan i spreman za kontrolisano testiranje, ali slanje poruka i registracija su blokirani na Cloudflare nivou.

### Tačni preostali blokeri do verifikacije `PASS`:

1. **Bloker 1 (Nedostaje tajna za registraciju):** Tajna `PROBE_ENROLL_SECRET` nije uneta u Cloudflare Secrets store i ostaje nepostavljena. Kapija ostaje ugašena dok posebna pregledana sesija dokaza ne odluči drugačije.
2. **Bloker 2 (Kapija slanja je zatvorena):** Promenljiva/tajna `PROBE_SEND_ENABLED` nije postavljena na `1` i ostaje ugašena. Bez ovoga, server odbija sve zahteve sa `404 probe_disabled`.
3. **Bloker 3 (Raskorak koda radnika) — REŠEN U REPOZITORIJUMU (`6af69c1`), istorija:** produkcija (`2ee78270...`) koristi Durable Object (`ProbeDirectoryObject`), a praćeni kod je od `6af69c1` usklađen (binding + migracija + `store`/`storeBound`, 27/27 testova). Repo nije deployovan i nije bajt-identičan snopu; živa migracija redova ostaje `NOT_TESTED`.
4. **Bloker 4 (Fizički mobilni uređaji nisu testirani — `NOT_TESTED`):**
   - **Android (uređaj dostupan po korisniku, test nije izvršen):** PWA mora biti otvorena u Chrome-u, izvršena registracija, a zatim aplikacija **zatvorena pre slanja** (swipe away iz task switchera), pa potvrđen prijem sistemskog obaveštenja.
   - **iPhone / iPad (nije potvrđen, test nije izvršen):** Ako uređaj bude dostupan, Web Push na Apple uređajima (iOS 16.4+) radi samo kada se sajt doda na početni ekran („Add to Home Screen”) kao instalirana PWA i pokrene kao standalone prozor pre traženja dozvole.
5. **Bloker 5 (Edge `cpuTime` nije očitan):** Tokom live poziva potrebno je kroz `npx wrangler tail` očitati stvarni `cpuTime` kako bi se potvrdilo da hladan start i WebCrypto potpis na Cloudflare edge infrastrukturi ne probijaju dokumentovanu granicu besplatnog nivoa od 10 ms (plan naloga nije verifikovan).
6. **Bloker 6 (Lokalni `config.json` u repozitorijumu):** Za lokalno testiranje preko `npm run serve`, operater mora kopirati javne vrednosti iz sekcije 5.1 u `experiments/push-probe/pwa/config.json`.

---

## 7. Akcioni plan verifikacije (Actionable Proof Plan za zatvorenu PWA)

### Zašto je stari pristup „pošalji sebi pa zatvori” bio nevalidan?
Ako korisnik u otvorenoj aplikaciji pritisne dugme za slanje i zatim pokuša da je brzo zatvori, mrežni zahtev, prijem odgovora ili čak sam push event mogu pristići dok je instanca pregledača/PWA još uvek u memoriji ili u toku tranzicije. **To ne dokazuje isporuku na zatvorenu PWA.**

Da bi test bio metodološki validan i dokazao buđenje zatvorene aplikacije:
1. Ciljni uređaj (mobilni telefon) se registruje: `POST /api/registrations` sa zaglavljem `x-matchahead-enroll` i telom `{"fid": "<FID>"}` → 201 `{registrationId, selfSendKey}`. UI **ne ispisuje** ove vrednosti — prepisuju se jednom iz browser Network zapisa odgovora 201 (na Androidu po potrebi preko remote debugging-a), nikakve vidljive labele se ne pretpostavljaju.
2. PWA na telefonu se **ZATVORI PRE SLANJA** (swipe away **samo PWA kartice** iz menija nedavnih aplikacija / task switcher-a) pre bilo kakvog slanja. Zabranjeno: Android Force stop, gašenje browser procesa i redosled „prvo pošalji pa zatvori”.
3. Slanje se inicira sa **zasebnog autorizovanog pošiljaoca** (npr. preko `curl` sa radne stanice) navođenjem dobijenog `registrationId` u telu i `Authorization: Bearer <selfSendKey>` u zaglavlju — bez tajni u URL-u.
4. Tek kada telefon primi sistemsko obaveštenje dok je aplikacija prethodno zatvorena, isporuka se smatra dokazanom.

```text
       [ CILJNI UREĐAJ - TELEFON ]               [ ZASEBNI POŠILJALAC - RADNA STANICA ]
                   |                                               |
         1. Registracija                                           |
         (Unos PROBE_ENROLL_SECRET)                                |
                   |                                               |
         2. Network zapis 201 (ID + ključ, UI ih ne prikazuje) |
         registrationId & selfSendKey ----------------------> 3. Preuzimanje ID/ključa
                   |                                               |
         4. POTPUNO ZATVARANJE PWA                                 |
         (Swipe away SAMO PWA kartice, bez Force stop-a,           |
          bez gašenja browsera; telefon zaključan / idle)          |
                   |                                               |
                   |                                    5. Slanje preko curl-a:
                   |                                       POST /api/probe/send
                   |                                       (ka registrationId telefona)
                   |                                               |
                   |<----------------[ FCM Push ]------------------+
                   |
         6. Buđenje sistemskog obaveštenja
            na zaključanom ekranu!
                   |
         7. Klik otvara /poruka.html
            -> STATUS: PASS
```

### Korak po korak instrukcije za operatera:

1. **Generisanje upisne tajne (mora proći prag servera: bar 32 znaka i bar 16 različitih znakova, inače 503 `enroll_weak`):**
   ```bash
   # Poželjno: 32 slučajna bajta kao base64url (43 znaka) — direktno u privatnu
   # datoteku van repozitorijuma, sa pravima samo za vlasnika, BEZ ispisa tajne:
   umask 077
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' > /tmp/probe-enroll-secret.txt
   chmod 600 /tmp/probe-enroll-secret.txt
   # Opciono proveriti/ponoviti dok ne bude bar 16 različitih znakova:
   [ "$(fold -w1 /tmp/probe-enroll-secret.txt | sort -u | wc -l)" -ge 16 ] && wc -c < /tmp/probe-enroll-secret.txt
   ```
   Stari `openssl rand -hex 24` je nepouzdan (samo 16 heks znakova — u preko polovine slučajeva padne prag od 16 različitih) i ne sme se koristiti. Tajnu nikada ne ispisivati na ekran (`echo` zabranjen), ne stavljati kao literal u komandu/istoriju/URL/dokumentaciju, ne commit-ovati i ne slati chatom.
2. **Aktivacija kapije i tajne na Cloudflare-u (samo interaktivni unos ili unos iz datoteke — nikad literal u komandnoj liniji):**
   ```bash
   $ npx wrangler secret put PROBE_ENROLL_SECRET --name matchahead-push-probe
   # Interaktivno zalepiti vrednost iz /tmp/probe-enroll-secret.txt, zatim obrisati datoteku.

   $ npx wrangler secret put PROBE_SEND_ENABLED --name matchahead-push-probe
   # Uneti vrednost: 1
   ```
   Kapije ostaju ugašene dok posebna pregledana sesija dokaza ne odluči drugačije; odmah posle sesije vratiti `PROBE_SEND_ENABLED` sa vrednosti `1`.
3. **Provera statusa radnika:**
   ```bash
   $ curl -s https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/status
   # Očekivani odgovor: {"enabled":true,"fcmConfigured":true,...}
   ```
4. **Pokretanje Workers tail sesije na računaru za praćenje CPU potrošnje:**
   ```bash
   $ npx wrangler tail matchahead-push-probe --format pretty
   ```
5. **Registracija na telefonu (prvi kandidat: dostupni Android; iPhone nije potvrđen):**
   - **Android:** Otvoriti Chrome i posetiti `https://matchahead-push-probe.mls-ivanovic.workers.dev/`.
   - **iPhone (iOS 16.4+, nepotvrđen):** Safari → Add to Home Screen, pa ikonica sa početnog ekrana pre traženja dozvole.
   - U polje "Ključ probe" uneti vrednost tajne (pročitati iz datoteke sa pravima 600, bez ispisa na ekran).
   - Kliknuti na taster "Uključi probu". Browser traži dozvolu za notifikacije -> odabrati "Dozvoli" (Allow).
   - Ekran prikazuje samo potvrdu da je uređaj registrovan i **ne ispisuje `registrationId` ni `selfSendKey`**. Odgovor 201 (`{"registrationId", "selfSendKey"}`) **jednom prepisati iz browser Network zapisa** (na Androidu po potrebi preko remote debugging-a); nikakve vidljive labele se ne pretpostavljaju. Server ključ više ne zna u čistom obliku.
6. **ZATVARANJE PWA NA TELEFONU (PRE SLANJA):**
   - Izaći na početni ekran.
   - Otvoriti Task Switcher (pregled pokrenutih aplikacija) i **prevući prstom nagore (swipe away) SAMO PWA karticu** kako bi se PWA zatvorila.
   - Zabranjeno: Android Force stop („Prinudno zaustavi”), gašenje browser procesa i redosled „prvo pošalji pa zatvori” — samo redovno zatvaranje PWA pre slanja.
   - Zaključati telefon ili ga ostaviti na stolu.
7. **Slanje probne notifikacije sa zasebne radne stanice (terminala, bez tajni u URL-u):**
   ```bash
   $ curl -sS -X POST "https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/send" \
       -H "content-type: application/json" \
       -H "authorization: Bearer <selfSendKey>" \
       -d '{"registrationId":"<registrationId>"}'
   ```
   Telo nosi **samo** `registrationId`; autorizacija ide isključivo kroz `Authorization` zaglavlje.
8. **Kriterijum uspeha i verifikacija:**
   - **Prijem sistemske notifikacije:** U roku od nekoliko sekundi, na zaključanom ekranu telefona pojavljuje se sistemska notifikacija:  
     *Naslov:* `MatchAhead proba`  
     *Tekst:* `Sintetička poruka. Ovo nije utakmica.`
   - **Interaktivni klik:** Klik na obaveštenje mora probuditi pregledač i otvoriti tačnu rutu `/poruka.html?probe=synthetic&id=...`.
   - **Očitavanje CPU vremena:** U pokrenutom `wrangler tail` terminalu pronaći zapis poziva i očitati `cpuTime`. Potvrditi da je `cpuTime <= 10 ms`.
9. **Vraćanje u sigurno stanje (Deaktivacija kapije po završetku testa):**
   ```bash
   $ npx wrangler secret put PROBE_SEND_ENABLED --name matchahead-push-probe
   # Uneti vrednost: 0
   ```

---

## 8. Predloženi opsežni sledeći koraci (Scoped Followups)

1. **Usklađivanje koda radnika sa produkcijom — URAĐENO U REPOZITORIJUMU (`6af69c1`, pregled `ea0a993`+`8d9a048`, 27/27 testova):**  
   Preostalo: fizička sesija dokaza na zatvorenoj PWA (poseban zadatak), očitavanje edge `cpuTime` iz `wrangler tail`, i posebno odobren deploy ovog stabla ako dokaz treba da pokrije prag `enroll_weak` i serijalizaciju — dokaz protiv današnje produkcije (`2ee78270...`) vidi HTTP oblik vraćenog snopa, a ne nova tri bezbednosna delte.
2. **Paralelni rad (Faza 04):**  
   Rad na fazi 04 (Google Auth i Firestore bezbednosna pravila) može nesmetano da teče. Push-probe je potpuno izolovan na namenskom Cloudflare origin-u i ne ometa rad na `apps/web` i GitHub Pages.
3. **Buduća integracija (Faza 09 — Push na uređaju):**  
   Kada dođe vreme za uvođenje push funkcionalnosti u glavni klijent (`apps/web`), rešenje iz `experiments/push-probe` poslužiće kao direktna osnova:
   - Zadržati `firebase/messaging` sa `register` / `onRegistered` pozivima.
   - U bazi korisnika čuvati isključivo `fid` polje.
   - Za potrebe slanja na GitHub Pages produkciji voditi računa o `PUBLIC_BASE_URL` parametru kako bi link notifikacije gađao `/matchahead/` poddirektorijum na GitHub Pages, a ne korenski domen.
