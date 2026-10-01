# Predaja zadatka 02 — usklađivanje push probe sa Durable Object skladištem

Datum: 30. septembar 2026.
Status: DONE za usklađivanje praćenog koda i lokalne workerd dokaze. Deploy nije rađen. Fizički telefon i edge `cpuTime` ostaju `NOT_TESTED`.

## Ostvaren rezultat

Praćeni worker u `experiments/push-probe` sada čuva registracije u SQLite Durable Object klasi `ProbeDirectoryObject`, pod bindingom `PROBE_DIRECTORY` i već primenjenim migracionim tagom `v1-probe-directory`. To je isti oblik koji već radi na `https://matchahead-push-probe.mls-ivanovic.workers.dev`.

Tačan TypeScript iz uploadovanog snopa nije vraćen. `GET /accounts/…/workers/scripts/matchahead-push-probe/content/v2` je vratio živi esbuild snop, a verzijski `…/versions/2ee78270-c9d8-4374-ba09-623d590ec448/content` je vratio JSON koverat metapodataka (1885 bajtova, `success: true`), ne bajtove modula. Ovaj repozitorijum je rekonstrukcija tog ponašanja, sa tri zapisane razlike. Bajt-paritet nije utvrđen i ne sme se tvrditi.

Živi radnik nije menjan. Posle lokalnih testova javni status je i dalje:

```json
{"enabled":false,"fcmConfigured":true,"sdk":"firebase@12.19.0","identifier":"fid","delivery":"NOT_TESTED","synthetic":true,"store":"durable-object","storeBound":true}
```

Koordinator je već proverio da `gcloud billing projects describe matchahead` vraća `billingEnabled: false`. Ovaj zadatak to nije ponovo zvao i nije uključivao naplatu.

## Izmenjene datoteke

- `experiments/push-probe/src/directory.ts` — šema, SQL i operacije `health` / `save` / `read` / `remove` / `take`
- `experiments/push-probe/src/directory-object.ts` — klasa `ProbeDirectoryObject`
- `experiments/push-probe/src/app.ts` — registracije i limiti idu kroz direktorijum; status dobija `store` i `storeBound`
- `experiments/push-probe/src/worker.ts` — izvoz `ProbeDirectoryObject`
- `experiments/push-probe/src/secret.ts` — prag jačine upisne tajne
- `experiments/push-probe/src/rate.ts` — zajednički korak kante za SQL i memorijski duplikat
- `experiments/push-probe/wrangler.jsonc` — binding i migracija, bez novog namespace identifikatora
- `experiments/push-probe/test/durable-object.test.ts` — workerd dokaz
- `experiments/push-probe/test/app.test.ts`, `test/contract.test.ts`, `test/helpers.ts`, `scripts/measure-cpu.mjs`
- `scripts/check-push-probe.mjs` — sken novih datoteka i obavezna wrangler polja
- `docs/handoffs/02-push-reconciliation.md`

`docs/push-readiness-review.md` nije diran. Njega drži drugi zadatak. U njemu i dalje stoje `registrationSecret` i in-memory model; važeći ugovor je ovaj dokument i kod.

Klijent (`client-entry.ts`, `sw-entry.ts`, `build-client.mjs`) nije menjan. Izgrađeni `pwa/app.js` i `pwa/firebase-messaging-sw.js` ostaju van gita. Lokalne kopije vraćenog snopa su obrisane i nisu u repozitorijumu.

## Izvršene provere i dokazi

Read-only metapodaci žive verzije `2ee78270-c9d8-4374-ba09-623d590ec448`, broj 6, autor upload-a Wrangler, 27. septembar 2026. 17:52:49Z:

