# 04 Auth klijent — browser prijava, nalog i veza sa agendom

## Status

Faza 04 browser klijent: Firebase Google prijava (samo na klik), Firestore
adapter/hook oko Grok-ovog jezgra, AccountPanel UI i vezivanje završene faze
06 (PersonalAgendaHome/Screen) u App. Brisanje naloga je vezano na finalno
jezgro 5246e6d (brava accountTombstones, reauth nastavlja samo Auth brisanje).

## Šta je urađeno

- Cherry-pick bez izmena jezgra: f9f7952, d0f8469 (agenda), 4e80cef (review
  izveštaj), 5246e6d (finalno jezgro brave), 5be2809 (bezbednosni review).
- Dva reviewed popravka iz agende: countdownLabel se potiskuje za izričit
  live status (ne protivreči bezbednoj oznaci početka); promena sporta u
  PersonalAgendaScreen poništava klub/takmičenje i opcije važe samo za
  izabrani sport (sportFilterChange, entriesForSport + testovi).
- Novi fajlovi klijenta (vlasništvo klijenta, jezgro netaknuto):
  - `apps/web/src/logic/firebase-app.ts` — lenja sesija, isključivo
    memorijski Firestore keš, terminate+deleteApp pri odjavi/zameni,
    browserLocalPersistence za Auth token (druga sesija obnavlja nalog),
    browserPopupRedirectResolver za popup tok, installationId uređaja.
  - `apps/web/src/logic/account-controller.ts` — kontroler oko AccountGate:
    generacijski tiketi odbacuju kasne rezultate tuđeg uid-a, red upisa sa
    svežim čitanjem pre pisanja (brzi klikovi ne gaze se), unlink uređaja
    dok je vlasnik autentifikovan uz tajmer (ne blokira odjavu), brisanje
    kroz openDeletionLock/deleteOwnedDocuments/resumeAccountDeletion bez
    skidanja brave, potvrda se čuva i preko null događaja ali nikad ne
    prelazi na novi uid.
  - `apps/web/src/logic/use-account.ts` — veza Auth <-> kontroler: prijava
    samo na klik, listener se vezuje na svaku novu Auth instancu
    (signOut->signIn ciklusi ostaju živi), gašenje stare pre nove sesije
    (initializeApp usred deleteApp pravi mrtvu instancu), popup rezultat
    eksplicitno vozi isti-uid nastavak (observer nekad ćuti), null iz
    drugog taba čisti React sesiju i keš, zastareli null odjek se ignoriše.
  - `apps/web/src/ui/AccountPanel.tsx` — prijava/odjava, omiljeni klubovi
    (odvojeno od praćenja, nikad ne ulaze u agendu), podešavanja naloga
    (zona, 30 min podrazumevano, 0/15/30/60, dve checkbox opcije),
    dvokorak brisanja. Sve na srpskom, bez push dozvola i Calendar OAuth.
- App: PersonalAgendaHome (home) i PersonalAgendaScreen (moje) umesto
  starih ekrana; hook daje samo aktivna praćenja/ručne izbore (omiljeni
  nikad); zona profila je overlay prikaza (timeZoneForDisplay, ne dira
  globalu); postojeći interval+visibilitychange osvežava now, bez novih
  tajmera; DEMO radi odjavljen i bez konfiguracije.
- `apps/web/src/logic/user-local.ts` (dozvoljena dopuna): lokalni DEMO
  ručni izbori u sesiji, jasno lokalni.
- `apps/web/src/ui/screens.tsx`: SettingsScreen prima account čvor;
  select zone uređaja i naloga prikazuju i važeću zonu van skraćene liste.
- `apps/web/test/auth-client.test.ts`: 16 testova životnog ciklusa
  (odjava/zamena/late, greške bez curenja, omiljeni odvojeni, red upisa,
  unlink redosled+timeout, brava/zastava/reauth nastavak, potvrda preko
  null događaja, bez prelaska na novi uid, lokalni DEMO, zona overlay).
- `apps/web/scripts/check-auth-browser.mjs`: 51 browser provera na
  izolovanim emulatorima (auth 9098, firestore 8081), pravi popup tok,
  dva identiteta, reload sesija, brzi ciklusi, prefs round-trip,
  cross-tab odjava, otkazani popup, brisanje sa bravom. Odjava veze
  uređaja se dokazuje posejanim dokumentima: važeći dokument tekuće
  instalacije + drugi uređaj potvrđeni pre odjave, posle odjave tekući
  nestao a drugi očuvan (klijent briše kao autentifikovani vlasnik pod
  živim pravilima; seed ide emulator admin API-jem). Sam bilda bundle,
  gasi browser/server u finally. Granice u zaglavlju.
- Blokirajuća popravka gašenja sesije (koordinatorski checkpoint):
  preklopljeni dispose čeka isto deljeno teardown obećanje (barijera),
  `ensureFirebaseSession` baca dok teardown traje umesto tihe reciklaže
  app-a, `disposeSessionIfCurrent` pridružuje tuđe gašenje pre spuštanja
  retiring zastavice, a prijava tokom sopstvene odjave čeka kraj te odjave
  (signOutSettled) umesto paralelnog gašenja koje ostavlja token pa nova
  sesija povraća starog korisnika.
