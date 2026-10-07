# MatchAhead

MatchAhead je instalabilna React PWA na srpskom za praćenje fudbalskih i košarkaških utakmica i dodavanje izabranih termina u Google kalendar.

Aplikacija zahteva Google prijavu. Tokom pilot testa pristup je namenjen isključivo verifikovanom nalogu `mls.ivanovic@gmail.com`. Stvarni rasporedi dolaze iz zasebnog servisa; dostupnost takmičenja i pouzdanost satnice prikazuju se uz izvore. Produkcioni interfejs ne koristi demo utakmice.

## Lokalno pokretanje

Potrebni su Node.js 22 ili noviji i npm.

```sh
npm ci --prefix apps/web
npm --prefix apps/web run dev
```

Postavi javnu Firebase konfiguraciju u `apps/web/.env.local` (primer imena je u [.env.example](.env.example)):

```dotenv
VITE_FIREBASE_API_KEY=<javni-web-api-kljuc>
VITE_FIREBASE_AUTH_DOMAIN=matchahead.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=matchahead
VITE_FIREBASE_APP_ID=<firebase-web-app-id>
VITE_FIREBASE_MESSAGING_SENDER_ID=298957530037
VITE_FIREBASE_STORAGE_BUCKET=matchahead.firebasestorage.app
VITE_SCHEDULE_API_URL=https://matchahead-schedule.mls-ivanovic.workers.dev
```

Bez validne konfiguracije prijava i pristup aplikaciji nisu dostupni. Firebase Google provider i dozvoljeni domeni moraju biti podešeni za lokalni i objavljeni host. Admin ključevi i sportski API tokeni ne pripadaju Vite promenljivama niti browseru.

## Google kalendar

U tabu **Utakmice** korisnik bira sve dostupne utakmice ili označava pojedinačne, pa pokreće dodavanje u Google kalendar. Dozvola `calendar.events` za kalendar traži se pri toj radnji, odvojeno od osnovne prijave. Upisuje se u glavni kalendar naloga, sa trajanjem događaja od dva sata. Ako utakmica ima datum ali nema potvrđeno vreme, događaj koristi **17:00** uz napomenu **„Vreme nije poznato“**. Utakmici bez poznatog datuma ne izmišlja se termin. Otkazane, odložene i završene utakmice ne nude se za izvoz. Ponovni pokušaj proverava stabilni ID događaja i izbegava duplikate. Ovo je jednokratni upis: kasnije promene rasporeda ne menjaju već dodate događaje.

Google Calendar API je uključen na projektu `matchahead` preko CLI-ja:

```sh
gcloud services enable calendar-json.googleapis.com \
  --project matchahead --account mls.ivanovic@gmail.com
```

OAuth status **Testing** i lista sa jedinim test korisnikom `mls.ivanovic@gmail.com` zasebno su Google Auth Platform podešavanje. Klijentska provera naloga ne predstavlja dokaz da je Google OAuth publika podešena. Standardni `gcloud iam oauth-clients` upravlja IAM OAuth klijentima, a ne listom Google Workspace OAuth test korisnika. Aktuelna [Google uputstva za consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent) opisuju podešavanje publike i test korisnika u konzoli.

## Provere

```sh
node scripts/check-data-contracts.mjs
npm --prefix apps/web run check
npm --prefix apps/web run build
node scripts/check-pwa.mjs
```

Za raspored servis:

```sh
npm ci --prefix experiments/schedule-service
node scripts/check-schedule-service.mjs
```

Browser provere prijave i rasporeda koriste izolovane Firebase emulatore. U jednom terminalu pokreni:

```sh
firebase emulators:start --config firebase/browser-emulators.json \
  --project demo-matchahead --only auth,firestore
```

Zatim pokreni provere redom (Auth provera resetuje podatke tog lokalnog emulatora):

```sh
node apps/web/scripts/check-auth-browser.mjs
node apps/web/scripts/check-schedule-ui.mjs
```

Provera kalendara koristi emulator za prijavu i presretnute Calendar API odgovore; ne pravi stvarne Google događaje. `CHROME_PATH` može zadati putanju do Chromium/Chrome izvršne datoteke.

## Struktura i objava

- `apps/web/` — React, Firebase prijava, lična agenda, kalendar i PWA.
- `packages/domain/` — ugovori podataka i pravila domenskih modela.
- `experiments/schedule-service/` — servis stvarnih rasporeda i provera izvora.
- `firebase/` — Firestore pravila i provere naloga.
- `docs/` — razvojne odluke, dokazi i istorijski izveštaji.
- `plans/` — raniji planovi razvoja; opisi ranijih demo faza nisu aktuelni korisnički interfejs.

GitHub Actions gradi aplikaciju iz `main` i objavljuje je na [GitHub Pages](https://mlsivanovic.github.io/matchahead/). Firebase konfiguracija i adresa raspored servisa dolaze iz repository variables. Lokalne izmene nisu objavljene dok se ne pošalju na odgovarajuću granu i workflow uspešno završi. Push obaveštenja i automatska sinhronizacija rasporeda nisu potvrđene funkcionalnosti ovog zadatka.
