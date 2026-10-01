# Nezavisni pregled integrisanog Auth klijenta i lične DEMO agende (Faze 04 i 06)

**Datum:** 30. septembar 2026.  
**Pregledač:** Gemini CLI (nezavisni pregled klijenta)  
**Pregledani commit:** `d66b127` (`04 auth klijent: Google prijava, nalog, agenda veza i brisanje sa bravom.`)  
**Grana:** `mlsivanovic/matchahead-auth-client`  
**Referentni komiti u lancu:**  
- `5246e6d` — Izmeštanje brave brisanja u `accountTombstones` van stabla korisnika  
- `bbb2783` — Bezbednosni pregled jezgra naloga i Firestore pravila (Faza 04)  
- `c3b1d9b` — Samostalne UI komponente lične agende (Faza 06)  
- `1625323` — Pregled DOM verifikacije UI komponenti agende  

---

## 1. Sažetak (Executive Summary)

U ovom zadatku izvršen je sveobuhvatan, nezavisan pregled integrisanog klijentskog koda koji spaja Google autentifikaciju (Faza 04) i ličnu agendu utakmica (Faza 06). Pregledani commit `d66b127` uspešno objedinjuje:
1. **Lenjo inicijalizovanu Firebase sesiju** sa isključivo memorijskim Firestore kešom (`memoryLocalCache()`), sprečavajući curenje privatnih podataka na disk uređaja.
2. **Robusnu kontrolu stanja naloga** kroz `AccountGate` i `AccountController`, koji generacijskim tiketima eliminišu trke, kasne mrežne odgovore i mešanje podataka različitih korisnika.
3. **Povezivanje lične agende u korensku aplikaciju (`App.tsx`)**, gde se prikazuju `PersonalAgendaHome` na početnoj ruti i `PersonalAgendaScreen` na ruti `#/moje`.
4. **Izolaciju omiljenih klubova od agende**, gde omiljeni klubovi ostaju isključivo u profilu i nikada ne ulaze u listu praćenih klubova niti generišu utakmice.
5. **Autentifikovani unlink uređaja sa tajmerom** pre gašenja sesije, čime se poštuju Firestore bezbednosna pravila bez rizika od blokiranja lokalne odjave u vanmrežnim uslovima.
6. **Integraciju dvokoraka brisanja naloga sa tombstone bravom**, u potpunom skladu sa arhitekturom `5246e6d`, gde ponovna prijava na zakazan nalog samo dovršava brisanje bez otvaranja profila.

Svi identifikovani problemi tokom faze analize izvornog koda (Nalazi 1 do 6) detaljno su prijavljeni vlasniku promena (Muse) i koordinatoru, te su u celosti razrešeni i verifikovani u finalnom commitu `d66b127`.

**Konačna ocena:** **PRIHVATLJIVO (APPROVED)** bez blokirajućih nedostataka za prelazak u sledeću fazu.

---

## 2. Nalazi tokom pregleda i njihovo razrešenje

Tokom proaktivnog pregleda koda u radnom stablu, Gemini je identifikovao 6 konkretnih nedostataka koje je vlasnik koda (Muse) otklonio pre kreiranja commita `d66b127`:

### Nalaz 1: Nedostatak `.then` rukovaoca na `signInWithPopup` pri ponovnoj prijavi istog UID-a
- **Lokacija:** `apps/web/src/logic/use-account.ts`
- **Ozbiljnost:** Visoka (potencijalno zaglavljivanje aplikacije u statusu `working`).
- **Mehanizam:** Kada `deleteAccount` naiđe na `auth/requires-recent-login`, korisnik dobija grešku i dugme „Pokušaj ponovo“. Pri ponovnoj prijavi istim Google nalogom, Firebase Auth SDK ne mora okinuti `onAuthStateChanged` jer je korisnik identičan. Bez `.then` rukovaoca, kontroler ostaje trajno u stanju `working`, a brisanje se ne nastavlja.
- **Razrešenje u `d66b127`:** Uvedena funkcija `driveIdentity(db, identity, auth)` koja se eksplicitno poziva u `.then(credential => ...)` grani ukoliko je UID promenjen ili je aktivan `resumeNeeded` (status `error` ili postavljena zastavica brisanja).