- Vlasništvo zakašnjelih događaja značkom pokušaja, istim simbolima:
  `beginSignIn` vrati `{uid, seq, endedEpoch}` konkretnog pokušaja, kasni
  rejection je nosi u `noticeFailure(message, attempt)` — zastareli
  failure posle novog klika (seq), novog identiteta (uid) ili null-a koji
  zaista završava identitet (epoha) ostaje bez dejstva; null odjek bez
  vlasnika ne poništava tekući pokušaj (cancel putanja). Stari kod je
  novi nalog prebacivao u grešku i brisao mu privatne podatke; tekući
  pokušaj (uklj. offline) i dalje prikazuje svoju poruku. Sama
  generacija tiketa nije dovoljna (observer null diže generaciju bez
  promene vlasnika). Obe finally grane delegiraju lastUid na
  `settleUidAfterAccountEnd` (kraj starog postupka ne dira novijeg
  vlasnika). Sve creation putanje čekaju završetak gašenja pre ensure
  (signIn: kraj sopstvene odjave ili tuđa barijera; mount remount, cycle,
  switch: dispose barijera); ensure guard baca samo na zloupotrebu.
  Regresija:
  `test/session-teardown.test.ts` (stvarni firebase/app SDK, kontrolisani
  terminate: overlap, klik/remount barijera, ensure-guard; fail-first 3
  pada na starom kodu), `test/account-ownership.test.ts` (kontrolisani
  pending popup redosled istim simbolima: novi nalog, novi klik,
  dolazak+kraj identiteta, null odjek; fail-first 3 pada), plus
  pinovanje pravila `test/account-uid-settlement.test.ts` i disciplinu
  klik/remount barijere. Globalni
  mutable owner je odbačen: ne veže failure za konkretan pokušaj niti
  štiti isti uid (nalaz Gemini/msg_7c3c95201523; teardown guard
  msg_48809e0629bb).
- `apps/web/scripts/check-pwa.mjs`: popravljeno čekanje iscrtanog ekrana
  (hash-vs-render trka), id beleške vraćen na draft-note, offline tvrdnje
  usklađene sa ispražnjenom agendom (keširan raspored 200, prazna agenda,
  statička lista klubova).
- `.github/workflows/pages.yml`: VITE_FIREBASE_* iz repository VARIABLES
  (javne vrednosti; prazno = nepodešen DEMO). Bez emulator hostova u
  produkciji. Lokalno: ignorisani `apps/web/.env.local`.

## Provere (sve viđene u ovoj sesiji)

- Jedinični: apps/web 73/73, domain 24/24; `tsc --noEmit` čist;
  `vite build` uspešan (jedan SW, precache 13).
- Browser DOM na izolovanim emulatorima: 52/52 PASS (uključuje
  signInA->signOut->signInB, relogin istog naloga, 2 brza ciklusa,
  reload sesiju sa omiljenima, cross-tab čišćenje, otkazani popup,
  posejani unlink dokaz, brisanje C sa `Nalog je obrisan.`, tombstone
  tačno status/startedAt/updatedAt, A/B netaknuti). Pravi uzrok povremenih
  cancel prekida nađen /tmp marker-sondom: klik odmah po odjavi, dok je
  finally odjave još u letu — prijava je sama gasila sesiju uporedo sa
  signOutAuth, token je preživeo pa je nova sesija tiho povratila Anu
  umesto popup greške. Popravljeno: prijava čeka kraj sopstvene odjave
  (signOutSettled, bez paralelnog gašenja); trka dokazano daje odjavljeno
  stanje + poruku. Harness zatvara popup tek po spremnosti handlera;
  izmerena detekcija zatvaranja ~9–10s, čekanje 20s je 2x margina.
  Hipoteza o brisanju greške kasnim null odjekom je opovrgnuta i povučena.
- PWA: svih 11 PASS (offline omotač+raspored, update blokada, OAuth
  van keša, jedan SW, Pages baza).
- Greške koje su uhvaćene proverom pa popravljene: missing popup
  resolver (argument-error, bez popup-a); gašenje sesije usred popup-a
  (app-deleted) rešeno čekanjem teardown-a pre initializeApp; null odjek
  posle restore-a gasio novu sesiju (sada se ignoriše); potvrda brisanja
  se gubila kroz null događaj (sada se čuva, testirano i padom na staroj
  logici); brzi klikovi gazili profil (sada red + sveže čitanje).

## Granice (iskreno)

- Live Google popup/mobile NOT_TESTED (samo emulator widget tok).
- requires-recent-login je sintetički (fake) u jediničnim testovima;
  uživo nije izazvan — ponovna prijava vozi nastavak istim putem.
- Posle uspešnog deleteUser emulator dodeljuje novi uid, pa ponovna
  prijava istog uid-a na bravu nije merljiva uživo (pokriveno pravilima
  i jediničnim testovima).
- Drugi tab deli skladište: cross-tab provera, ne drugi uređaj.
- Server čišćenje brave je budući eksplicitni posao (po jezgru).
- Faza 09 push: samo čuvanje izbora, bez slanja; fid null.

## Otvoreno za koordinatora

- Repository VARIABLES VITE_FIREBASE_* (javne, klijentski config koji se
  ugrađuje u bundle) provereno postavljene: `gh variable list --repo
  mlsivanovic/matchahead` vraća svih 6 imena (API_KEY, APP_ID,
  AUTH_DOMAIN, MESSAGING_SENDER_ID, PROJECT_ID, STORAGE_BUCKET) sa
  updated oznakama 2026-10-01T12:45:21-23Z. Vrednosti se ne navode ovde;
  bez tajni. Commit ne gura sajt; integration je tvoj.
- Finalni core je već uključen (5246e6d); brisanje je vezano i dokazano
  u browseru. Nema izmena pravila/domena/jegra testova sa moje strane.
