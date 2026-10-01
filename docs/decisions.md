# Odluke projekta

Početno stanje, pre zadatka 01: priprema projekta, bez implementacije i bez izvršenih integracionih provera. Posle zadatka 01 važi odluka ispod.

## Potvrđeni zahtevi

- Korisnik je izabrao ime **MatchAhead**. Projektni folder je `/home/mls/GIT/MatchAhead`, a slug `matchahead`. Ime važi za UI, PWA manifest i namenski Google Calendar kalendar.

- Jedna razvojna celina po zasebnom Grok tasku/promptu. Svaki task nastavlja isti projekat i čita stanje iz datoteka.
- Instalabilna višekorisnička PWA na srpskom, Google prijava, Firebase Spark i GitHub Pages.
- Budžet 0 €, bez uključivanja naplate.
- Fudbal i košarka; u prvoj verziji izbor je ograničen na FK/KK Crvenu zvezdu i FK/KK Partizan. Za svaki izabrani tim traže se svi objavljeni mečevi iz relevantnih domaćih, regionalnih i evropskih takmičenja. Protivnici u utakmicama nisu ograničeni na ova dva kluba.
- Automatska ICS pretplata uz prihvaćeno kašnjenje Google osvežavanja i ručni Calendar upis.
- Prave PWA push notifikacije i kada je aplikacija zatvorena.
- Lična hronološka agenda sa jasno izdvojenom sledećom utakmicom.
- Korisnik pokreće pronalaženje rasporeda na klik za sport, klub i sezonu; redovno automatsko osvežavanje sportskih podataka nije potrebno. Kasnije može ručno osvežiti raspored. Potrebno je pokazati datum poslednje provere i razliku između tada objavljenih i još neobjavljenih mečeva.

## Odluka 01 — besplatni izvori, 26. septembar 2026.

Zadatak 01. Razlog: potpuna pokrivenost mora biti dokazana pre adaptera.

Dokaz je u `docs/data-feasibility.md`. TheSportsDB javni ključ vraća najviše 15 utakmica sezone i jednu narednu utakmicu. API-Football i API-Basketball nisu pozvani jer nema ključa. football-data.org ne pokriva srpska takmičenja ni košarku. Uslovi API-Sports ne daju licencu za javnu objavu. Više naloga radi kvote i svaki plaćeni plan ostaju van budžeta.

Posledica: zahtev „sve utakmice” nije ispunjen. Sledeći zadatak ne sme da tretira raspored kao rešen niti da ugradi plaćeni servis. API-Sports se može proveriti jednim besplatnim nalogom i po jednim pozivom za sezonu 2026, ključem van repozitorijuma. Korisnikovo naknadno pojašnjenje otvara i proveru drugih izvora u toku na zahtev, opisanu u `docs/data-alternatives.md` i zadatku 01B. Tu proveru zatvara odluka 01B.

Migracija: nema, ugovor se uvodi prvi put.

Identiteti koje ugovor fiksira:

- Tim: `{sport}:{država}:{slug}`. FK i KK Partizan su `football:rs:partizan` i `basketball:rs:partizan`.
- Utakmica: `{sport}:{competitionId}:{seasonId}:{provider}:{providerFixtureId}`. Termin i sponzorsko ime nisu deo ID-ja.
- `startsAtUtc` je potvrđen trenutak sa zonom ili je null. Nepoznata satnica ne postaje 00:00.
- `unpublished` i `source_error` su različiti. Prazan odgovor ne otkazuje utakmicu i ne briše poslednji dobar raspored.
- Isti sadržaj ne podiže `revision`. `fetchedAt` nije deo heša.
- Sportski API ne zove pregledač. Zajednički keš na izričit klik zamenjuje raniji predlog ciklusa na tri sata. Broj korisnika ne množi pozive dok je keš svež. To je dopunjeno odlukom 01B.

## Odluka 01B — pronalazak na klik, 26. septembar 2026.

Zadatak 01B. Razlog: korisnik traži sve tada objavljene buduće utakmice na dugme, bez stalnog preuzimanja.