### Nalaz 2: Propušten `onLocalClear(oldUid)` pri cross-tab odjavi i direktnoj zameni naloga
- **Lokacija:** `apps/web/src/logic/use-account.ts`
- **Ozbiljnost:** Srednja (curenje nacrta beleške i lokalnih DEMO izbora u drugi tab/nalog).
- **Mehanizam:** Kada korisnik klikne odjavu u Tabu 1, Tab 2 dobija `onAuthStateChanged(auth, null)`. Iako je kontroler prelazio u `signed-out`, `live.current.onLocalClear(oldUid)` nije bio pozivan u Tabu 2, pa su React stanje `draftNote` i `sessionStorage` podaci ostajali neočišćeni. Slično se dešavalo pri direktnoj zameni naloga bez prethodne odjave.
- **Razrešenje u `d66b127`:** U `handleUser`, i grana `!user && hadUser` i grana `lastUid !== user.uid` sada eksplicitno beleže `prevUid` i pozivaju `live.current.onLocalClear(prevUid)` pre podizanja nove sesije.

### Nalaz 3: Trka odjave i brze nove prijave uz uništavanje nove Firebase sesije
- **Lokacija:** `apps/web/src/logic/use-account.ts` i `apps/web/src/logic/firebase-app.ts`
- **Ozbiljnost:** Visoka (greška `Firebase App '[DEFAULT]' was deleted` ili prekid prijave drugog korisnika).
- **Mehanizam:** Pri odjavi korisnika A, UI se odmah postavlja u `signed-out` dok `removeDevice` čeka mrežni odziv do 5 sekundi. Ako korisnik B odmah klikne „Prijavi se“, nova sesija se inicijalizuje. Kada A-ov unlink završi, `.finally` je pozivao globalni `disposeFirebaseSession()`, uništavajući aktivnu bazu korisnika B. Dodatno, poziv `initializeApp` dok traje `deleteApp` prethodne instance dovodi do mrtve instance.
- **Razrešenje u `d66b127`:** Uvedena zastavica `retiring.current` i namenska funkcija `disposeSessionIfCurrent(target)`. Pri kliku na prijavu, ukoliko je gašenje prethodne sesije u toku, kod čeka `await disposeFirebaseSession()` pre kreiranja nove instance.

### Nalaz 4: `PrefsForm` key u `AccountPanel.tsx` sprečavao osvežavanje sa servera
- **Lokacija:** `apps/web/src/ui/AccountPanel.tsx`
- **Ozbiljnost:** Niska (UI desinhronizacija).
- **Mehanizam:** Komponenta `PrefsForm` je bila montirana sa `key={account.uid}`. Ako se profil korisnika osveži sa servera za isti UID, unutrašnje `useState` promenljive forme se nisu re-inicijalizovale.
- **Razrešenje u `d66b127`:** Forma sada prima `revision={account.profile.updatedAt}` i poseduje `useEffect` koji sinhronizuje polja sa servera sve dok korisnik nije lokalno započeo izmenu (`dirty` guard).

### Nalaz 5: Nekompatibilan prikaz proizvoljnih vremenskih zona u `screens.tsx`
- **Lokacija:** `apps/web/src/ui/screens.tsx`
- **Ozbiljnost:** Niska (prinudno svođenje važeće IANA zone uređaja na Beograd u padajućem meniju).
- **Mehanizam:** Dok je `AccountPanel` ispravno prependovao važeću zonu profila van liste od 4 grada, `SettingsScreen` u `screens.tsx` je forsirao `Europe/Belgrade`.
- **Razrešenje u `d66b127`:** Usklađeno kreiranjem `deviceZones = zones.includes(tz) ? zones : [tz, ...zones]`.

### Nalaz 6: Skrivena poruka o uspešnom brisanju naloga u `AccountPanel.tsx`
- **Lokacija:** `apps/web/src/ui/AccountPanel.tsx`
- **Ozbiljnost:** Srednja (korisnik ne dobija povratnu informaciju da je brisanje uspelo).
- **Mehanizam:** Kada brisanje uspe, kontroler postavlja status na `signed-out` uz poruku `Nalog je obrisan.`. Međutim, sekcija za `signed-out` u `AccountPanel` uopšte nije renderovala `account.message`.
- **Razrešenje u `d66b127`:** Dodato renderovanje `{account.message ? <p className="meta" role="status">{account.message}</p> : null}` u bloku odjavljenog stanja.