- Deployment `a6d57702-89a0-47c2-9bc4-a413d7d0d1f0` šalje 100% te verzije.
- ETag skripte `28325181b4787186f712f66e0dee6085cc54a37646f3b0687173c3f0ebc7863c` poklapa se sa `content/v2`.
- Multipart telo: dužina 39205, sha256 `f70bf8e554ef87a48f0407aa041108cfa4c7f6d2a126cc820f22211bf23ce47d`.
- Jedini modul u tom multipartu: `worker.js`, 38954 bajta, sha256 `41f0befae9b834a979861dfb8fc993a6d4741c5950297559be3a03d82706a710`. Kopija je obrisana posle čitanja.
- Rukovaoci `fetch` i `scheduled`. Imenovani rukovalac `ProbeDirectoryObject` je klasa.
- `compatibility_date` `2026-09-27`, `usage_model` `standard`, `migration_tag` `v1-probe-directory`, `run_worker_first` `/api/*`.
- Namespace `a6557e79488a4c648b9f198a9d8b986a`, ime `matchahead-push-probe_ProbeDirectoryObject`, klasa `ProbeDirectoryObject`, `use_sqlite: true`. Novi servis nije pravljen.
- Bindingi po imenu i tipu: `ASSETS` (`assets`), `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `FIREBASE_PROJECT_ID` (sva tri `secret_text`), `PROBE_DIRECTORY` (`durable_object_namespace`). `PROBE_ENROLL_SECRET` i `PROBE_SEND_ENABLED` nisu postavljeni, pa je kapija slanja zatvorena.
- Pogodak na obrazac privatnog ključa u snopu bio je literal `BEGIN` / `END PRIVATE KEY` u `pemToPkcs8`, ne ugrađen ključ. Vrednosti tajni nisu ispisivane.

`node scripts/check-push-probe.mjs` iz korena, 30. septembar 2026, izlaz 0:

- `npm run check`: 27 testova, 27 prolaza, 0 padova. Tu su `app`, `contract`, `auth` i četiri workerd testa.
- Posle toga `scripts/build-client.mjs` i sken izvora. Sken traži da `worker.ts` izvozi `ProbeDirectoryObject` i da `wrangler.jsonc` sadrži `PROBE_DIRECTORY`, `ProbeDirectoryObject`, `v1-probe-directory` i `new_sqlite_classes`.

Workerd dokaz ide preko Miniflare, jedan worker `matchahead-push-probe`, SQLite izvoz `ProbeDirectoryObject`, izlazni fetcher umesto pravog Google-a. Klasa ne nasleđuje `DurableObject`, isto kao vraćeni snop, pa test ne čita SQL preko RPC-a. Trajnost se vidi ovako: registracija, `unsafeEvictDurableObject` za ime `matchahead-push-probe`, zatim slanje vlasnika i dalje vraća 200. Osam paralelnih slanja daje tačno tri odgovora 200 i pet 429. Šest paralelnih `DELETE` ostavlja bar jedno uspešno brisanje; posle novog gašenja objekta slanje vraća 401. FCM 404 gasi red i posle gašenja objekta slanje je 401. `PROBE_SEND_ENABLED` van `1` ostavlja `storeBound: true` i slanje 404 `probe_disabled`. Odgovori testa ne sadrže upisnu tajnu, PEM ni FID.

Instalirani `firebase@12.19.0`: `register` / `onRegistered` i `unregister` / `onUnregistered` i dalje daju FID kroz callback. `@firebase/installations` i dalje traži `/^[cdef][\w-]{21}$/`. Klijentski izvor nije prebačen na `getToken`.

Javni `GET /api/probe/status` posle testova je nepromenjen i `enabled` je i dalje `false`.

## Kriterijumi koji nisu ispunjeni

- Poruka nije poslata. Android je slobodan za kasniju proveru, ali ovaj zadatak ne šalje notifikaciju. iPhone nije u ovoj proveri. Fizička isporuka na zatvorenu PWA je `NOT_TESTED`.
- Edge `cpuTime` je `NOT_TESTED`. Lokalni workerd tajmer nije zamena.
- Produkcija i dalje izvršava snop od 27. septembra. Ovaj commit nije uploadovan, pa prag jačine tajne i serijalizacija zahteva još ne rade na živoj adresi.
- `docs/push-readiness-review.md` i dalje opisuje stari upisni oblik. Nije u vlasništvu ovog zadatka.

## Odluke i ugovori koje sledeći task mora sačuvati

Vraćeni snop i ovaj kod dele isti HTTP ugovor:

- `POST /api/registrations` sa zaglavljem `x-matchahead-enroll` i telom koje sme da nosi `fid` (plus opcioni `followedTeamId` i `opponentLabel`). Odgovor 201 je `{ "registrationId", "selfSendKey" }`. `selfSendKey` je 32 slučajna bajta kao base64url (43 znaka). Server čuva samo SHA-256, base64url.
- `POST /api/probe/send` prima tačno jedno polje, `registrationId`, i zaglavlje `Authorization: Bearer <selfSendKey>`. Telo nema `registrationSecret`, tuđi FID, naslov ni URL.
- Brisanje je `DELETE /api/registrations/<registrationId>` sa istim Bearer ključem. Putanja `/api/probe/unregister` ne postoji.
- TTL registracije je 24 sata. Limiti: 3 slanja po registraciji na sat, 30 slanja po workeru na UTC dan, 10 registracija na sat, 20 neuspešnih autorizacija na sat.
- FID ostaje identitet. `getToken()` se ne uvodi.
- Tajne ne ulaze u klijentski snop. `pwa/config.json` i dalje nosi samo javne Firebase vrednosti kad operater lokalno popuni fajl.
- Ako binding nedostaje, upis i slanje vraćaju 503 `store_not_bound`.
- Kapije ostaju ugašene dok posebna, pregledana sesija dokaza ne odluči drugačije. `PROBE_SEND_ENABLED` sme da otvori slanje samo kad je tačno `1`.

Tri razlike rekonstrukcije, namerno, bez tvrdnje da su bile u snopu:

1. `ProbeDirectoryObject.fetch` ređa zahteve na rep obećanja. `await request.json()` inače otvara ulaznu kapiju Durable Object-a pre SQL upisa, pa bi se paralelni `take` i `remove` preklapali. Vraćena klasa je zvala obradu direktno.
2. `enrollSecretAccepted` traži bar 32 znaka i bar 16 različitih znakova. Inače je 503 `enroll_weak`. Vraćeni snop prihvata bilo koju nepraznu tajnu. Živa tajna nije postavljena, pa su oba oblika i dalje zatvorena.
3. Direktorijum na telo koje nije objekat vraća 400 `invalid_body`. Vraćeni kod bi u tom slučaju bacio izuzetak i vratio 500 `directory_failed`.

Budući deploy, kad bude posebno odobren:

- Tag `v1-probe-directory` je već primenjen. Ne menjati ga, ne brisati klasu i ne praviti novi namespace. Polje `exports` u wrangler konfiguraciji je uzajamno isključivo sa `migrations`, pa konfiguracija ostaje na `durable_objects.bindings` i `migrations.new_sqlite_classes`. `script_name` se ne dodaje.
- Namespace id `a6557e79488a4c648b9f198a9d8b986a` se samo pamti. Ne služi za pravljenje novog servisa.
- Besplatan plan ostaje. Naplata se ne uključuje.

`docs/push-readiness-review.md` u tačkama o `registrationSecret` i in-memory mapi više nije izvor ugovora.

## Potrebni pristupi i ručni koraci

Imena, bez vrednosti: `PROBE_SEND_ENABLED`, `PROBE_ENROLL_SECRET`, `FIREBASE_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `PUBLIC_BASE_URL`, binding `PROBE_DIRECTORY`.

