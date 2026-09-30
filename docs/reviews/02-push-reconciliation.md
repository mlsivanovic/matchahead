# Nezavisna revizija usklađivanja push probe sa Durable Object skladištem

**Datum revizije:** 30. septembar 2026.  
**Pregledani commit:** `6af69c17487fcbd3a311d43f402f7a4a4cec8861` („Restore the push probe Durable Object registration store”)  
**Revizor / Zadatak:** Gemini CLI, `task_6cba3e57979c`, run `run_b1cd86cb71c5`  
**Opseg vlasništva:** Isključivo ovaj dokument (`docs/reviews/02-push-reconciliation.md`). Bez izmena izvornog koda, konfiguracije, implementacije ili postojećih dokumenata u ovom zadatku.  
**Konačna ocena:** **PRIHVATLJIVO (ACCEPTED)** za kod i testove usklađivanja. Sva 27 testa prolaze, uključujući 4 nativna workerd testa. Prijavljena su 3 nalaza u pratećoj dokumentaciji koje vlasnik dokumentacije / koordinator treba da koriguje.

---

## Sažetak revizije i granice testiranja

Commit `6af69c1` uspešno prevazilazi kritičan raskorak između koda u repozitorijumu i produkcionog Cloudflare Worker-a (`matchahead-push-probe.mls-ivanovic.workers.dev`). Praćeni kod u `experiments/push-probe` sada verno rekonstruiše SQLite Durable Object arhitekturu klase `ProbeDirectoryObject`, uz striktno poštovanje migracije `v1-probe-directory` i postojećeg namespace-a.

### Striktne granice revizije (Invariants & Limits):
1. **Nema pravog slanja FCM notifikacija:** Niti jedan realan poziv ka Google FCM servisima nije upućen van mock/workerd testnog okruženja.
2. **Nema čitanja niti rotacije produkcionih tajni:** Tajne u Cloudflare Secret Store (`PROBE_ENROLL_SECRET`, `FCM_PRIVATE_KEY` itd.) nisu dirane.
3. **Nema deploy-a niti Cloudflare upisa:** Živi worker nije ažuriran; produkcija i dalje izvršava prethodno uploadovani snop od 27. septembra 2026.
4. **`NOT_TESTED` status fizičkih uređaja:**
   - **Android:** Isporuka sistemske notifikacije na potpuno zatvorenu PWA ostaje `NOT_TESTED`.
   - **iPhone (iOS 16.4+):** Isporuka na standalone PWA dodatu na početni ekran ostaje `NOT_TESTED`.
5. **`NOT_TESTED` status Cloudflare Edge `cpuTime`:** Lokalni Miniflare tajmeri ne odražavaju stvarni edge `cpuTime` na Cloudflare infrastrukturi. Merenje zahteva odobrenu live sesiju uz `wrangler tail`.

---

## Rezultati verifikacionih komandi

Nakon commita `6af69c1`, nezavisno su pokrenute sve relevantne provere u repozitorijumu:

### 1. Push probe provere (`node scripts/check-push-probe.mjs`)
Komanda pokreće testove, gradi klijentske skripte i proverava odsustvo privatnih ključeva, prisustvo DO izvoza i odsustvo zastarelih token API-ja:
```text
> @matchahead/push-probe@0.0.0 check
> node --experimental-strip-types --test test/*.test.ts

✔ isključen probe ne otvara slanje, a status ostaje vidljiv (20.212029ms)
✔ slanje ide samo vlasniku registracije i FCM telo nema tuđi sadržaj (11.380814ms)
✔ četvrto slanje u istom satu je odbijeno (4.216694ms)
✔ bez serverskog ključa slanje nije označeno kao uspelo (1.250722ms)
✔ nevažeći FID na FCM-u gasi registraciju (3.058439ms)
✔ toplo zakazivanje ne potpisuje ponovo, a osvežavanje odvaja mrežu od potpisa (45.318971ms)
✔ KV keš preskače potpis, a živi Firestore ostaje neproveren (2.603953ms)
✔ kratka tajna ne otvara upis, a ista mapa preživljava novi objekat aplikacije (3.571044ms)
✔ tuđe poreklo i tajna u URL-u se odbijaju (0.60407ms)
✔ JWT je RS256, samo FCM scope, i potpis se proverava javnim ključem (6.793206ms)
✔ PEM sa esc-novim redovima se čita, a PKCS1 oblik se odbija (0.442084ms)
✔ dozvola se ne traži bez klika, posle odbijanja ni na klik (1.481023ms)
✔ iPhone van početnog ekrana ne dobija prompt (0.147905ms)
✔ nesiguran kontekst i nepodržan browser ne traže dozvolu (0.112217ms)
✔ FID se razlikuje od starog registration tokena (0.195933ms)
✔ klik vodi tačno na sintetičku putanju, i na podputanju (0.820265ms)
✔ FCM telo cilja fid i ne meša stari token (0.520195ms)
✔ registracija prima samo četiri kluba, a protivnika ne proverava po katalogu (0.635329ms)
✔ tajna se poredi i kad je pogrešna, a prazna očekivana ne prolazi (12.436134ms)
✔ ograničenje broja pokušaja staje na granici (0.496522ms)
✔ pilot broj zahteva staje u besplatni dnevni limit, a prevelik batch ne (0.447685ms)
✔ parsiranje Firestore oblika je lokalno i označeno kao sintetičko (1.239808ms)
✔ klijentski izvor ne zove stari API za token (0.461251ms)
✔ workerd čuva registraciju posle gašenja objekta i odbija tuđi ključ (270.072061ms)
✔ workerd ograničava istovremena slanja i brisanje ostaje važeće (241.508214ms)
✔ workerd gasi FID koji FCM više ne poznaje i posle gašenja objekta (205.459501ms)
✔ isključen probe i dalje javlja vezan Durable Object, a slanje ostaje zatvoreno (83.399706ms)
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1251.051871
```
**Ishod:** 27/27 testova uspešno prolazi bez grešaka. Svi bezbednosni skeneri u `check-push-probe.mjs` su potvrdili da nema curenja tajni u izgrađenom snopu i konfiguraciji.

### 2. Provere domenskih ugovora (`node scripts/check-data-contracts.mjs`)
```text
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
```
**Ishod:** Nema regresija u domenskim ugovorima.

---

## Detaljna analiza po ključnim dimenzijama

### 1. Kompatibilnost DO SQLite šeme (Recovered vs. Reconstructed)
- **Migracija i namespace:** U `experiments/push-probe/wrangler.jsonc` postavljen je tačan migracioni tag:
  ```jsonc
  "durable_objects": {
    "bindings": [{ "name": "PROBE_DIRECTORY", "class_name": "ProbeDirectoryObject" }]
  },
  "migrations": [
    { "tag": "v1-probe-directory", "new_sqlite_classes": ["ProbeDirectoryObject"] }
  ]
  ```
  Ovim se garantuje da Cloudflare pri eventualnom budućem deploy-u prepoznaje već primenjenu migraciju i ne pokušava ponovno kreiranje namespace-a `a6557e79488a4c648b9f198a9d8b986a`.
- **Definicija tabela (`src/directory.ts`):**
  Metoda `ensureDirectorySchema(sql)` koristi `CREATE TABLE IF NOT EXISTS`:
  - `registration` (`id TEXT PRIMARY KEY`, `fid TEXT NOT NULL`, `followed_team_id TEXT`, `opponent_label TEXT`, `key_hash TEXT NOT NULL`, `created_at_ms INTEGER NOT NULL`)
  - `rate_bucket` (`bucket_key TEXT PRIMARY KEY`, `window_start_ms INTEGER NOT NULL`, `count INTEGER NOT NULL`)
  Zahvaljujući `IF NOT EXISTS` sintaksi i identičnim tipovima kolona, postojeći podaci u SQLite instanci se ne oštećuju niti brišu.
