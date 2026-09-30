# Bezbednosni pregled jezgra naloga (Faza 04)

**Datum:** 30. septembar 2026.  
**Pregledač:** Gemini CLI (nezavisni bezbednosni pregled)  
**Obuhvat commita:** `f7f3213` (osnova šeme i Firestore pravila) + `5246e6d` (izmeštanje brave brisanja u `accountTombstones/{uid}`)  
**Referenca predaje:** `docs/handoffs/04-prijava-i-podesavanja.md`  
**Status pregleda:** Testirana bezbednosna matrica je prošla (PASS za evaluirane scenarije uz zabeležena ograničenja). Nalazi i preporuke prosleđeni koordinatoru i Muse-u (`matchahead-auth-client`).

---

## 1. Izvršni rezime (Executive Summary)

Nezavisnim bezbednosnim pregledom analizirano je jezgro naloga faze 04:
- Firestore bezbednosna pravila (`firebase/firestore.rules`)
- Domen i validacija podataka (`packages/domain/src/user-account.ts`)
- Pomoćna logika brisanja, stanja i udaljenih poziva (`apps/web/src/logic/account-deletion.ts`, `account-gate.ts`, `account-remote.ts`, `firebase-config.ts`)

Eksterna brava `accountTombstones/{uid}` u evaluiranim testovima sprečava naknadne pojedinačne upise i obezbeđuje izolaciju korisnika, nepovratnost brisanja sa klijenta i sprečavanje trka stanja u memoriji (`AccountGate`). Nisu pronađene eksploatabilne ranjivosti u definisanoj matrici testova. Zabeležena su specifična tehnička ograničenja: Firestore pravila evaluiraju pre-batch stanje (zbog čega simultani batch može upisati bravu i profil u istom zahtevu pre zaključavanja), `auth/requires-recent-login` je sintetički simuliran u testu, a klijentsko brisanje podkolekcija zavisi od rada browsera.

Nijedna izmena produkcionog koda nije vršena u ovom zadatku (`review ONLY`).

---

## 2. Izvršene provere i empirijski dokazi

Svi testovi su izvršeni lokalno nad zvaničnim Firebase emulatorima (Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, projekat `demo-matchahead`).

### 2.1. Zvanična verifikaciona skripta
```bash
node scripts/check-auth.mjs
```
**Ishod:**
- Domen `packages/domain/test/user-account.test.ts`: **4 prolaza, 0 padova** (107 ms)
- Web logika `apps/web/test/account.test.ts`: **5 prolaza, 0 padova** (108 ms)
- TypeScript provera `tsc --noEmit`: **0 grešaka**
- Emulator integracija `apps/web/test/emulator/isolation.test.ts`: **6 prolaza, 0 padova** (2892 ms)

### 2.2. Namenska bezbednosna test matrica (Scratch Test Suite)
Izvršen je detaljan test paket koji pokriva zadate bezbednosne vektore:
```bash
firebase emulators:exec --only auth,firestore --project demo-matchahead "node --experimental-strip-types --test --test-force-exit apps/web/test/emulator/security-review.scratch.test.ts"
```
**Ishod test paketa:** **9 prolaza, 0 padova** (2756 ms za testirane slučajeve).  
Test skripta je nakon empirijske potvrde uklonjena iz radnog stabla.

---

## 3. Nalazi po bezbednosnim oblastima

### 3.1. Izolacija vlasnika i pristup podacima (Owner Isolation)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `firebase/firestore.rules` (linije 5–12, 137–196)
- **Empirijski dokaz:**
  - Korisnik B ne može da pročita niti izlista `users/{uid}`, `follows`, `manualSelections`, `devices`, `accountOps` niti `accountTombstones` korisnika A (`PERMISSION_DENIED`).
  - Korisnik B ne može da upiše, izmeni niti obriše dokumente korisnika A.
  - Neautorizovani gost (`request.auth == null`) dobija `PERMISSION_DENIED` / `unauthenticated` na svaki pokušaj čitanja ili upisa.
  - Globalno listanje korisnika (`allow list: if false;` na `/users/{uid}`) onemogućava enumeraciju naloga.
  - Upiti nad kolekcijskim grupama (`collectionGroup`) za podkolekcije (`follows`, `devices`, `manualSelections`, `accountOps`) bivaju odbačeni od strane pravila jer ne postoji globalna dozvola.

