# Proba push obaveštenja dok je PWA zatvorena

Datum: 27. septembar 2026.
Status faze 02: **BLOCKED**. Lokalni tok postoji. Stvarna isporuka na zatvorenoj PWA nije proverena.

Poruka u ovoj proveri je sintetička. Faze 01 i 01B nisu našle izvor koji sme da se unese u MatchAhead, pa proba ne pominje pravu utakmicu.

## Zaključak

Kandidat ostaje Cloudflare Worker Free i Firebase Cloud Messaging HTTP v1. Pregledač registruje instalaciju preko aktuelnog Firebase Installation ID API-ja. Server šalje samo na polje `fid`. Stari registration token se ne čuva i ne šalje.

Lokalni workerd meri potpis Google tokena ispod 10 ms. To nije merenje na Cloudflare edge-u i nije dokaz da je poruka stigla na telefon. Android i iPhone su `NOT_TESTED`. Fazu ne treba zvati završenom, niti uključivati naplatu.

## Uređaji

| Platforma | Ishod | Uslov |
| --- | --- | --- |
| Android | NOT_TESTED | Nema `adb` i nema povezanog uređaja. Nema javne HTTPS adrese. |
| iPhone / iPad | NOT_TESTED | `idevice_id -l` nije video uređaj. Nema instalacije na početni ekran i nema HTTPS adrese. |
| Desktop Chrome na localhost | Nije isporuka | Stranica, dozvola i test putanja rade lokalno. PWA nije zatvorena na telefonu i FCM nije pozvan. |