- **Odsustvo tvrdnji o bajt-paritetu:** Kao što `docs/handoffs/02-push-reconciliation.md` ispravno navodi, tačan izvorni TypeScript nije bio dostupan u Cloudflare API odzivu (koji vraća minifikovani esbuild snop). Kôd u repozitorijumu predstavlja verodostojnu funkcionalnu rekonstrukciju, uz 3 dokumentovane razlike. Ne tvrdi se bajt-paritet sa raspoređenim snopom.

### 2. Deterministička perzistencija i ponašanje pri restartu (Workerd dokazi)
- U Cloudflare Workers okruženju, radni izolati (`isolates`) se mogu ugasiti ili premestiti u bilo kom trenutku. Prethodni in-memory model u repozitorijumu gubio je sve registracije pri restartu.
- Rekonstruisani kod delegira skladištenje na SQLite unutar Durable Object-a.
- Integracioni testovi u `test/durable-object.test.ts` koriste nativni `workerd` runtime (`Miniflare`) i pozivaju `mf.unsafeEvictDurableObject('matchahead-push-probe', 'ProbeDirectoryObject', { name: DIRECTORY_NAME })`:
  - Registracija opstaje nakon prinudnog gašenja/evikcije objekta.
  - Slanje poruke vlasniku nakon evikcije uspešno prolazi (HTTP 200).
  - Rate limit brojači i obrisane registracije perzistiraju i nakon evikcije (odbijanje sa 401).

### 3. Fail-closed mehanizmi i zaštitne kapije (Missing Bindings & Send Gates)
- **Nedostajući `PROBE_DIRECTORY` binding:** U `src/app.ts`, `directoryOrResponse(env)` striktno proverava postojanje direktorijuma. Ako binding nije postavljen, vraća HTTP 503 `store_not_bound`.
- **Kapija slanja (`PROBE_SEND_ENABLED`):** Ako vrednost u okruženju nije striktno `'1'`, endpointi `/api/registrations` i `/api/probe/send` vraćaju HTTP 404 `probe_disabled`.
- **Kapija upisa (`PROBE_ENROLL_SECRET`):**
  - Ako tajna nije konfigurisana -> HTTP 503 `enroll_not_configured`.
  - Ako je tajna slaba (manje od 32 karaktera ili manje od 16 različitih karaktera) -> HTTP 503 `enroll_weak`.
  - Ako se uneta tajna ne poklapa sa konfigurisanom -> HTTP 401 `enroll_rejected`.
- **Nepotpuna FCM konfiguracija:** Nedostatak `FIREBASE_PROJECT_ID`, `FCM_CLIENT_EMAIL` ili `FCM_PRIVATE_KEY` momentalno prekida tok slanja uz HTTP 503 `fcm_not_configured`.
- **Tajna u URL-u i provera porekla:** Bilo koji parametar u URL-u koji sadrži reči poput `token`, `secret`, `key` vraća HTTP 400 `secret_in_url`. Zahtevi sa neodgovarajućim `Origin` zaglavljem se odbijaju sa HTTP 403 `origin_rejected`.

### 4. Kompatibilnost klijenta i servera (Client/Server Contract)
- **Registracija:**
  - Klijent (`src/client-entry.ts`) šalje: `POST /api/registrations`, zaglavlje `x-matchahead-enroll: <tajna>`, telo `{ "fid": "<FID>" }`.
  - Server obrađuje i vraća HTTP 201: `{ "registrationId": "<UUID>", "selfSendKey": "<43_znaka_base64url>" }`.
- **Slanje probne notifikacije:**
  - Klijent šalje: `POST /api/probe/send`, zaglavlje `Authorization: Bearer <selfSendKey>`, telo `{ "registrationId": "<UUID>" }`.
  - Server striktno proverava da telo sadrži isključivo polje `registrationId`. Bilo koje dodatno polje izaziva HTTP 400 `payload_not_allowed`.
- **Odjava (Unregister):**
  - Klijent šalje: `DELETE /api/registrations/<registrationId>`, zaglavlje `Authorization: Bearer <selfSendKey>`.
  - Server verifikuje ključ i briše zapis iz baze.