### 3.2. Validacija šeme i polja (Schema & Field Validation)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `firebase/firestore.rules` (linije 14–135), `packages/domain/src/user-account.ts`
- **Empirijski dokaz:**
  - `data.keys().hasOnly(...)` na profilu i podkolekcijama sprečava injektovanje nedozvoljenih polja (npr. `role`, `admin`, `email`, `fcmToken`).
  - Obaveznost polja: izostavljanje polja (npr. `notifyCancellation`) u Firestore CEL evaluaciji dovodi do greške `Property <field> is undefined on object` koja prekida evaluaciju i odbija upis.
  - Dozvoljene vrednosti za `reminderMinutes` (samo `0`, `15`, `30`, `60`) i `locale` (samo `'sr'`) su nametnute.
  - Timovi u `favoriteTeamIds` i `follows` moraju pripadati dozvoljenom katalogu od 4 tima (`selectableTeams`).
  - Nepromenljivost: pri ažuriranju profila, `createdAt` i `schemaVersion` ne mogu biti izmenjeni (`request.resource.data.createdAt == resource.data.createdAt`). Isto važi za `createdAt` na podkolekcijama i `startedAt` na `accountOps/deletion`.
  - Kreiranje podkolekcija (`follows`, `manualSelections`, `devices`) uslovljeno je postojanjem roditeljskog profila (`profileOpen(uid)`).
- **Zapažanje (Nizak prioritet):** `validTimeZone` u pravilima proverava samo regex oblik `^[A-Za-z][A-Za-z0-9_+/-]{0,63}$`. Vrednost poput `Fake/Zone` prolazi Firestore pravila, ali domen u `timeZoneForDisplay` ima `try / catch` omotač oko `Intl.DateTimeFormat` i vraća `Europe/Belgrade`. Ovo je u skladu sa ugovorom.

### 3.3. Nepromenljivost brave `accountTombstones` (Immutability under Fresh `auth_time`)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `firebase/firestore.rules` (linije 198–205)
- **Empirijski dokaz:**
  - Pravilo za `accountTombstones/{uid}` definiše:
    ```
    allow get: if isOwner(uid);
    allow list: if false;
    allow create: if isOwner(uid) && validTombstone(request.resource.data);
    allow update, delete: if false;
    ```
  - Pravila `update` i `delete` su bezuslovno lažna (`if false;`).
  - Ni vlasnik naloga, ni ponovo prijavljeni korisnik sa novim tokenom i novim `auth_time`, ni poziv sa `{ merge: true }`, ne mogu da ažuriraju niti obrišu tombstone dokument sa klijenta.
  - Drugi korisnik ne može da pročita niti kreira tombstone za tuđi UID.
  - Dokument koristi UID kao ID dokumenta (`accountTombstones/{uid}`) i u telu sadrži isključivo polja `status: 'in_progress'`, `startedAt` i `updatedAt`. U njemu nema profila, omiljenih timova, uređaja niti korisničkih podešavanja.

### 3.4. Upisi tokom postojanja brave (Writes While Lock Exists, Batch & Transactions)
- **Status:** Testirana matrica prošla (PASS uz zabeleženo ograničenje batch evaluacije)
- **Lokacija:** `firebase/firestore.rules` (funkcija `deletionOpen(uid)`), `apps/web/src/logic/account-remote.ts`
- **Empirijski dokaz:**
  - Kada `accountTombstones/{uid}` postoji u bazi, `deletionOpen(uid)` vraća `true`.
  - Pojedinačni upisi (kreiranje i ažuriranje) za `users/{uid}`, `follows`, `manualSelections`, `devices` i `accountOps` bivaju odbijeni sa `PERMISSION_DENIED`.
  - Batch upis koji pokuša upis profila ili podkolekcija dok brava već postoji biva odbijen u celosti.
  - Batch upis koji pokuša da obriše `accountTombstones` i kreira profil biva odbijen jer je brisanje brave zabranjeno.
  - Transakcija koja pokuša upis profila dok brava postoji ili pokuša brisanje brave biva odbijena.
  - Brisanje dokumenata (`allow delete: if isOwner(uid);`) ne zavisi od `!deletionOpen(uid)`, što omogućava funkciji `deleteOwnedDocuments` da obriše zaostale podkolekcije i profil iako je brava već postavljena.