WebKit i dalje vezuje web push na iPhone-u i iPad-u za aplikaciju dodatu na početni ekran, od iOS/iPadOS 16.4, i za dozvolu na korisnički klik. To je uslov za budući test, ne rezultat ovog testa. Izvor: [WebKit, 16. februar 2023](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Šta je lokalno pokazano

Na `http://127.0.0.1:4173/`, 27. septembra 2026:

- stranica na učitavanju ne zove dozvolu;
- dupli klik na „Uključi obaveštenja” broji jedan zahtev i dugme ostaje onemogućeno dok browser ne odgovori;
- kad je dozvola odbijena, tekst kaže da se ne traži ponovo, a dugme je onemogućeno;
- „Registruj uređaj” pre dozvole ne registruje ništa;
- tačan upit na `/poruka.html?probe=synthetic&id=synthetic-…` piše da je putanja tačna;
- drugačiji `id` piše da putanja nije tačna;
- širina 390 i 1280 nema horizontalni preliv, dugme je visoko 48 px.

Service worker je registrovan na `http://127.0.0.1:4173/`. To nije sistemsko obaveštenje sa zatvorenom aplikacijom.

## Identifikator i SDK

Pregledano 27. septembra 2026:

- [FCM za web](https://firebase.google.com/docs/cloud-messaging/web/get-started), ažurirano 24. septembra 2026. Trenutni put je `register()` i `onRegistered()`. `getToken()` je označen kao zastareo.
- [JavaScript referenca](https://firebase.google.com/docs/reference/js/messaging.md), ažurirana 28. avgusta 2026. `register()` vraća FID kroz `onRegistered()`, ne kao povratnu vrednost.
- [REST `Message`](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages), ažurirano 8. septembra 2026. Polje `fid` je cilj. Polje `token` je zastarelo.
- npm `firebase` **12.19.0**. U njemu je `@firebase/messaging` 0.13.3.

FID format je preuzet iz `firebase-js-sdk` datoteke `packages/installations/src/helpers/generate-fid.ts`: `^[cdef][\w-]{21}$`, tačno 22 znaka. Prvi znak je `c`, `d`, `e` ili `f`. To nije OAuth token i nije stari FCM registration token. Registration token ima `:` ili je mnogo duži i server ga odbija sa `legacy_token_rejected`.

Klijent zove samo `register`, `onRegistered`, `unregister` i `onUnregistered`. Slanje je:

`POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`

sa telom `message.fid`. Nema `message.token`, `topic` ni `condition`.

Klik je `webpush.fcm_options.link`. Za probu je to `{javna baza}/poruka.html?probe=synthetic&id=synthetic-{uuid}`. Naslov je „MatchAhead proba”, tekst „Sintetička poruka. Ovo nije utakmica.” TTL je 300 sekundi, hitnost `high`.

Firebase vodič i dalje na jednom mestu pominje `getToken` u starijem primeru prijema. Ovaj kod prati stranicu za početak i oznaku zastarelosti u referenci, ne taj stariji primer. Izgrađeni SDK i dalje sadrži staru funkciju u sebi. Naš ulaz je ne zove. Provera čita izvor `src/client-entry.ts` i `src/sw-entry.ts`.

## Serversko slanje

Worker je `experiments/push-probe`. Nema `firebase-admin`. Autorizacija je kratak RS256 JWT iz PKCS8 ključa, opseg samo `https://www.googleapis.com/auth/firebase.messaging`. Test proverava potpis javnim ključem i odbija širi opseg.

Uloga naloga treba da bude **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`). Ne davati ulogu urednika ni Firebase Admin SDK administratora. Uključiti Firebase Cloud Messaging API i FCM Registration API. Plan projekta ostaje Spark. Blaze se ne uključuje.

Tajne su imena u `.env.example` i `experiments/push-probe/.dev.vars.example`. Vrednosti ne ulaze u git, PWA ni `config.json`. `config.json` sme da ima samo javne web vrednosti: `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` i javni VAPID ključ. Privatni VAPID ključ ostaje u Firebase konzoli.

`PROBE_SEND_ENABLED` mora biti `1`, inače su rute registracije, slanja i merenja 404. Registracija traži zaglavlje `X-MatchAhead-Enroll`. Slanje traži `Authorization: Bearer` jednokratnog ključa te registracije i šalje samo na FID sačuvan uz taj ključ. Telo ne sme da bira tuđi FID, naslov ni tekst. Tuđe poreklo i tajna u URL-u se odbijaju. Odgovor ne vraća FID, pristupni token ni privatni ključ. Tri slanja po registraciji na sat, 30 na worker u UTC danu, 10 registracija na sat.

Keš Google pristupnog tokena može da stoji u memoriji izolata ili u KV vezivanju `TOKEN_CACHE`, ključ `oauth:fcm-access-token`. KV u `wrangler.jsonc` nije vezan, jer namespace traži nalog. Pravi KV i pravi Firestore poziv su `NOT_TESTED`.

Cron namerno nije u konfiguraciji. Zakazivanje podsetnika je faza 10. Ovaj worker na satu ne šalje poruke.

Ako FCM vrati 404, registracija se briše da se ne ponavlja.

### Rotacija

1. U Google Cloud napravi novi ključ istog servisnog naloga.
2. `wrangler secret put FCM_PRIVATE_KEY` i, ako treba, `FCM_CLIENT_EMAIL`.
3. Sačekaj da stari pristupni token istekne, najviše oko sat vremena, pa onemogući stari ključ.
4. `PROBE_ENROLL_SECRET` se menja istom naredbom. Ko ga je uneo u stranicu mora da ga upiše ponovo.
5. VAPID par se rotira u Firebase konzoli. Posle toga svaka instalacija mora ponovo `register()`.
6. Ključ uređaja za slanje sebi živi samo u toj sesiji stranice. Odjava zove `unregister()` i briše registraciju.

PEM mora stati u 5 KB, koliko Workers dozvoljavaju za jednu promenljivu. PKCS8 ključ od 2048 bita staje. U jednom redu tajne, novi red se piše kao `\n`.

## Limiti i merenje

Stranica [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), ažurirana 5. septembra 2026:

| Stavka | Workers Free |
| --- | --- |
| Zahtevi | 100 000 na dan |
| CPU po HTTP zahtevu | 10 ms |
| CPU po Cron Triggeru | 10 ms |
| Čekanje na mrežu | nije CPU |
| Podzahtevi | 50 po invokaciji |
| Istovremene veze koje čekaju zaglavlje | 6 |
| Cron okidači na nalog | 5 |
| Veličina tajne | 5 KB |
| Startup globalnog opsega | 1 s |

Plaćeni plan ima mnogo veći CPU. Njega ne uključujemo. Cloudflare na istoj stranici kaže da teži poslovi sa autentikacijom često troše 10–20 ms. Zato proba ne uvlači Admin SDK, nego samo WebCrypto potpis.

Merenje je lokalni workerd preko Miniflare `5.20260926.0-alpha` i `workerd` `1.20260926.1`, isti par koji vuče Wrangler `4.142.0`. Tajmer u lokalnom workerd-u ide i bez mreže: petlja od 200 000 koraka je trajala 6 ms, pa `performance.now()` ovde sme da meri CPU deo. Na edge-u tajmer stoji dok nema I/O, pa bi isti broj tamo bio nevažeći. Edge `cpuTime` iz Workers Logs nije izmeren.

Pet hladnih izolata, potpis PKCS8 ključa od 2048 bita, uključujući `importKey`:

| Merenje | min | medijana | max |
| --- | --- | --- | --- |
| Hladan potpis | 1 ms | 2 ms | 2 ms |
| Topao keš, bez potpisa | 0 | 0 | 0 |
| Obnova potpisa | 1 ms | 1 ms | 1 ms |
| Čekanje razmene tokena | 42 ms | 42 ms | 42 ms |

Čekanje od 42 ms je namerno `setTimeout` od 40 ms u lažnom Google odgovoru. Nije CPU i nije poziv Google-u. Živi OAuth i živi FCM nisu pozvani.

`npx wrangler check startup` u istom danu: snop 28,35 KiB, gzip 7,56 KiB, lokalni aktivni startup 0,0 ms na jednom uzorku, prozor profila 28,0 ms. Wrangler sam kaže da lokalni profil nije isto što i startup na Cloudflare-u. Uzorak je jedan, pa je grub.

Parsiranje sintetičkog Firestore dokumenta lokalno je ispod razlučivosti tajmera, 0 ms. Živo čitanje Firestore-a je `NOT_TESTED`. Proba ga i ne zove pri slanju.

Računica za kasniji mali pilot, bez uključenog crona danas: cron na svaki minut bio bi 1 440 zahteva na dan, 1 000 slanja i 50 registracija daju 2 490 od 100 000. Topli poziv ima jedan FCM podzahtev, hladni još i razmenu tokena. Oba su ispod 50. To je aritmetika limita, ne izmerena edge potrošnja.

## Odluka

Arhitektura za nastavak je Worker Free, FCM HTTP v1 i FID. Frontend proizvoda i dalje treba da ostane na GitHub Pages. Ova proba je zaseban HTTPS origin da bi service worker i API delili origin dok nema naloga. Faza 03 ne sme da registruje drugi service worker preko istog scope-a. Klik kasnije mora da poštuje `PUBLIC_BASE_URL`, jer Pages sajt projekta nije u korenu domena.

Polje uređaja koje faze 04 i 09 smeju da čuvaju je `fid`. Paralelno polje `fcmToken` se ne uvodi. `followedTeamId`, ako postoji, mora biti jedan od četiri ID-ja iz `selectableTeams`. Protivnički naziv nije u tom katalogu i ne ulazi u tekst probe. Podsetnici, `notifJobs` i cron nisu deo ove faze.

Ako merenje na edge-u pokaže da potpis ili cela invokacija redovno prelazi 10 ms, sledeći korak je manji batch ili drugi besplatan server. Nije uključivanje naplate i nije zamena push-a toast porukom.

## Šta nedostaje da bi isporuka bila PASS

1. Firebase projekat na Sparku, bez billing naloga.
2. Web aplikacija i VAPID javni ključ u `experiments/push-probe/pwa/config.json`.
3. Servisni nalog sa ulogom Firebase Cloud Messaging API Admin. `FCM_PRIVATE_KEY` i `FCM_CLIENT_EMAIL` samo kao Workers secret.
4. Besplatan Cloudflare nalog i `npx wrangler login`, pa deploy ovog workera. `workers.dev` daje HTTPS bez plaćenog domena.
5. `PROBE_SEND_ENABLED=1` i `PROBE_ENROLL_SECRET` samo u secret store-u. Ključ se upisuje u stranicu, ne u repozitorijum.
6. Android telefon i podržani browser, PWA zatvorena, poruka vidljiva, klik otvara tačan `poruka.html` upit.
7. iPhone ili iPad na 16.4 ili novijem, stranica dodata na početni ekran, dozvola iz instalirane aplikacije, isti klik.
8. Posle deploya, Workers Logs za jedan hladan i jedan topao poziv: `cpuTime` odvojeno od wall time. Dok toga nema, edge CPU ostaje `NOT_TESTED`.

Lokalni pregled: `node scripts/check-push-probe.mjs` iz korena repozitorijuma. Merenje: `node scripts/measure-cpu.mjs` iz `experiments/push-probe`. Stranica: `npm run serve` u istom folderu, posle `npm run build:client`.
