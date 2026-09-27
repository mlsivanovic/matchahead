# Stalni kontekst za Grok — verzija 2.0

Datum: 26. septembar 2026. Ovaj dokument i pojedinačni zadaci zamenjuju raniji redosled šest velikih faza. Glavni plan ostaje referenca za istraživanje i domenska pravila; zahtevi verzije 2.0 imaju prednost pri sukobu.

## Potvrđeno sa korisnikom

- Ime aplikacije: **MatchAhead**. Slug projekta: `matchahead`. Koristi ovo ime u PWA manifestu, interfejsu i namenskom Calendar kalendaru.

- Višekorisnička PWA, prilagođena telefonu, srpski interfejs; instalacija je deo prve verzije.
- Google login, Firebase Auth i Firestore Spark; budžet 0 €, bez uključivanja naplate.
- GitHub Pages za frontend. GitHub Actions može graditi dozvoljene javne sportske podatke/ICS ako se takav način objave dokaže; nije obavezan periodični preuzimač. Za pretragu na klik proveriti potreban besplatan serverski sloj.
- Fudbal i košarka; u prvoj verziji korisnik može izabrati **samo Crvenu zvezdu ili Partizan** u izabranom sportu, dakle četiri odvojena tima: FK Crvena zvezda, FK Partizan, KK Crvena zvezda i KK Partizan. Protivnički klubovi se normalno prikazuju u utakmicama, ali nisu ponuđeni za izbor. Traže se objavljeni mečevi izabranog tima kroz domaća, regionalna i evropska takmičenja; stvarna pokrivenost izvora prvo mora biti dokazana. Jedini izvor izbora je `selectableTeams` iz `packages/domain/src/selectable-teams.ts`; isti allowlist važi u UI-u, API-ju i Firestore validaciji.
- Automatska ICS pretplata uz prihvaćeno kašnjenje Google osvežavanja i ručni izbor utakmica za Calendar.
- Prave PWA push notifikacije i kada je aplikacija zatvorena. Obaveštenja samo unutar otvorene aplikacije i Google podsetnici nisu zamena za ovaj zahtev.
- Pregled svih utakmica dodatih/praćenih kroz aplikaciju, hronološki redosled i jasno prikazana sledeća utakmica.
- Korisnik bira sport, klub i sezonu i pritiska **„Pronađi utakmice”**. Aplikacija tada traži sve trenutno objavljene buduće utakmice kroz relevantna takmičenja. Stalno automatsko preuzimanje sportskog rasporeda nije zahtev; kasnije korisnik sam bira „Osveži raspored”. Neobjavljene faze ne predstavljati kao pronađene. Ovaj noviji zahtev ima prednost nad starim predlogom preuzimanja na tri sata.

## Arhitektonska dopuna za push

Predlog, koji tek treba dokazati zadatkom 02: Firebase Cloud Messaging za isporuku i Cloudflare Worker Free sa Cron Triggerom za serversko zakazivanje. Frontend ostaje na GitHub Pages; privatni podaci u Firebase-u. Potreban je dodatni Cloudflare nalog, ali ne uvoditi plaćeni plan ili plaćeni domen. Cron za već zakazane push podsetnike ne znači periodično preuzimanje sportskih rasporeda.

FCM zahteva pouzdano serversko okruženje za automatizovano slanje. Service worker nije trajno aktivan proces i tajmer u browseru nije pouzdan alarm kada je PWA zatvorena. [FCM server](https://firebase.google.com/docs/cloud-messaging/server-environment), [MDN pozadinski rad](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation).

Cloudflare Free ima ograničenja CPU vremena, broja poziva i spoljašnjih zahteva. Ne pretpostavljati da veliki Firebase Admin SDK ili slanje celoj korisničkoj bazi staju u jednu invokaciju; proveriti podršku runtime-a i meriti male batch-eve. [Cloudflare limiti](https://developers.cloudflare.com/workers/platform/limits/).

Ako ova kombinacija ne prođe probu, ne zamenjivati push običnim obaveštenjem i ne uključivati billing. Dokumentovati prepreku i predložiti drugi besplatan server ili dogovor o obimu; nezavisan razvoj može nastaviti. Nema garancije isporuke u sekundi: mreža, dozvole, browser i OS utiču na dostavu. Zatvorena PWA nije isto što i uređaj bez interneta ili prinudno ugašen browser.

## Šta znači „Moje utakmice”

Obuhvata događaje odabrane ili praćene kroz ovu aplikaciju, ne sve privatne događaje u korisnikovom Google nalogu. Jedna utakmica je jedan red u PWA listi, čak i ako dolazi od dva omiljena kluba. Sačuvati sve razloge uključivanja; uklanjanje jednog ne uklanja ostale.

Odvojene oznake: „Pratim u aplikaciji”, „Pretplata — korisnik potvrdio”, „Upisano u Google — poslednja provera …”, „Čeka upis”, „Upis nije uspeo”. Klik na ICS link nije potvrda da Google ima događaj. Ručne API događaje proveravati po poznatom kalendaru i ID-u uz važeću dozvolu; bez nje prikazati poslednje poznato stanje. Šire čitanje privatnih kalendara nije deo MVP-a.

## Zajednička pravila za sve zadatke

1. Radi samo priloženi zadatak i nužne preduslove. Ne prepravljaj druge module bez razloga.
2. Pročitaj `docs/progress.md`, relevantne odluke i postojeći kod. Nastavi postojeću implementaciju.
3. Pre promene zajedničkog modela zabeleži razlog i migraciju u `docs/decisions.md`; ne uvodi drugi identitet za istu utakmicu.
4. Tajne i lični tokeni ne ulaze u javne datoteke, build ili logove. Calendar access token ostaje u memoriji browsera.
5. Test podaci su jasno označeni. Nedostupni sportski podaci nisu dozvola za izmišljanje termina.
6. Testovi treba da proveravaju ponašanje i kvarove navedene u zadatku. Ne tvrdi da je stvarna integracija proverena samo zato što mock radi.
7. Posle zadatka ažuriraj `docs/progress.md`: status TODO/IN_PROGRESS/DONE/BLOCKED, promene, komande i stvarni rezultati testova, granice provere, prepreke i sledeći zadatak.
8. Rutinske odluke donosi sam. Pitaj samo za nedostajući pristup ili stvarnu promenu obima/troška. Ne traži potvrdu za svaki fajl.
9. Ako zadatak ne može da prođe kriterijume, ostaje nezavršen. Predaj razlog i nastavi samo nezavisne poslove kada je to deo tekućeg zahteva.

## Predlog glavne navigacije

„Početna” — sledeća utakmica, danas i narednih sedam dana.
„Moje utakmice” — hronološka lista, filteri i status upisa.
„Klubovi” — izbor sporta, pretraga i praćenje.
„Podešavanja” — push dozvole po uređaju, izbor podsetnika, vremenska zona i nalog.

Predloženi početni podsetnik: 30 minuta pre početka, uz izbor 15/30/60 minuta i isključivanje. To su projektni predlozi, ne još dodatno potvrđene korisničke preferencije. Notifikacije o promeni termina i otkazivanju uključiti kao podesive tipove. Rezultati uživo nisu MVP zahtev.