### Dodatna trka: Potiskivanje poruke o brisanju usled `onAuthStateChanged(null)` događaja
- **Lokacija:** `apps/web/src/logic/account-controller.ts`
- **Mehanizam:** Poziv `deleteUser()` okida `onAuthStateChanged(auth, null)` koji poziva `handleIdentity(null, null, ...)`, što podiže generaciju gejta pre nego što se `resumeAccountDeletion` razreši. Kada brisanje završi, `shouldApply(ticket)` bi vratio `false` i obrisao statusnu poruku.
- **Razrešenje u `d66b127`:** U kontroleru je implementirano pamćenje `keepDeleted` stanja i očuvanje `DELETED_MESSAGE` kada vlasnik naloga napušta sesiju, što je osigurano i novim jediničnim testom `brisanje zadržava potvrdu i posle null događaja Auth brisanja`.

---

## 3. Matrica verifikacije obaveznih zahteva

| Stavka verifikacije | Status | Mehanizam / Dokaz u kodu i testovima |
| :--- | :---: | :--- |
| **1. Google popup cancel / retry** | **POTVRĐENO** | Otkazivanje pop-upa (`auth/popup-closed-by-user`, `auth/cancelled-popup-request`) mapira se u bezbednu poruku bez otkrivanja internih detalja. Stanje prelazi u `error`, prikazuje se dugme „Pokušaj ponovo“. Dokazano u `check-auth-browser.mjs` (`cancel-klik`, `cancel-popup`, `cancel-poruka`). |
| **2. Višestruki isti / različiti UID (in->out->in)** | **POTVRĐENO** | Potpuno očišćena sesija i re-inicijalizacija Auth observera. Podaci korisnika A ne prelaze na korisnika B; relogin korisnika A vraća sve njegove pratioce i omiljene. Dokazano u testovima `ciklus-1-out`, `ciklus-1-in`, `ciklus-2-out`, `ciklus-2-in`, `relogin-a`. |
| **3. Direktna zamena naloga i cross-tab odjava** | **POTVRĐENO** | `prepareSwitch(newUid)` i `handleUser(null)` brišu memorijske podatke i pozivaju `onLocalClear(oldUid)`. Zatvaranje sesije u drugom tabu čisti React stanje i lokalni storage. Dokazano u testovima `crosstab-out`, `crosstab-cisti`, `crosstab-relogin`. |
| **4. Odbacivanje zastarelih rezultata (stale popup/read/write)** | **POTVRĐENO** | Svaka promena stanja uvećava `AccountGate.generation`. Svaka asinhrona operacija poseduje `AccountTicket`. Ako se nalog promeni tokom mrežnog poziva, povratna vrednost se tiho ignoriše. Dokazano u `apps/web/test/auth-client.test.ts`. |
| **5. Trenutno čišćenje privatnih lista i memorijski keš** | **POTVRĐENO** | `clearPrivate()` odmah prazni `followedTeamIds`, `manualFixtureIds`, `favoriteTeamIds`, `profile` i `email`. Firestore je konfigurisan isključivo sa `memoryLocalCache()`, bez pisanja privatnih dokumenata u IndexedDB. Dokazano statičkom analizom i testom `izvorni kod jezgra ne ugrađuje javni ključ ni trajni Firestore keš`. |
| **6. Autentifikovani unlink uređaja uz bounded timeout** | **POTVRĐENO** | `removeDevice` se izvršava dok je korisnik još uvek autentifikovan (`request.auth.uid == uid`). Poziv je zaštićen sa `this.bounded(..., 5000)`. Ako mreža padne ili emulator visi, odjava se nastavlja nakon isteka tajmera bez blokiranja UI-ja. Dokazano u testu `zaglavljeni unlink ne blokira lokalnu odjavu`. |
| **7. Brzi klikovi (omiljeni, praćenja, ručni izbori)** | **POTVRĐENO** | `AccountController.mutationQueue` serijalizuje sve upise; svaki upis prvo radi sveže čitanje pod važećim tiketom pa tek onda primenjuje izmenu. Dokazano u testu `brzi uzastopni klikovi na omiljene ne gaze jedan drugi`. |
| **8. Konzistentan prikaz i čuvanje proizvoljne zone** | **POTVRĐENO** | `timeZoneForDisplay` validira format regularnim izrazom i `Intl.DateTimeFormat` proverom. Proizvoljna važeća IANA zona uređaja ili profila se dodaje u padajući meni i ne prepisuje se Beogradom. Dokazano u testovima `zona profila je overlay` i `prefs-server`. |
| **9. Brava brisanja proverena pre učitavanja i reauth nastavak** | **POTVRĐENO** | `openUnder` prvo proverava `isDeletionOpen(db, uid)` i lokalnu zastavicu. Ako je brisanje u toku, profil se ne učitava niti ponovo kreira. Ako je prijava zastarela, ponovna prijava samo dovršava brisanje Auth korisnika. Dokazano u `brava-ostaje`, `brava-bez-profila`, `profil-c-obrisan`. |
| **10. Realna perzistencija u dva browser konteksta** | **POTVRĐENO** | Verifikovano na pravom Chromium headless pretraživaču preko REST API-ja i višestrukih tabova. Korisnik A vidi svoje podatke nakon osvežavanja stranice; korisnik B u drugom tabu ima potpuno prazne liste. |
| **11. Odsustvo push i Calendar dozvola pri prijavi** | **POTVRĐENO** | U celom toku prijave ne postoji poziv `Notification.requestPermission()`, `getToken()` niti traženje Google Calendar OAuth opsega (`GoogleAuthProvider` koristi podrazumevane scope-ove za email/profil). |
| **12. Jedan Service Worker, bazna putanja i offline omotač** | **POTVRĐENO** | Aplikacija koristi tačno jedan Service Worker (`sw.ts`, izgrađen kao `sw.js` u korenu baze). Precaching sadrži 13 stavki uključujući `demo-schedule.json`. Prekid mreže ostavlja aplikaciju potpuno operativnom. Dokazano u `check-pwa.mjs`. |
| **13. Otpornost nepodešenog javnog DEMO režima** | **POTVRĐENO** | Kada su environment promenljive prazne, klijent prelazi u `unconfigured` status uz jasnu poruku: „Google prijava nije podešena na ovom izdanju. Niko nije prijavljen. DEMO raspored radi bez naloga.“ Dokazano u `check-auth-browser.mjs` (korak 0) i `auth-client.test.ts`. |
| **14. Rigoroznost i značenje tvrdnji u testovima** | **POTVRĐENO** | Provereno da nijedan test ne maskira greške sa `exit 0`, da `check-auth-browser.mjs` proverava direktno stanje u Firestore emulatoru (npr. nestanak dokumenta uređaja, prisustvo tombstone-a), i da se pre svake tvrdnje u DOM-u čeka eksplicitan element. |

