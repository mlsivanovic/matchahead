# Faza 05 — ugovor rada za Grok, Muse i Gemini CLI

Run: `run_6d3c53cc583e`, 1. oktobar 2026. Koordinator radi u glavnom checkoutu. Korisnik je izričito ovlastio koordinaciju, samostalne odluke, integraciju i GitHub push posle uspešne provere. Radnici ne rade push/deploy i ne šalju poruke izvorima ili drugim spoljnim primaocima.

## Cilj i vlasništvo

- Grok: serverski servis, javni izvori/adapteri, trajni keš/revizije, kvote, autentifikacija i domenski ugovor. Vlasništvo `experiments/schedule-service/`, potrebne izmene `packages/domain/`, `scripts/check-schedule-service.mjs`, `.env.example` (samo sportska polja), `docs/handoffs/05-server.md`.
- Muse: kompletan korisnički tok faze 05 u postojećoj PWA, klijentski adapter, integracija sa agendom, prikaz izvora/pokrivenosti/svežine, UI i browser testovi. Vlasništvo `apps/web/`, `scripts/check-schedule-ui.mjs`, `docs/handoffs/05-client.md`.
- Gemini CLI: nezavisna provera stvarnih izvora, uslova/prava/zone/potpunosti, plan i matrica provera. Vlasništvo `docs/reviews/05-*`, `docs/phase-05-source-audit.md`, `scripts/probe-schedule-sources.mjs` ako je potreban. Posle integracije radi završni nezavisni pregled; popravke idu vlasnicima.
- Koordinator: ovaj ugovor, `docs/progress.md`, `docs/decisions.md`, `docs/orchestration-plan.md`, README, `.github/workflows/`, integracija commitova i završni push. Postojeći nepraćeni `docs/reviews/04-06-coordinator-checkpoint.md` nije deo ovog zadatka.

Pročitati `plans/grok-faze/05-obrada-rasporeda.md`, stalni kontekst, odluke i `docs/phase-05-source-proposal.md`. Ne počinjati aplikaciju iznova. Budžet 0 €, četiri izbora kroz `selectableTeams`, protivnici neograničeni, nema periodičnog preuzimanja i nema AI API zavisnosti. Ne menjati fazu 02/push ili uvoditi Google Calendar OAuth.

## Početni HTTP ugovor (usaglasiti porukom ako je potrebna dopuna)

`POST /api/find-fixtures`, JSON `{ sport, teamId, seasonId, refresh }`.

- `sport`: `football` ili `basketball`; `teamId`: jedan od četiri postojeća ID-ja; `seasonId`: `2026-2027` za početni test. Server izračunava `now` i lokalni datum, ne veruje vremenu klijenta.
- Produkcioni poziv nosi `Authorization: Bearer <Firebase ID token>`; token ne ulazi u URL, log, trajni browser keš niti Vite config. CORS ne zamenjuje autentifikaciju. Lokalni testovi koriste eksplicitne test adaptere, produkciona auth kapija se ne zaobilazi.
- Uspešan odgovor: `{ kind, result, teams, competitions, manifests, changes }`.
- `kind`: `verified-schedule`, `source-blocked` ili `synthetic-demo`. `result` je postojeći `FindFixturesResult`; `teams`/`competitions` su postojeći `Team[]`/`Competition[]`; `manifests` su `SourceManifest[]`. `changes` sadrži `{ fixtureId, revision, kind }`, gde je `kind` `new`, `rescheduled`, `postponed` ili `cancelled`.
- `source-blocked` sme da vrati praznu listu sa stvarnom pokrivenošću i razlogom. Ne vraća DEMO kao pravi raspored. Sintetički server režim služi izolovanoj proveri, sa vidljivom oznakom.
- Za greške koristiti odgovarajući HTTP status i `{ error: { code, message } }`; bez tajni ili sirovog upstream odgovora.
- Grok definiše i izvozi TypeScript tip odgovora u `packages/domain/` rano. Muse koristi ugovor umesto izmišljanja paralelnog modela. Svaka promena ugovora odmah ide koordinatoru.

## Izvori i razjašnjenje prethodne blokade

Javni HTML je tehnički legitimna vrsta adaptera; odsustvo dokumentovanog API-ja samo po sebi ne blokira razvoj parsera. Jednokratna ABA proba već je izdvojila 36 redova za oba kluba kroz 18 kola. Probe izvora moraju biti male i bez zaobilaženja zaštita. Ne kopirati tuđe slike, grbove ni tekstove vesti u proizvod.

Odvojeno dokazati pristup, sezonu, potpunost, vremensku zonu i način korišćenja. Ne tvrditi da je dozvola izričito zabranjena samo zato što nije pronađena. Gemini treba da proveri postojeće previše široke zaključke, konkretne uslove i praktičan način otvaranja izvora. Korisnikova autonomija koordinatora ne predstavlja tuđu licencu; ne izmišljati dozvole. Nepotvrđeni izvor ne označavati `allowed` bez odluke sa dokazima. Izolovani parser/live probe može napredovati nezavisno od objave.

Pokusni i produkcioni izvor/način korišćenja moraju biti vidljivo razdvojeni. Ako eksterni uslov ostane neispunjen, isporučiti i testirati sav nezavisan kod, navesti konkretan preostali uslov i ne označiti kompletnu fazu DONE. Ne uvoditi trajni ručni nedeljni unos kao zamenu za automatski pronalazak.

## Prihvatljivost

- Stvarni adapteri demonstrirani malim mrežnim probama za dostupne izvore; sezona, sve strane/kola i oba kluba provereni. Sve relevantne lige/kupovi/faze imaju red pokrivenosti, uključujući neobjavljeno/neučestvovanje/grešku/nepoznato.
- Server odbija pogrešan sport/klub/sezonu, neautentifikovane pozive i zloupotrebu; ograničenja po nalogu/IP i globalni plafon. Spoljašnje URL-ove bira kod, ne korisnik.
- Trajno prethodno stanje i revizije opstaju preko nove instance; pokušaj, uspeh i promena su različiti. Identični odgovori ne stvaraju promene. Prazan odgovor/timeout/429/nepotpuna paginacija čuvaju poslednji dobar raspored; nestanak nije otkazivanje.
- ID je stabilan pri promeni sata i sponzorskog imena; promena provajdera zahteva mapiranje. Deduplikacija derby meča u agendi radi kada se prate oba kluba.
- UTC/zona su potvrđeni ili je početak null. Ne proveravati samo ponoć: ponovljeni 13:00 i CET/CEST moraju biti ocenjeni prema izvornom dokazu.
- PWA prikazuje listu na klik, izvore, poslednju uspešnu proveru i status po takmičenju; „Osveži” poštuje keš/kuldaun; pad servera čuva prikaz. Stranica kluba i agenda su integrisane. Postojeći DEMO ostaje jasno označen.
- Jedan service worker, bez tajni u frontendu, bez keširanja privatnih API/OAuth odgovora. Ne praviti promene Google kalendara ili zakazivati pravi push u fazi 05.
- Testovi pokrivaju ponašanje, kvarove i browser tok na širini telefona, TypeScript/build i postojeće regresije. Mock dokazi i žive mrežne probe imaju odvojene rezultate.

Radnik isporučuje commitove na svojoj grani, predaju sa komandama/rezultatima/ograničenjima i lifecycle poruku prema živom Orca preamble-u. Pre završetka pročita follow-up inbox. Koordinator proverava dokaze, integriše, raspoređuje popravke i ponavlja relevantne provere. Push se radi tek posle konačnog pregleda; status faze se ne ulepšava.