Dokaz je u `docs/data-on-demand-feasibility.md`. FSS objavljuje superligaške parove, a budući sat ispisuje kao 00:00 ili ga ostavlja praznim. Fixtur.es za iste mečeve ispisuje 02:00 u letnjem i 01:00 u zimskom računanju vremena, što je lokalni prikaz ponoći UTC; odigrani derbi na istim stranicama ima 19:00. UEFA je objavila ligašku fazu Lige konferencije za FK Crvenu zvezdu, sa satom samo tamo gde je sat ispisan, i bez izvučenog nokauta. ABA ima deo kola sa CET satom i prvo kolo kao TBA. Evroliga ima objavljenu regularnu sezonu i neizvučene kasnije faze. KLS i Kup Koraća za ova dva košarkaška kluba nisu objavljeni. Kup Srbije za ova dva fudbalska kluba nije izvučen.

Ni jedan od tih izvora nema potvrđeno pravo da MatchAhead njihov raspored upiše u agendu, javni JSON ili svoj ICS. Fixtur.es i UEFA nude korisniku sopstvenu pretplatu ili dugme. To nije dozvola za unos. Nedokumentovani Evroliga endpoint i plaćeni planovi ostaju van plana. API-Sports i dalje nije pozvan.

Lokalna funkcija `findFixtures` nad sintetičkim odgovorima prolazi 9 novih provera. Komanda `node scripts/check-data-contracts.mjs`: 19 prolaza, 0 padova.

Posledica: faza 05 sme da prikaže pokrivenost i link ka tuđoj pretplati. Ne sme da napuni proizvod tuđim utakmicama dok pravo i pokrivenost nisu oba potvrđeni. Skup dozvoljenih izvora za unos je prazan.

Keš koji ova odluka fiksira, kad dozvoljeni izvor jednog dana postoji:

- ključ je tim i sezona, zajednički za korisnike;
- prikaz važi 6 časova;
- ni ručno osvežavanje ne zove izvor pre 15 minuta;
- razmak od 15 minuta sam pravi i do 96 svežih nalaza dnevno po ključu, pa mora postojati i globalni dnevni plafon;
- server je Cloudflare Worker Free. Pregledač ne drži ključ. Više od 50 spoljnih podzahteva ne staje u jednu besplatnu invokaciju.

Migracija identiteta: nema. Menja se samo rečenica iz odluke 01 o tome ko zove izvor. Ciklus na tri sata nije proizvodni tok. Poziv ostaje van pregledača, na izričit klik, kroz zajednički keš.

## Odluka 01C — izbor klubova, 27. septembar 2026.

Korisnik je izričito ograničio izbor u aplikaciji na Crvenu zvezdu i Partizan. U oba sporta to su četiri različita tima sa postojećim ID-jevima: `football:rs:crvena-zvezda`, `football:rs:partizan`, `basketball:rs:crvena-zvezda` i `basketball:rs:partizan`.

Posledica: `packages/domain/src/selectable-teams.ts` je jedini katalog za izbor. `findFixtures` odbija upit za druge klubove. Budući UI, serverski endpoint i Firestore pravila moraju koristiti isti skup. Ovo ne ograničava protivnike prikazane u pronađenim utakmicama niti kasnije proširenje kataloga. Nema migracije, jer korisnička baza još ne postoji. Lokalno je provereno 20/20 domenskih testova. Push faza 02 je posle toga vođena odlukom 02 i ostala je BLOCKED.

## Odluka 02 — push proba, 27. septembar 2026.

Zadatak 02. Razlog: zatvorena PWA traži serversko slanje, a browser tajmer nije pouzdan alarm.

Dokaz je u `docs/push-feasibility.md`. Aktuelni web SDK, `firebase` 12.19.0, registruje uređaj preko `register()` i `onRegistered()`. Identifikator je Firebase Installation ID, 22 znaka, obrazac `^[cdef][\w-]{21}$`. Serversko telo koristi `message.fid`. `getToken()` i polje `message.token` su zastareli i proba ih ne šalje.

Server je Cloudflare Worker bez `firebase-admin`. OAuth opseg je samo `https://www.googleapis.com/auth/firebase.messaging`. Uloga treba da bude Firebase Cloud Messaging API Admin. Privatni ključ nije u pregledaču. Probni endpoint je ugašen dok `PROBE_SEND_ENABLED` nije `1`, traži ključ probe i šalje samo na sopstvenu registraciju.

Lokalni workerd, 27. septembra 2026: medijana hladnog potpisa 2 ms, obnova 1 ms, toplo stanje 0 ms. Namerno mrežno čekanje od 42 ms nije računato kao CPU. Besplatni limit je i dalje 10 ms i za HTTP i za cron, prema stranici limita od 5. septembra 2026. Edge `cpuTime` nije izmeren. Startup profil je lokalni i ima jedan uzorak.