- **Bezbednost klijentskog snopa:** Fajlovi `pwa/app.js` i `pwa/firebase-messaging-sw.js` ne sadrže nikakve tajne, privatne ključeve niti serverske tokene. Konfiguracija se dinamički čita iz `/config.json`.

### 5. Vlasništvo nad slanjem (Self-Send) i serijalizacija konkurentnosti
- **Kriptografska zaštita ključa:** Server generiše 32 bajta kriptografski slučajnih podataka (`crypto.getRandomValues`) i kodira ih kao 43 base64url znaka (`selfSendKey`). U SQLite bazi se čuva isključivo SHA-256 heš tog ključa. Provera autorizacije se vrši u konstantnom vremenu (`timingSafeEqualBytes`) kako bi se sprečili side-channel napadi.
- **Serijalizacija zahteva (Delta 1):** U `ProbeDirectoryObject` (`src/directory-object.ts`), zahtevi se ređaju na rep promisa (`#tail` lanac). Ovo sprečava trku pri paralelnim zahtevima (jer bi `await request.json()` inače otvorio ulaznu kapiju pre završetka SQL transakcije).
- **Konkurentni test:** `test('workerd ograničava istovremena slanja i brisanje ostaje važeće')` šalje rafal od 8 paralelnih zahteva: tačno 3 prolaze (HTTP 200), a 5 bivaju odsečeni (HTTP 429), potvrđujući besprekornu atomičnost limita.

### 6. Upravljanje nevažećim i isteklim FID-ovima
- **TTL registracije:** Zapisi stariji od 24 sata (`REGISTRATION_TTL_MS`) bivaju automatski obrisani prilikom čitanja u `readRegistration`.
- **Google FCM 404 odgovor:** Ukoliko Google FCM servis vrati HTTP 404 (FID više ne postoji ili je deregistrovan na Google strani), server odmah briše registraciju iz SQLite baze i klijentu vraća HTTP 410 `fid_not_registered`. U workerd testovima potvrđeno je da registracija ostaje obrisana i nakon restarta objekta.

---

## Uočeni nalazi i defekti u pratećoj dokumentaciji

Tokom revizije identifikovana su tri nalaza u dokumentaciji (prvenstveno u `docs/push-readiness-review.md`). Pošto ovaj zadatak ima isključivo read-only mandat nad postojećim fajlovima, ovi nalazi se prosleđuju koordinatoru i vlasniku dokumentacije na korekciju:

### Nalaz 1: Generator tajne u dokumentaciji probija prag entropije (SEVERITY: MEDIUM)
- **Lokacija:** `docs/push-readiness-review.md`, linija 338:
  ```bash
  ENROLL_SECRET=$(openssl rand -hex 24)
  ```
- **Uzrok i mehanizam greške:** Heksadecimalni alfabet sadrži samo 16 mogućih znakova (`0-9`, `a-f`). Server u `src/secret.ts` zahteva:
  ```ts
  export function enrollSecretAccepted(secret: string): boolean {
    if (secret.length < 32) return false;
    return new Set(secret).size >= 16;
  }
  ```
  Za string od 48 heksadecimalnih karaktera, verovatnoća da bar jedan od 16 heksadecimalnih karaktera izostane iznosi čak **55.14%** (potvrđeno Monte Carlo simulacijom od 10.000 iteracija).
- **Posledica:** Operater koji doslovno prati uputstvo iz dokumentacije u više od polovine slučajeva dobija generisanu tajnu koju server odbija sa HTTP 503 `enroll_weak`!
- **Preporuka za vlasnika dokumentacije:** Zameniti generator tajne formatom base64url od 32 bajta (43 karaktera):
  ```bash
  ENROLL_SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
  # ili preko Node.js:
  ENROLL_SECRET=$(node -e 'console.log(crypto.randomBytes(32).toString("base64url"))')
  ```
  Testirano: 0 neuspeha u 10.000 iteracija (uvek zadovoljava `size >= 16`).

