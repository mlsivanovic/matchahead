# Predaja zadatka 02 — proba push notifikacija

Datum: 27. septembar 2026.
Status: BLOCKED

## Ostvaren rezultat

Izolovana proba postoji u `experiments/push-probe`. Korisnik na klik traži dozvolu, registracija ide preko Firebase Installation ID-ja, a zaštićeni worker šalje sintetičku FCM poruku čiji klik vodi na `/poruka.html?probe=synthetic&id=…`. Odbijena dozvola ne traži ponovo.

Stvarna isporuka nije viđena. Nema Firebase projekta, Cloudflare naloga, javne HTTPS adrese ni telefona. Android i iPhone su NOT_TESTED. Lokalni Chrome nije zamena za zatvorenu PWA.

## Izmenjene datoteke

- `docs/push-feasibility.md`
- `docs/progress.md`
- `docs/decisions.md`
- `docs/handoffs/02-proba-push-notifikacija.md`
- `README.md`
- `.env.example`
- `.gitignore`
- `scripts/check-push-probe.mjs`
- `experiments/push-probe/` — worker, PWA, testovi, `package.json` i `package-lock.json`

Izgrađeni `pwa/app.js`, `pwa/firebase-messaging-sw.js` i `dist/` nisu za git. Prave tajne nisu upisane.

## Izvršene provere i dokazi

`node scripts/check-push-probe.mjs`

22 testa, 22 prolaza, 0 padova. Posle toga klijent je izgrađen i sken nije našao privatni ključ u snopu.

`node scripts/check-data-contracts.mjs`

20 testova, 20 prolaza. Katalog od četiri kluba i dalje važi.

`node experiments/push-probe/scripts/measure-cpu.mjs`

Lokalni workerd preko Miniflare 5.20260926.0-alpha i workerd 1.20260926.1. Tajmer ide i bez mreže. Hladan potpis: 1, 2 i 2 ms, medijana 2. Obnova potpisa: medijana 1 ms. Topli keš: 0 ms. Razmena tokena: 42 ms namernog čekanja, nije CPU. Živi Google, FCM, Firestore i edge `cpuTime` nisu pozvani.

`npx wrangler check startup` u `experiments/push-probe`

Wrangler 4.142.0. Snop 28,35 KiB, gzip 7,56 KiB. Lokalni aktivni startup 0,0 ms, jedan uzorak, prozor 28,0 ms. Wrangler kaže da to nije Cloudflare startup.

Browser na `http://127.0.0.1:4173/`: učitavanje ne traži dozvolu; dupli klik broji jedan zahtev; odbijena dozvola gasi dugme; tačna i netačna test putanja se razlikuju; 390 px i 1280 px nemaju horizontalni preliv. Service worker je registrovan. FCM nije slao.

`adb` nije instaliran. `idevice_id -l` nije video iPhone. Nema `wrangler` prijave ni FCM ključa u okruženju. Direktorijum `~/.config/gcloud` postoji, ali `gcloud` naredbe nema i credentials baza nije čitana.

## Kriterijumi koji nisu ispunjeni

Test poruka se nije pojavila na zatvorenoj PWA. Klik na sistemsko obaveštenje nije proveren na uređaju. Edge CPU i živa Google autorizacija nisu izmereni. Zato celina nije DONE.

## Odluke i ugovori koje sledeći task mora sačuvati

- Identitet utakmice, prazan izvor, satovi 00:00/01:00/02:00 i prazan skup dozvoljenih izvora ostaju iz odluka 01 i 01B.
- `selectableTeams` je i dalje jedini katalog izbora. Protivnik nije ograničen.
- Push cilj je `fid`, ne registration token. Ne mešati `getToken()` i `register()`.
- Privatni ključ i slanje ostaju na workeru. Probni endpoint je podrazumevano ugašen.
- Jedan service worker po scope-u. Faza 03 ne sme da registruje drugi preko probe ili budućeg FCM worker-a.
- Cron za podsetnike nije uključen. `notifJobs` nisu definisani ovde.
- Nema naplate. Sintetička poruka nije utakmica.

## Potrebni pristupi i ručni koraci

Imena, bez vrednosti: `PROBE_SEND_ENABLED`, `PROBE_ENROLL_SECRET`, `FIREBASE_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `PUBLIC_BASE_URL`.

Javne vrednosti, i dalje prazne u `experiments/push-probe/pwa/config.json`: `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`, `vapidKey`.

Potrebni su Spark projekat, VAPID javni ključ, servisni nalog sa ulogom Firebase Cloud Messaging API Admin, besplatan Cloudflare nalog, HTTPS i po jedan Android i iPhone. Koraci su u `docs/push-feasibility.md`.

## Sledeći task

03 — instalabilna PWA i navigacija. Preduslov za service worker je odluka 02: jedan worker i FID put, bez tvrdnje da je push isporučen. Prvi korak je pročitati `plans/grok-faze/03-pwa-osnova.md`, `docs/progress.md`, `docs/decisions.md` i `docs/push-feasibility.md`.

Faza 05 i dalje čeka dopušten izvor. Ovaj dokument je ne pokreće.
