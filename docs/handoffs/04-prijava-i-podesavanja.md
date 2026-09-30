# Predaja zadatka 04 — prijava i podešavanja

Datum: 30. septembar 2026.
Status: IN_PROGRESS

Pun zadatak faze 04 nije završen. Ovaj radnik je predao testirano jezgro: model naloga, Firestore pravila, emulator i pomoćne funkcije bez React ekrana. `docs/progress.md` nije diran. Koordinator treba da ostavi fazu 04 kao IN_PROGRESS.

## Ostvaren rezultat

Zajednički ugovor je u `packages/domain/src/user-account.ts`. Firestore pravila su u `firebase/firestore.rules`. Emulator sluša samo `127.0.0.1`, Auth `9099` i Firestore `8080`, projekat `demo-matchahead`. Nema `.firebaserc` i pravila nisu objavljena.

Aplikacija i dalje radi bez prijave. `App.tsx` i ekrani nisu menjani i ne uvoze Firebase. Produkzioni paket nema `firebase` ni `AIza`. Javni DEMO raspored ostaje dostupan bez naloga.

Pomoćne funkcije, još neuvezane u ekran, jesu `firebase-config.ts`, `account-gate.ts`, `account-deletion.ts`, `auth-messages.ts` i `account-remote.ts`. Nema `use-account.ts` ni browser hooka.

### Profil `users/{uid}`

Polja, tačno ova: `schemaVersion` (int `1`), `locale` (`sr`), `timeZone`, `favoriteTeamIds`, `reminderMinutes`, `notifyScheduleChange`, `notifyCancellation`, `createdAt`, `updatedAt`.

`favoriteTeamIds` je lista bez duplikata, najviše četiri, samo:

- `football:rs:crvena-zvezda`
- `football:rs:partizan`
- `basketball:rs:crvena-zvezda`
- `basketball:rs:partizan`

`reminderMinutes` je int `0`, `15`, `30` ili `60`. Oba `notify*` polja su bool. Vremena su `YYYY-MM-DDTHH:mm:ss.sssZ`. `createdAt` i `schemaVersion` se ne menjaju. Tuđa polja, uključujući email, rules odbijaju.

`timeZone` u pravilima je samo oblik `^[A-Za-z][A-Za-z0-9_+/-]{0,63}$`. `timeZoneForDisplay` nepoznatu ili Intl-nepodržanu zonu, na primer `Fake/Zone`, pretvara u `Europe/Belgrade`. Pravila i dalje prihvataju `Fake/Zone` ako ga klijent upiše sirovo.

Omiljeni klub nije praćenje i ne ulazi u agendu.

### Podkolekcije

`users/{uid}/follows/{teamId}`: `teamId` jednak ID-u dokumenta, jedan od četiri kluba, `active` bool, `createdAt`, `updatedAt`. `createdAt` je nepromenljiv. Upis traži postojeći profil.

`users/{uid}/manualSelections/{fixtureId}`: `fixtureId` jednak ID-u dokumenta i obliku `^[A-Za-z0-9][A-Za-z0-9:_-]{2,399}$`. Protivnik nije u katalogu. `active`, `createdAt`, `updatedAt`. `createdAt` je nepromenljiv.

`users/{uid}/devices/{installationId}`: ID instalacije `^[A-Za-z0-9_-]{16,64}$`. `fid` je null ili `^[cdef][A-Za-z0-9_-]{21}$`. To nije FCM registration token. Nema polja `fcmToken`. Tu su i `createdAt`, `updatedAt`, `lastSeenAt`.

`users/{uid}/accountOps/deletion` više nije brava. Pravila i dalje puštaju vlasnika da ga čita i briše. Tokom brave ne može da se ponovo kreira. `deleteOwnedDocuments` tu podkolekciju briše kao ostatak stabla korisnika.

Lista `users` je zabranjena. Gost ne čita tuđ profil. Drugi prijavljeni korisnik ne čita ni ne piše tuđe dokumente.

### Agenda za Muse

`InclusionReason` je `{ kind: 'followed_team', teamId: string }` ili `{ kind: 'manual_selection', fixtureId: string }`. Stari nazivi `club_follow` i `manual_pick` ne važe.

`agendaInputs` i `readAgendaIds` vraćaju `followedTeamIds` (aktivna praćenja iz kataloga) i `manualFixtureIds` (aktivni ručni izbori). `favoriteTeamIds` stoje odvojeno i nisu ulaz agende. Upis ručnog izbora je `writeManual`. Upis praćenja je `writeFollow`.

### Brava brisanja

Dokument `accountTombstones/{uid}` je van `users/{uid}`. Polja su samo `status: 'in_progress'`, `startedAt`, `updatedAt`. Nema profila, omiljenih, praćenja ni uređaja.

Pravila: vlasnik sme `get` i `create`. `list` je zabranjen. `update` i `delete` su zabranjeni svakom klijentu, uključujući novu prijavu istog uid-a. Dok dokument postoji, vlasnik ne sme da kreira ni menja profil, praćenja, ručne izbore, uređaje ni `accountOps/deletion`. Brisanje tih korisničkih dokumenata ostaje dozvoljeno, da čišćenje može da se nastavi.