- **Ograničenje (Batch pre-state evaluacija):**
  - U Firestore pravilima, funkcija `exists()` posmatra stanje baze pre početka commit-a batch zahteva.
  - Ako klijent pošalje jedan batch koji istovremeno kreira i bravu (`accountTombstones/{uid}`) i profil (`users/{uid}`) u trenutku kada brava ranije nije postojala, pravila ne prekidaju upis profila jer tombstone u bazi pre batch-a još nije postojao. Odmah po završetku tog batch-a brava je u bazi i trajno blokira sve naredne mutacije. Klijentski kod (`account-remote.ts`) ne šalje ovakve kombinovane batch zahteve, već striktno poziva `openDeletionLock` pre brisanja.

### 3.5. Stvarno brisanje profila i podkolekcija (Subcollection Deletion)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `apps/web/src/logic/account-remote.ts` (linije 64–75, 107–115)
- **Empirijski dokaz:**
  - Testirano nad nalogom sa višestrukim dokumentima u svim podkolekcijama (2 praćenja, 2 ručna izbora, 2 uređaja, 1 accountOps, 1 profil).
  - Redosled izvršavanja u `deleteOwnedDocuments`:
    1. Otvara se brava `openDeletionLock` (onemogućava paralelno dodavanje novih zapisa).
    2. Brišu se podkolekcije redom: `follows`, `manualSelections`, `devices`, `accountOps`.
    3. Na kraju se briše roditeljski dokument `users/{uid}`.
  - Nakon izvršenja: sve 4 podkolekcije su prazne (0 dokumenata), roditeljski profil `users/{uid}` ne postoji (`exists() === false`).
  - Tombstone ostaje sačuvan i ne sadrži podatke profila.
  - Ponovni poziv `deleteOwnedDocuments` nad već obrisanim nalogom prolazi idempotentno.

### 3.6. Dozvole za serverske kolekcije (Server Collections)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `firebase/firestore.rules` (linije 207–213)
- **Empirijski dokaz:**
  - Kolekcije `/notifJobs/{jobId}` i `/notificationDeliveries/{deliveryId}` imaju eksplicitno `allow read, write: if false;`.
  - Pojedinačni `getDoc`, grupni `getDocs`, `setDoc`, `deleteDoc` i upiti nad kolekcijskim grupama (`collectionGroup('notifJobs')`, `collectionGroup('notificationDeliveries')`) bivaju odbijeni sa `PERMISSION_DENIED`.
  - Ugnježdena putanja `users/{uid}/notifJobs` nema pravilo i odbijena je podrazumevano.

### 3.7. Ponovni pokušaji, više uređaja i `auth/requires-recent-login`
- **Status:** Testirana matrica prošla (PASS uz razgraničenje sintetičkog testa)
- **Lokacija:** `apps/web/src/logic/account-deletion.ts` (linije 15–33), `packages/domain/src/user-account.ts`
- **Empirijski dokaz:**
  - U `resumeAccountDeletion`, redosled je:
    1. Postavlja se lokalna zastavica (`setFlag`).
    2. Poziva se brisanje Firestore dokumenata (`deleteDocuments`), koje zaključava nalog bravom i briše podatke.
    3. Poziva se `deleteAuthUser`.
  - **Sintetička priroda greške:** Greška `auth/requires-recent-login` u jediničnom testu je ubrizgana sintetički (Auth emulator je sam po sebi nije prirodno bacio).
  - Pri ovoj grešci, klijentski kod prepoznaje status `'needs-recent-login'`, ostavlja lokalnu zastavicu podignutom (`clearFlag` se ne poziva), a podaci u Firestore-u su već obrisani i zaključani bravom.
  - Drugi uređaj proverava postojanje tombstone-a u bazi (`marker: true`), pa `openingAction({ deletionFlag: false, marker: true })` vraća `'resume-deletion'`.
  - **Ograničenje verifikacije:** Potpuni end-to-end tok na korisničkom interfejsu sa dva fizička uređaja i stvarnom Google sesijom još uvek nije nezavisno dokazan jer UI ekrani nisu implementirani.

### 3.8. Trke stanja u memoriji (`AccountGate`)
- **Status:** Testirana matrica prošla (PASS)
- **Lokacija:** `apps/web/src/logic/account-gate.ts`
- **Empirijski dokaz:**
  - Svaka promena stanja (`beginUser`, `showSignedOut`, `showUnconfigured`, `showWorking`) uvećava monotoni brojač `generation` i odmah prazni privatne podatke (`clearPrivate`).
  - Kasni asinhroni odzivi (uspešno učitavanje, obaveštenje ili mrežna greška) koji nose tiket starije generacije ili drugog UID-a bivaju ignorisani.
  - `runOwned`: ako se stanje promeni tokom izvršavanja asinhrone operacije, povratna vrednost se odbacuje i vraća se `null`.