### Nalaz 2: Zastareli `registrationSecret` protokol u akcionom planu (SEVERITY: HIGH)
- **Lokacija:** `docs/push-readiness-review.md`, linije 149, 219, 302, 304, 363, 372–375.
- **Opis neslaganja:** Dokumentacija instruira slanje tajne u JSON telu:
  ```json
  POST /api/probe/send
  {
    "registrationId": "<ID>",
    "registrationSecret": "<SECRET>"
  }
  ```
- **Stvarno stanje koda i živog radnika:**
  Server u `src/app.ts` striktno odbija bilo koje telo koje ima više od jednog ključa (`payload_not_allowed`, HTTP 400). Autorizacija se vrši isključivo preko zaglavlja:
  ```text
  Authorization: Bearer <selfSendKey>
  ```
  Pored toga, korisnički interfejs (`src/client-entry.ts`) uopšte ne ispisuje `registrationId` niti `selfSendKey` na ekranu. Za ručno slanje preko curl-a, operater mora preuzeti ove vrednosti iz Network taba pregledača (odgovor na `POST /api/registrations`).
- **Preporuka za vlasnika dokumentacije:** Uskladiti primere u `docs/push-readiness-review.md` sa važećim HTTP ugovorom opisanim u `docs/handoffs/02-push-reconciliation.md`.

### Nalaz 3: Instrukcije za zatvaranje PWA na mobilnom telefonu (SEVERITY: LOW)
- **Lokacija:** `docs/push-readiness-review.md`, linije 303 i 364–367.
- **Upozorenje za operatera:** Instrukcija za testiranje buđenja zatvorene aplikacije mora biti striktno: „zatvaranje PWA prozora prevlačenjem nagore u App Switcher-u / listi nedavnih aplikacija”.
- **Rizik:** Operater ne sme izvršiti sistemsko prinudno zaustavljanje („Force stop” / „Prinudno zaustavi” u podešavanjima aplikacije na Androidu). Na Android operativnom sistemu, „Force stop” suspenduje sve pozadinske intent-e i FCM servise za dati paket sve dok korisnik ponovo ručno ne pokrene aplikaciju, što bi izazvalo lažni negativan rezultat testa.

---

## Tabela usklađenosti i zaključak

| Dimenzija provere | Status | Komentar / Dokaz |
|---|---|---|
| **DO SQLite šema** | **USKLAĐENO** | `ProbeDirectoryObject`, tag `v1-probe-directory`, `CREATE TABLE IF NOT EXISTS` čuvaju postojeće zapise i namespace. |
| **Deterministička perzistencija** | **DOKAZANO** | Miniflare `workerd` testovi potvrđuju perzistenciju preko `unsafeEvictDurableObject`. |
| **Fail-closed bezbednost** | **USKLAĐENO** | Odbijanje nepostojećih bindinga (503), ugašenog probe-a (404), slabih tajni (503) i tuđeg origin-a (403). |
| **Klijent / Server ugovor** | **USKLAĐENO** | `Bearer selfSendKey`, bez token API-ja, bez curenja tajni u klijentski snop. |
| **Konkurentnost i rate limit** | **DOKAZANO** | `#tail` promise queue serijalizuje zahteve unutar DO; 8 paralelnih zahteva daje tačno 3x 200 i 5x 429. |
| **Upravljanje FID-om** | **USKLAĐENO** | 24h TTL, brisanje na zahtev i automatsko brisanje na FCM 404 odgovor. |
| **Test pokrivenost** | **POTPUNA** | 27 testova prolazi (uključujući 4 nativna workerd testa), bez oslanjanja na nedokazane pretpostavke. |
| **Čistoća radnog stabla** | **OČUVANA** | Nema nezabeleženih izmena; kreiran je isključivo ovaj revizorski izveštaj. |

**Zaključak revizora:**  
Implementacija u commit-u `6af69c1` je arhitektonski zrela, stabilna i bezbedna za spajanje. Preporučuje se koordinatoru da prihvati izmene i naloži ažuriranje prateće dokumentacije u skladu sa navedenim nalazima pre pokretanja fizičke sesije testiranja na mobilnom telefonu.