Android i iPhone su NOT_TESTED. Nema Firebase projekta, Cloudflare naloga, HTTPS adrese ni telefona. Desktop provera na localhost nije isporuka.

Posledica: kandidat ostaje Worker Free i FCM HTTP v1. Cron se ne uključuje u ovoj fazi. `notifJobs` ostaju za fazu 10. Polje `fid` je ime koje faze 04 i 09 koriste, bez paralelnog `fcmToken`. Ako `followedTeamId` postoji, mora biti iz `selectableTeams`. Protivnik nije ograničen. Ako edge kasnije pređe 10 ms, traži se drugi besplatan server ili manji batch. Naplata se ne uključuje. Push nije rešen dok poruka ne stigne na zatvorenu PWA.

Migracija: nema korisničke baze.

## Odluka 03 — PWA osnova, 27. septembar 2026.

Zadatak 03. Razlog: instalacija, offline prikaz i navigacija na GitHub Pages putanji ne zavise od push isporuke ni od sportskog izvora.

Dokaz je u `docs/handoffs/03-pwa-osnova.md`. Aplikacija je `apps/web`, React 19.3.0, TypeScript 5.9.3 i Vite 7.3.6. Podrazumevana produkciona baza je `/matchahead/`. Provera je rađena sa `MATCHAHEAD_BASE=/repo/`, jer sajt projekta nije u korenu `github.io` domena. Manifest `id`, `scope` i `start_url` jednaki su toj bazi. `id` se ne menja između deploya iste putanje.

Rute su hash rute (`#/`, `#/moje`, `#/klubovi`, `#/podesavanja`). Stranica dodatno skreće `/repo/klubovi` na `#/klubovi`, i kad service worker već služi `index.html`. Osvežavanje hash adrese ostaje na istom ekranu.

Jedan worker je `src/sw.ts`. Vite PWA plugin ga gradi kroz `injectManifest` i ne registruje ga sam. Stranica zove `navigator.serviceWorker.register` tačno jednom, sa scope-om baze. U izlazu nema `firebase-messaging-sw.js` ni `getToken(`. Budući FCM mora da uveze messaging u ovaj isti fajl i da dobije postojeću registraciju. Faza 02 time nije završena.

Keš razlikuje omotač i javni DEMO raspored. Google, OAuth i API odgovori idu na mrežu i ne ulaze u keš. Neuspeo novi omotač ne aktivira se, pa stari precache ostaje. Nova verzija čeka dugme. Dok je beleška puna ili je fokus u polju, stranica se ne učitava ponovo.

Javni fajl `public/data/demo-schedule.json` ima `kind: synthetic-demo`, `publication: forbidden` i `fetchedAt` 20. septembra 2026. Prag zastarelosti je 12 časova. Prikaz kaže da su podaci zastareli i da offline režim ne donosi sveže termine. Izbor kluba je samo `selectableTeams`. Protivnici su DEMO timovi van tog kataloga, uključujući gostovanje.

Lični unos ove faze živi u `sessionStorage` i nije nalog. Odjava briše tu sesiju i, kad uid postoji, samo ključeve `matchahead.user.{uid}.`. Tuđi uid i podešavanja uređaja ostaju. Google prijava nije uključena.

Posledica: faza 04 nastavlja ovaj omotač i ne dodaje drugi worker. Faza 05 i dalje nema šta da unese. Naplata nije uključena. Desktop Chrome je video instalabilnu aplikaciju i samostalni prozor. Aplikacija je objavljena i verifikovana na GitHub Pages (`https://mlsivanovic.github.io/matchahead/`, HTTP 200). Ikona na telefonu ostaje NOT_TESTED.

Migracija: nema korisničke baze.

## Predlozi koji još nisu dokazani

- Da besplatan API-Sports nalog uopšte vraća sezonu 2026/27 i da paginacija staje u 100 zahteva. Čak i tada uslovi ne daju pravo javne objave, pa uspešan poziv ne otvara unos.
- Da FCM i Worker Free stvarno isporuče poruku na zatvorenu PWA i da edge CPU ostane u 10 ms. Lokalni signal je u odluci 02. To nije PASS.
- React + TypeScript + Vite: instalirani su u `apps/web` odlukom 03. To nije dokaz prijave, kalendara ni pravog rasporeda.
- Početni katalog seniorskih muških timova i intervali podsetnika: radni predlozi iz specifikacije, ne naknadne potvrde korisnika.

## Evidencija narednih odluka