---

## 4. Izvršene nezavisne provere i rezultati

Sve provere su pokrenute u čistom radnom stablu nakon commita `d66b127`.

### 4.1. Statička provera tipova (TypeScript)
```bash
./apps/web/node_modules/.bin/tsc --noEmit -p apps/web
```
- **Ishod:** **0 grešaka** (čisto prolazi).

### 4.2. Jedinični testovi domena
```bash
node --experimental-strip-types --test packages/domain/test/*.test.ts
```
- **Ishod:** **24/24 PASS** (trajanje: 116 ms).

### 4.3. Ugovori podataka
```bash
node scripts/check-data-contracts.mjs
```
- **Ishod:** **24/24 PASS** (trajanje: 125 ms).

### 4.4. Jedinični testovi klijentske aplikacije
```bash
node --experimental-strip-types --test apps/web/test/*.test.ts
```
- **Ishod:** **63/63 PASS** (trajanje: 254 ms). Pokriva kompletnu logiku kontrolera, gejta, agende, lokalnog skladišta, keš politike i rute.

### 4.5. Emulator testovi izolacije (Firestore pravila i Auth)
```bash
node scripts/check-auth.mjs
```
- **Ishod:** **4 unit domain + 5 unit web + 6/6 emulator testova PASS** (trajanje: 2.8 s).
- Potvrđeno: Pravila na Firestore emulatoru odbijaju pristup tuđim podacima, zabranjuju izmenu zaključanog naloga u procesu brisanja, sprečavaju upis uređaja bez vlasnika i odbacuju klubove van definisana 4 tima.

### 4.6. PWA integracioni test
```bash
node apps/web/scripts/check-pwa.mjs
```
- **Ishod:** **11/11 PASS** (uključujući offline servisiranje omotača i rasporeda, detekciju 360px širine, registraciju jednog workera, i odsustvo OAuth keširanja).