Ovaj zadatak ne postavlja tajne, ne rotira ih i ne šalje poruku. Sledeća sesija dokaza na zatvorenu PWA radi usklađeni protokol. Stari plan sa `registrationSecret` u telu `POST /api/probe/send` ne važi ni za živi snop ni za ovaj kod.

Koraci tek kad pregled izričito otvori sesiju dokaza:

1. Potvrditi `GET /api/probe/status`. Dok je `enabled` false, slanje ostaje 404 `probe_disabled`.
2. Ako dokaz treba da pokrije prag jačine i serijalizaciju, prvo ide posebno odobren deploy ovog stabla. Taj deploy ponovo koristi tag `v1-probe-directory` i postojeći namespace. Deploy nije deo ovog commit-a. Dokaz protiv današnje produkcije vidi HTTP oblik vraćenog snopa, a ne prag `enroll_weak` i ne redjanje zahteva.
3. Napraviti upisnu tajnu van repozitorijuma — poželjno 32 slučajna bajta kao base64url (43 znaka), uz opcionu proveru/ponavljanje dok ne bude bar 16 različitih znakova (inače server vraća 503 `enroll_weak`; stari `openssl rand -hex 24` je nepouzdan):
   ```bash
   umask 077
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' > /tmp/probe-enroll-secret.txt
   chmod 600 /tmp/probe-enroll-secret.txt
   ```
   Bez ispisa tajne na ekran, bez literala u komandnoj liniji/istoriji/URL-u/dokumentaciji. Staviti je u `PROBE_ENROLL_SECRET` isključivo interaktivnim unosom ili unosom iz datoteke. `PROBE_SEND_ENABLED` postaviti na `1` samo za trajanje sesije.