Svaku novu odluku zabeleži sa datumom, brojem zadatka, razlogom, dokazima, posledicama i eventualnom migracijom. Ne prepisuj neproveren predlog kao potvrđenu odluku.

## Odluka 05A — pokušaj i poslednji uspeh, 1. oktobar 2026.

HTTP ugovor je `POST /api/find-fixtures` sa sportom, jednim od četiri tima,
sezonom `2026-2027` i boolean `refresh`. Server računa vreme. Zajednički tipovi
žive u `packages/domain/src/schedule-api.ts`; početni commit `0a9ad3f`, integrisan
kao `076c5fc`. Domenska provera: 28/28 PASS.

`FindFixturesResult.checkedAt` sada dopušta `null`: nema izmišljene uspešne
provere pre prvog objavljenog dozvoljenog feed-a. Posle toga označava poslednji
snimak sa bar jednim uspešnim feed-om, a pojedinačni izvori imaju odvojene
`lastAttemptAt`, `lastSuccessAt` i `lastChangeAt` u manifestu. Poslednji pokušaj
služi ograničavanju poziva i pri neuspehu ne pomera poslednji uspeh.

Klijent mora da prihvati null i prikaže da uspešna provera još ne postoji.
Migracija nema korisničke podatke; raniji sportski keš bez dokaza uspeha ne
dobija novi izmišljeni timestamp. Ova odluka ne otvara produkciono korišćenje
izvora i ne označava fazu 05 DONE.

## Odluka 04 — checkpoint prvog talasa, 30. septembar 2026.

Run `run_b1cd86cb71c5`. Razlog: orkestracioni krug je završen bez finalnih dokaza klijenta/push-a; checkpoint mora biti IN_PROGRESS i tačan, bez izmišljenog uspeha.

- Faza 04 je IN_PROGRESS: jezgro (`user-account.ts`, `firestore.rules`, emulator pomoćnici) testirano u emulatoru; bezbednosna matrica `docs/reviews/04-account-core.md` PASS uz evidentirana ograničenja (batch pre-state, sintetički `requires-recent-login`, klijentsko brisanje). Ekran, adapter, živa Google prijava i deploy pravila nisu urađeni.
- Faza 06 je IN_PROGRESS: logika i samostalne komponente verifikovane nad DEMO podacima (DOM pregled 13/13, 2 mane + 3 zapažanja). Integracija u `App.tsx`/`screens.tsx` čeka koordinatora. DONE se priznaje samo za kriterijume koje je finalni pregled dokazao.
- Faza 05 je BLOCKED: odobren izvor nedostaje; javni rasporedi ostaju DEMO. Dozvola Fixtur.es (i drugih izvora) za unos u MatchAhead je nepotvrđena — bez pravnih zaključaka o tuđim uslovima.
- Infrastruktura: Firebase projekat `matchahead` postoji; Firestore `FIRESTORE_NATIVE`, multi-region `eur3`, `freeTier: true`; naplata read-only proverena (`gcloud billing projects describe matchahead --format='json(billingEnabled)'` → `billingEnabled: false`). Auth nalazi utvrđeni read-only REST pozivima (`defaultSupportedIdpConfigs/google.com`, `admin/v2/projects/matchahead/config`) — ilustrativna `gcloud identity providers` komanda se ne navodi kao dokaz. Cloudflare nalog i worker `matchahead-push-probe` postoje; plan naloga nije verifikovan dokazom. Pages: `be48495` važi dok koordinator ne pošalje dokaz nove objave.
- Push dokaz: cilj je PWA zatvorena pre slanja sa odvojenog pošiljaoca — NE Force stop, NE gašenje browsera, NE „pošalji pa zatvori”. Android dostupan po korisniku, iPhone nepotvrđen; nijedan fizički push test nije izvršen. Tajne se ne ispisuju (`echo` zabranjen), unos interaktivan, datoteke sa pravima 600.
- Faze 07 (ICS), 08 (separateCalendarOAuth, odvojeno od 04), 09 (pushdevice), 10 (serverCron), 11 (E2E), 12 (pilot) su planirane, nisu implementirane.
- Devijacije: Muse ručno uz odobrenje korisnika; Gemini `worker_done` odbijen (nedostaje sposobnost) — proverene isporuke preuzete, radnik zaustavljen/oslobođen, ne evidentira se kao prihvaćen završetak.

Migracija: nema.

## Odluka 02A — push ugovor, prag tajne i kapije (doc patch 30. septembar 2026. nad `d582885`)