`openDeletionLock(db, uid, now)` kreira bravu ako je nema. `deleteOwnedDocuments(db, uid, now)` prvo otvara bravu, pa briše praćenja, ručne izbore, uređaje, `accountOps` i profil. Bravu ne briše i Auth nalog ne dira. Ponovni poziv nastavlja prekinuto brisanje. `readDeletionLock` vraća zapis ili null.

`resumeAccountDeletion` podiže lokalnu zastavicu `matchahead.deletion.{uid}`, zove prosleđeno brisanje dokumenata, pa `deleteAuthUser`. Na `auth/requires-recent-login` vraća `needs-recent-login` i ostavlja zastavicu. Ta Auth greška je ubrizgana u jediničnom testu. Emulator je nije sam proizveo. Brava ostaje jer je klijent ne briše ni kad Auth brisanje padne.

Posle uspešnog `deleteUser` dokument `accountTombstones/{uid}` ostaje. Stari uid ne može da napravi nov profil dok brava postoji. Očekivano je da nova Google prijava dobije nov uid. To ovde nije mereno. Čišćenje brave je kasniji pouzdani server. Nema Admin `revokeRefreshTokens`. Pravila vide samo `request.auth.uid`. Dok je token još važeći, brava ga odbija. Posle `deleteUser` test samo proverava da upis ne prolazi, bez razdvajanja `permission-denied` i `unauthenticated`.

`openDeletionMarker` iz privremenog commita `f7f3213` više ne postoji.

### Konfiguracija bez tajni

Obavezna imena: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Opciona: `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET`. Emulator, samo `127.0.0.1` ili `localhost`: `VITE_FIREBASE_AUTH_EMULATOR_HOST`, `VITE_FIREBASE_FIRESTORE_EMULATOR_HOST`. Prazna obavezna polja znače `unconfigured`. Tuđ host emulatora je `emulator-rejected` i ne sme da padne na produkciju. Vrednosti nisu u gitu.

Firebase JS SDK je tačno `12.19.0`, samo u `apps/web`. Emulator test koristi `memoryLocalCache` i `inMemoryPersistence`. U kodu nema `persistentLocalCache`. Sledeći klijent treba da zove `initializeFirestore(app, { localCache: memoryLocalCache() })` pre bilo kog čitanja i da ne zove `getFirestore()` prvo. Odjava treba da očisti memorijski keš preko `terminate` i `deleteApp`. Keš uređaja `matchahead.device.prefs` i dalje preživljava odjavu. `clearUserLocalContent` i dalje briše samo sesiju i ključeve tog uid-a.

`AccountGate` i `runOwned` odbacuju kasni odgovor prethodnog uid-a. Nisu uvezani u React. Nema `onSnapshot`.

Serverske kolekcije `notifJobs` i `notificationDeliveries` klijent ne čita i ne piše. Ugnježdeni `users/{uid}/notifJobs` takođe pada. Podsetnik na profilu nije push dozvola. Nema `getToken()`, `Notification.requestPermission` ni drugog service workera.

## Izmenjene datoteke

Privremeni checkpoint `f7f32137e1aa989e2626613a87246bd54ff6d82f`, pa commit koji ostavlja bravu:

- `packages/domain/src/user-account.ts`
- `packages/domain/src/index.ts`
- `packages/domain/test/user-account.test.ts`
- `firebase/firestore.rules`
- `firebase.json`
- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/src/logic/firebase-config.ts`
- `apps/web/src/logic/account-gate.ts`
- `apps/web/src/logic/account-deletion.ts`
- `apps/web/src/logic/auth-messages.ts`
- `apps/web/src/logic/account-remote.ts`
- `apps/web/test/account.test.ts`
- `apps/web/test/emulator/isolation.test.ts`
- `scripts/check-auth.mjs`
- `.env.example`
- `.gitignore`
- `docs/handoffs/04-prijava-i-podesavanja.md`

`App.tsx`, `apps/web/src/ui/screens.tsx` i `apps/web/src/logic/agenda.ts` nisu menjani. `README.md`, `docs/progress.md` i `docs/decisions.md` nisu menjani. `node_modules` i debug log emulatora nisu u commitu.

## Izvršene provere i dokazi

Izvori, 24. septembar 2026, zvanična Firebase dokumentacija: Auth emulator prima Google credential kao JSON string `{ sub, email, email_verified }`. Modularni SDK u toj dokumentaciji je `12.19.0`. `memoryLocalCache` je podrazumevani Firestore keš i ovde je ipak zadat izričito. Pravila su OR po `allow`, `&&` prekida, `hasOnly` ograničava ključeve i vrednosti.

`node scripts/check-auth.mjs`, 30. septembar 2026:

- domen `user-account.test.ts`: 4 prolaza, 0 padova
- `apps/web/test/account.test.ts`: 5 prolaza, 0 padova
- `tsc --noEmit` u `apps/web` bez greške
- `firebase emulators:exec --only auth,firestore --project demo-matchahead`: 6 prolaza, 0 padova

Emulator je pokazao: dva korisnika i gost; ista Google prijava na dva klijenta vidi omiljene; peto ili duplo ili tuđe polje, string umesto int, protivnik, loš `fid` i `fcmToken` padaju; sva četiri kluba prolaze; ručni izbor sa protivnikom van kataloga prolazi; `notifJobs` i `notificationDeliveries` padaju. Tokom brave stari klijent i nova prijava istog uid-a dobijaju `permission-denied` na profil, praćenje, uređaj, ručni izbor, izmenu brave i brisanje brave. Prekinuto brisanje se nastavlja, tuđi profil ostaje, brava ostaje. Posle `deleteUser` upis istog uid-a i dalje ne prolazi, a emulatorov admin čitanje i dalje vidi `accountTombstones/{uid}` bez omiljenih. SDK u logu piše `PERMISSION_DENIED` za te odbijene upise. To nije pad testa.

`node scripts/check-data-contracts.mjs`: 24 prolaza, 0 padova.

`node scripts/check-pwa.mjs`: 20 jediničnih prolaza, `tsc` bez greške, dva Vite builda (42 modula, JS oko 246 kB, precache 13 zapisa, 265.60 KiB), statička provera manifesta, jednog workera i DEMO rasporeda prolazi. U `/tmp/matchahead-pwa-a/assets` nema niza `firebase`. Headless Chrome deo pao je tri puta, svaki put na drugoj tvrdnji odmah pošto se `location.hash` već poklopio: `moje utakmice`, `Enter nije otvorio klubove`, `podešavanja`. `App.tsx` i ekrani nisu menjani. To je trka postojeće provere između hash-a i React crtanja, ne novi ekran prijave. Cela browser skripta zato nije zelena.

Živa Google prijava u browseru nije rađena. Pravila nisu na produkcionom projektu `matchahead`.

## Kriterijumi koji nisu ispunjeni

- Ekran prijave, odjave, omiljenih, zone naloga i brisanja naloga nije urađen. To je sledeći radnik.
- Živa Google prijava: NOT_TESTED. Nepodešen i offline prikaz u browseru sa pravim Firebase projektom: NOT_TESTED.
- Firestore pravila nisu deployovana. Nema naplate i nema novih udaljenih resursa.
- Android i iPhone: NOT_TESTED.
- Faza 02 ostaje BLOCKED. Nema Calendar OAuth ni sportskih adaptera.
- `auth/requires-recent-login` emulator nije sam bacio.
- Posle `deleteUser` nije dokazano da stari ID token još prolazi Auth, samo da upis ne uspeva i da brava ostaje. Nema opoziva tokena.
- Brava starog uid-a ostaje dok je server ne obriše. Novi uid posle ponovne Google prijave nije meren.
- `node scripts/check-pwa.mjs` nije prošao ceo browser tok. Jedinični testovi, tipovi, oba builda i statička PWA provera jesu.

## Odluke i ugovori koje sledeći task mora sačuvati

- Četiri kluba iz `selectableTeams`. Protivnik sme u utakmicu i u ručni izbor. Omiljeni klub nije razlog ulaska u agendu.
- Muse zove `buildUserAgenda(fixtures, followedTeamIds, manualFixtureIds)`. `manualFixtureIds` dolaze iz `readAgendaIds`.
- Jedan service worker ostaje `apps/web/src/sw.ts`. Bez `getToken()` i bez `firebase-messaging-sw.js`.
- Javni konfiguracioni ključ samo kroz Vite imena iz ovog dokumenta. Ne upisivati ga u izvor, build ni log.
- Firestore keš naloga je memorijski. `persistentLocalCache` ne uvoditi.
- Brava je samo `accountTombstones/{uid}`. Klijent je ne briše i ne menja. Ne vraćati `openDeletionMarker`.
- Anonimna sesijska praćenja se ne uvoze u nalog. Dugme „Prati” i tekst „Pratim” ostaju prvo dugme u listi klubova. Podešavanja i dalje pokazuju BLOCKED, „Dodaj na početni ekran”, `#zone` i „Obriši lokalni sadržaj”. Zona uređaja preživljava brisanje sesije.
- `apps/web/src/logic/agenda.ts` ostaje Muse-u.

## Potrebni pristupi i ručni koraci

Imena su u `.env.example`. Vrednosti stoje samo u okruženju. Za emulator: `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` i `VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, uz `--project demo-matchahead`. Ne pokretati `firebase deploy`. Ne praviti `.firebaserc` ka projektu `matchahead`.

Kasnije, pouzdani server sme da obriše `accountTombstones/{uid}` kad Auth nalog više ne postoji. Do tada stari uid ostaje zaključan. U tombstone ne upisivati profil.

## Sledeći task

Browser Auth/Firestore adapter i ekran, na ovom jezgru, ne na zastarelom `openDeletionMarker`. Prvi korak: povezati `readFirebaseSetup`, `AccountGate` i `account-remote` bez `App` importa Firebase-a u bundle dok konfiguracija nije spremna, i bez prompta za push dozvolu. Ovaj dokument ne pokreće taj task.