### 4.7. Pravi headless browser test na izolovanim emulatorima
```bash
node apps/web/scripts/check-auth-browser.mjs
```
- **Ishod:** **49/49 PASS** (pravi Chromium proces, pravi Google popup tok kroz emulator widget, kompletna matrica sa dva naloga, višekratnim ciklusima prijave/odjave, cross-tab propagacijom, proverom otkazanog pop-upa i brisanjem naloga uz proveru `accountTombstones`).

### 4.8. Nezavisna provera u potpuno svežem browser kontekstu (incognito context)
Autorov test u `check-auth-browser.mjs` koristi drugi tab u istom browser kontekstu (čime dokazuje deljeno skladište i cross-tab odjavu). Da bi se potvrdilo da se profil i podešavanja stvarno prenose preko Firestore mreže na drugi uređaj / novi pregledač (a ne preko `localStorage`), Gemini je pokrenuo namenski test sa `browser.createBrowserContext()` (čisti kukiji, prazan `localStorage` i `sessionStorage`):
- Prijava na svežem kontekstu kao `ana@example.com` kroz emulator widget.
- **Rezultat:** `pressedFavorites = 1` (`football:rs:crvena-zvezda`), `selectedZone = 'UTC'` (vrednosti sačuvane u koraku 7 prethodnog testa).
- **Ishod:** **POTVRĐENO.** Firestore podaci profila i omiljenih se uspešno prenose na potpuno nezavisan kontekst pregledača bez deljenog lokalnog skladišta (pri čemu fizički drugi uređaj ostaje odvojen u pogledu push tokena u fazi 09).

### 4.9. Verifikacija responzivnosti na 360 px (bez horizontalnog skrolovanja)
Pokrenut namenski Puppeteer pregled nad sveže izgrađenim bundle-om za sve četiri glavne rute:
- `/#/` (Home / Početna) -> `scrollWidth = 360`, `clientWidth = 360`
- `/#/moje` (Mine / Moje utakmice) -> `scrollWidth = 360`, `clientWidth = 360`
- `/#/klubovi` (Clubs / Klubovi) -> `scrollWidth = 360`, `clientWidth = 360`
- `/#/podesavanja` (Settings / Podešavanja) -> `scrollWidth = 360`, `clientWidth = 360`
- **Ishod:** **Nema horizontalnog skrolovanja na uskim ekranima.** Snimci ekrana su uspešno generisani u `/tmp/matchahead-screenshots/` van git stabla.

---

## 5. Dokumentovane granice i tehničke preporuke

1. **Emulator naspram produkcionog Google OAuth-a:**  
   Pravi popup tok je verifikovan protiv Firebase Auth emulator widgeta (koji simulira popup prozor, unos emaila i izbor postojećeg naloga). Ponašanje pravih Google servera (npr. Google OneTap ili specifični mobilni Safari popup blokeri) zahtevaće verifikaciju u produkcionom pilotu.
2. **`auth/requires-recent-login` tok:**  
   U emulator okruženju sesija je uvek sveža, pa se `requires-recent-login` ne može prirodno izazvati u browser testu. Ovaj scenario je temeljno pokriven sintetičkim jediničnim testom u `auth-client.test.ts` i potvrđeno je da kontroler ne skida zastavicu brisanja i uspešno nastavlja brisanje pri novoj prijavi.
3. **Čišćenje tombstona na backendu:**  
   Klijent ispravno postavlja `accountTombstones/{uid}` na status `in_progress`. Pravila zabranjuju klijentu da briše ili menja ovaj zapis. Konačno brisanje tombstone zapisa ostaje odgovornost serverskog posla / Cloudflare Workera, što je u skladu sa arhitektonskom odlukom iz faze 04.
4. **Environment konfiguracija i GitHub Variables:**  
   `.github/workflows/pages.yml` je ispravno konfigurisan da mapira javne Firebase parametre iz GitHub Repository Variables. Handoff dokument pominje pending status podešavanja varijabli na repozitorijumu — ovo je operativni korak za koordinatora pre deploy-a, dok klijentski kod ostaje potpuno tolerantan na prazne varijable (fallback na DEMO).

---

## 6. Zaključak

Commit `d66b127` u potpunosti ispunjava sve funkcionalne, bezbednosne i arhitektonske zahteve integracije Faza 04 i 06. Kod je čist, tipski bezbedan, poseduje kompletnu test pokrivenost (od jediničnih testova do realnog headless browsera) i spreman je za spajanje.