Razlog: operatori su u `docs/push-readiness-review.md` dobijali zastareli protokol (`registrationSecret` u telu, `/api/probe/unregister`, vidljive labele, `openssl rand -hex 24`).

- Važeći HTTP ugovor (isti za živi snop `2ee78270...` i repo `6af69c1`): `POST /api/registrations` sa `x-matchahead-enroll` + `{"fid"}` → 201 `{registrationId, selfSendKey}` (32 slučajna bajta base64url, 43 znaka; server čuva samo SHA-256); `POST /api/probe/send` prima tačno jedno polje `registrationId` uz `Authorization: Bearer <selfSendKey>`; odjava je `DELETE /api/registrations/<registrationId>` uz isti Bearer; `/api/probe/unregister` ne postoji. UI ne ispisuje ID/ključ — 201 se prepisuje iz browser Network zapisa (Android remote debugging po potrebi).
- Prag upisne tajne: bar 32 znaka i bar 16 različitih znakova (inače 503 `enroll_weak`). Generator: `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'` u privatnu datoteku 0600 van repozitorijuma, bez ispisa tajne, uz opcionu proveru/ponavljanje do 16 različitih; `hex 24` je nepouzdan i zabranjen. Unos tajni samo interaktivno ili iz datoteke — bez literala u komandnoj liniji/istoriji/URL-u/dokumentaciji.
- Faza 02 ostaje BLOCKED: fizička isporuka na zatvorenoj PWA (Android dostupan, iPhone nepotvrđen) i edge `cpuTime` su NOT_TESTED; zatvaranje je swipe samo PWA kartice (bez Force stop/gašenja browsera/slanja-pa-zatvaranja). Dokaz ide sa odvojenog autorizovanog pošiljaoca. Kapije (`PROBE_ENROLL_SECRET`, `PROBE_SEND_ENABLED=1`) ostaju ugašene do posebno pregledane sesije; posle sesije vraćanje na ugašeno.
- Repo `6af69c1` je rekonstrukcija + 3 namerne razlike, nije bajt-identičan snopu i nije deployovan; živa migracija redova NOT_TESTED. Cloudflare Worker Free / plan naloga neverifikovan dokazom; Google `billingEnabled: false` verifikovano; budžet 0 €, naplata se ne uključuje. Stvarna slanja/živi upisi/čitanja tajni se ne izvode u ovom zadatku.

Dokaz: `docs/handoffs/02-push-reconciliation.md`, `docs/reviews/02-push-reconciliation.md` (27/27: 23 funkcionalna + 4 workerd).

Migracija: nema (budući deploy ponovo koristi tag `v1-probe-directory` i postojeći namespace, bez novog namespace-a).

## Odluka 05B — parsiranje u SQLite Durable Object-u, 1. oktobar 2026.

Razlog: primena običnog Worker Free limita od 10 ms na sav kod rasporeda napravila bi neopravdanu tehničku blokadu. Aktuelna [Cloudflare DO dokumentacija](https://developers.cloudflare.com/durable-objects/platform/limits/) navodi 30 sekundi CPU po DO zahtevu; [cenovnik](https://developers.cloudflare.com/durable-objects/platform/pricing/) potvrđuje SQLite DO na Free planu uz dnevne kvote i odbijanje operacija posle limita. To se razlikuje od [običnog Worker ingress-a](https://developers.cloudflare.com/workers/platform/limits/).

Odluka: jeftin ulazni Worker prosleđuje zahtev SQLite Durable Object-u; u DO se proveravaju autentifikacija, kvote, dozvola izvora, parsiranje i trajno sportsko stanje. Ne odbacivati HTML/PDF unapred zbog pretpostavljenih 10 ms. Podržane adaptere dokazati u workerd-u, sa granicom veličine i ukupnim IO rokovima. Testovi sintetičkih dozvola i stvarnih snimaka izvora ostaju odvojeni od produkcione dozvole i edge CPU dokaza.

Ovo je izbor implementacije, ne tvrdnja uspešnog izvršavanja: Grok ga još razvija. Plan konkretnog Cloudflare naloga nije potvrđen (read-only subscriptions API je odbio token sa 403); nije uvedena naplata niti urađen deploy. Izvori bez dokumentovane odluke ostaju `unknown` i ne objavljuju utakmice. Nema novog hostinga, periodičnog preuzimanja ni AI API-ja. Migracija nije izvršena; budući raspored koristi zaseban DO namespace i ne menja postojeći push namespace.
