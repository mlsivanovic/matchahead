# Google prijava, kalendar i Android UI — 6. oktobar 2026.

## Obim

Orca run: `run_61b4de754615`. Grok je završio obaveznu prijavu i uklanjanje produkcionog demo sadržaja. Gemini CLI je završio Material 3 stil, boje, ikone i naziv taba **Utakmice**. Oba završna izveštaja prihvaćena su u Orca sistemu i njihovi radni terminali zatvoreni. Muse je pokrenut, ali tri pokušaja nisu prošla Orca proveru spremnosti; nije dobio zadatak niti menjao kod. Koordinator je preuzeo kalendar, serversku agendu, README i integracionu proveru.

## Google kalendar

- Posebna Google reautentifikacija pri eksplicitnom izvozu, uz `calendar.events` scope.
- Access token ostaje u memoriji jednog izvoza. Tokeni ne ulaze u URL, lokalno skladište, log ili service worker keš.
- Izbor svih dostupnih utakmica ili pojedinačnih, uz postojeće filtere sporta, kluba i takmičenja.
- Potvrđena satnica čuva UTC trenutak. Datum bez potvrđene satnice koristi 17:00 u zoni izvora, odnosno zoni profila kada zona izvora nije poznata, sa napomenom **Vreme nije poznato**.
- Nepoznat datum, otkazivanje, odlaganje i završena utakmica ne nude se za upis. Pretpostavljeno trajanje je dva sata.
- Stabilni SHA-256 event ID omogućava bezbedan ponovni pokušaj. HTTP 409 se priznaje tek posle čitanja događaja i potvrde odgovarajućeg privatnog ID-ja utakmice; obrisan događaj ne prijavljuje se kao uspeh.
- Delimičan uspeh ostaje prikazan; uspešne stavke skidaju se iz izbora, a preostale ostaju za ponovni pokušaj. Odjava, zamena naloga i odlazak sa ekrana prekidaju zahteve. Proverava se da utakmica nije povučena iz aktuelne agende.
- Jednokratni upis u glavni Google kalendar. Promene izvornog rasporeda ne ažuriraju već upisani događaj automatski; UI to navodi.

## Google konfiguracija

Calendar API je uključen i ponovo potvrđen preko `gcloud`, sa eksplicitnim projektom `matchahead` i nalogom `mls.ivanovic@gmail.com`. Aktivni globalni gcloud projekat/nalog nisu menjani. Javna web konfiguracija preuzeta je iz GitHub repository variables u ignorisani `apps/web/.env.local`; admin tajne nisu preuzimane.

Google Auth Platform OAuth publika **Testing** i lista sa jedinim test korisnikom **nisu izmenjene niti potvrđene**. Korisnik je tražio isključivo gcloud CLI, bez browsera. Proverena standardna gcloud površina ne pruža komandu za ovu listu; `gcloud iam oauth-clients` odnosi se na IAM OAuth klijente i nije zamena za Workspace/Calendar consent screen. [Zvanična Google uputstva](https://developers.google.com/workspace/guides/configure-oauth-consent) opisuju podešavanje test korisnika u konzoli. Klijentski allowlist nije dokaz ovog Google podešavanja.

## Provere kalendara i prikaza

Osam testova pokriva nepoznatu satnicu, DST prelaze, očuvanje UTC termina i event ID-ja, nepotvrđen sat, nepoznat datum, nedozvoljene statuse, POST autentifikaciju, potvrdu duplikata i Google greške 401/403/429/500. Browser provera pokriva izbor svih, poništavanje, pojedinačni izbor, blokiran datum i odbijen izvoz bez prijave. Nema horizontalnog prelivanja na 390 i 1280 px.

Produkcioni preview potvrđuje da sva četiri hash ekrana bez prijave ostaju na kapiji, bez navigacije, demo zahteva i zahteva za raspored. Mobilni prikaz nema runtime greške ni horizontalno prelivanje. Screenshot kalendara i kapije pregledani su; korekcije checkbox rasporeda su primenjene.

Završne provere:

- **125/125 web testova** (uključujući osam testova kalendara i tri testa pristupa).
- **47 Auth browser provera** kroz izolovane emulatore — prijava, odjava, odbijanje drugog naloga bez profila, ponovno otvaranje, više tabova, privatnost i brisanje naloga.
- **PWA provera: PASS** — omotač, ažuriranje, offline kapija i uklanjanje starog demo keša.
- **Provera rasporeda: PASS**, sada sa stvarnom prijavom kroz lokalni emulator — izvori, filteri, nepoznati termini, opoziv izvora, 360 px i autentifikovani zahtevi.
- **Calendar browser tok: PASS** — izbor svih, beleška, simulirani neuspeh drugog događaja, nastavak bez ponovnog upisa prvog, 17:00 i duplikati sa potvrdom postojećeg događaja. Calendar API je presretnut uz zaobilaženje service workera u testu.
- **TypeScript i produkcioni build: PASS**. Produkcioni bundle i javni fajlovi nemaju demo oznake ni demo raspored.
- **35/35 domenskih provera: PASS**.

Stvarni Google OAuth popup nije korišćen za automatizovanu prijavu, a stvarni događaji nisu upisani tokom automatizovane provere. Izmene nisu commitovane niti objavljene.