4. Na telefonu otvoriti probu. Android: Chrome na adresi workera. iPhone, iOS 16.4+: Safari, Add to Home Screen, pa ikonica sa početnog ekrana pre traženja dozvole. U polje ključa probe uneti istu upisnu tajnu, dozvoliti obaveštenja, pa registrovati. Ekran kaže da je uređaj registrovan i ne ispisuje `registrationId` ni `selfSendKey`. Pre zatvaranja, iz mrežnog zapisa pregledača (na Androidu po potrebi preko remote debugging-a) jednom prepisati JSON odgovor 201. Server tu vrednost više ne zna u čistom obliku.
5. Zatvoriti **samo PWA karticu**: početni ekran, pregled nedavnih aplikacija, prevući PWA naviše dok ne nestane iz memorije. Zabranjeno: Force stop, gašenje browser procesa i redosled „prvo pošalji pa zatvori”. Telefon može da ostane zaključan.
6. Sa drugog računara, bez tajni u URL-u:

```bash
curl -sS -X POST "https://matchahead-push-probe.mls-ivanovic.workers.dev/api/probe/send" \
  -H "content-type: application/json" \
  -H "authorization: Bearer <selfSendKey>" \
  -d '{"registrationId":"<registrationId>"}'
```

Žični prihvat je `delivery: accepted_by_fcm` i `displayedOnDevice: false`. To još nije dokaz na uređaju. Dokaz je sistemsko obaveštenje dok je aplikacija ugašena, pa klik koji otvara `/poruka.html?probe=synthetic&id=…`.

7. `wrangler tail` može da vidi zaglavlja. Taj izlaz se ne commit-uje i ne lepi u dokumentaciju. Edge `cpuTime` se čita iz tog traga i ostaje `NOT_TESTED` dok se ne očita.
8. Odmah posle sesije vratiti kapiju: `PROBE_SEND_ENABLED` više ne sme biti `1`. Javni status mora opet da pokaže `enabled: false`.

## Sledeći task

Pregledana sesija dokaza na zatvorenu PWA, poseban zadatak. Preduslovi: ovaj commit pregledan, kapije i dalje ugašene, naplata i dalje isključena, namespace se ne pravi iznova. Android je dostupan za tu kasniju proveru. Prvi korak je pročitati ovaj dokument, ponovo povući `GET /api/probe/status` i ne slati poruku dok pregled izričito ne otvori sesiju.

Ovaj dokument tu sesiju ne pokreće.