---

## 4. Razgraničenje: Emulator činjenice vs. Fizička integracija

| Oblast | Dokazano u emulatoru | Ograničenja / Nepoznato u fizičkoj integraciji |
| :--- | :--- | :--- |
| **Izolacija i pravila** | Firestore pravila i funkcije validacije prolaze testiranu matricu u emulatoru. | Pravila **nisu deployovana** na Google Cloud / Firebase projekat `matchahead`. Nema `.firebaserc`. |
| **Google Auth UID** | Emulator simulira Google nalog preko fiktivnog `sub` stringa u JSON formatu. | U živoj produkciji, Google OAuth dodeljuje UID preko Firebase Auth servisa. Nije mereno da li ponovna registracija istim Google nalogom posle brisanja dobija nov UID (očekivano je slučajan novi UID po Firebase specifikaciji). |
| **Važenje JWT tokena** | Pravila odbijaju upise starog UID-a zbog `accountTombstones` brave. | Firebase ID token (JWT) u oblaku važi do 60 minuta nakon izdavanja. Klijentski kod nema pristup Admin SDK metodi `revokeRefreshTokens`. Ipak, Firestore brava sprečava zloupotrebu tokena za izmenu baze. |
| **Klijentsko brisanje podkolekcija** | `deleteCollection` u petlji sa `limit(20)` prazni podkolekcije u testu. | Ako korisnik naglo zatvori browser ili izgubi konekciju tokom brisanja, brisanje ostaje delimično dok se ne ponovi. Za nultu cenu (0 EUR bez naplate / Blaze plana), ne uvoditi Cloud Functions; pouzdano čišćenje zaostalih zapisa može se poveriti postojećem Cloudflare Workeru ili serverskom poslu u kasnijoj fazi. |
| **PWA Browser Flow** | Jedinični testovi, tipovi i PWA build prolaze. | Postojeća trka u `check-pwa.mjs` (iz faza pre 04) sprečava puni prolaz browser testa; ekran prijave još ne postoji u UI sloju. |

---

## 5. Klasifikacija nalaza i rutiranje popravki

| ID | Ozbiljnost | Komponenta / Lokacija | Opis nalaza | Preporučena akcija i vlasnik |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | LOW (Info) | `firebase/firestore.rules` (L27) | `validTimeZone` proverava regex ali ne i postojanje stvarne IANA vremenske zone. | Rešeno u domenu (`packages/domain/src/user-account.ts`, `timeZoneForDisplay`). Pravila nije neophodno menjati. **Rutirati: Muse / Koordinator.** |
| **SEC-02** | LOW | `apps/web/src/logic/account-remote.ts` (L107) | Brisanje podkolekcija se oslanja na klijentsku `while` petlju sa `limit(20)`. | Zadovoljava trenutne limite (4 kluba). U budućnosti razmotriti server/Worker čišćenje bez uvođenja naplatnih servisa. **Rutirati: Koordinator.** |
| **SEC-03** | LOW (Info) | `firebase/firestore.rules` (L68) | `keys().hasOnly(...)` sa implicitnom greškom pri pristupu nepostojećem polju u CEL. | Odbija nekompletne profile uspešno. Radi veće čitljivosti pravila u budućnosti se može dodati `data.keys().hasAll(...)`. **Rutirati: Muse.** |
| **SEC-04** | LOW (Info) | `firebase/firestore.rules` (L146, 203) | Pravila proveravaju pre-batch stanje baze kod simultanog batch upisa. | Arhitektonsko ograničenje Firestore engine-a. Klijentski kod već poziva `openDeletionLock` odvojeno pre brisanja. **Rutirati: Koordinator.** |

---

## 6. Zaključak i preporuka za sledeće korake

1. **Jezgro naloga je bezbednosno pripremljeno za integraciju ekrana:** Model podataka, pravila, brava i zaštita od trka stanja zadovoljavaju zahteve testirane matrice.
2. **Faza 04 ostaje `IN_PROGRESS`:** Implementacija React ekrana (prijava, odjava, podešavanja profila, brisanje naloga) pripada radniku **Muse** u `matchahead-auth-client`.
3. **Poštovanje 0 EUR mandata:** Ne aktivirati Cloud Functions niti plaćene cloud servise. Čišćenje brave rešiti kroz planirani server / Cloudflare Worker.
4. **Nema tajni ni produkcionih deploy akcija:** `.env.example` sadrži samo placeholder-e, a produkcioni projekat `matchahead` nije diran.
