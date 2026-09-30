# Napredak projekta

Ažurirano: 27. septembar 2026. — celina 03 je instalabilna PWA osnova sa DEMO rasporedom. Faza 02 i dalje nije završena. Nema dopuštenog izvora stvarnih utakmica.
Verzija specifikacije: 2.0

| Zadatak | Status | Dokaz / prepreka |
|---|---|---|
| 01 | DONE | `docs/data-feasibility.md`. Zahtev „sve utakmice” nije ispunjen: TheSportsDB seče sezonu na 15 zapisa, API-Sports je bez ključa, football-data.org nema srpska takmičenja ni košarku. |
| 01B | DONE | `docs/data-on-demand-feasibility.md`. Tok jednog klika i sintetičko spajanje prolaze. Nijedan stvarni izvor nema i pokrivenost i pravo unosa. 00:00/01:00/02:00 nisu potvrđen sat. |
| 02 | BLOCKED | `docs/push-feasibility.md`. Lokalni FID tok i CPU potpisa prolaze. Android i iPhone su NOT_TESTED na fizičkom uređaju. Firebase Spark projekat `matchahead` i Cloudflare nalog su verifikovani (`docs/infrastructure-readiness.md`). |
| 03 | DONE | `apps/web` i `docs/handoffs/03-pwa-osnova.md`. Objavljeno na GitHub Pages: `https://mlsivanovic.github.io/matchahead/` (HTTP 200). Instalabilnost, samostalni prozor, offline omotač i DEMO raspored, oznaka zastarelosti, čekanje nove verzije dok traje unos. Prikaz na fizičkom telefonu (ikona na telefonu) je NOT_TESTED. |
| 04 | TODO | — |
| 05 | TODO | Čeka dopušten izvor. 01B je skup izvora za unos ostavio praznim. `findFixtures` postoji samo nad sintetičkim odgovorima. |
| 06 | TODO | — |
| 07 | TODO | — |
| 08 | TODO | — |
| 09 | TODO | — |
| 10 | TODO | — |
| 11 | TODO | — |
| 12 | TODO | — |

## Poslednja rađena celina

- Rezultat: React/TypeScript/Vite PWA u `apps/web`. Četiri ekrana, manifest sa stabilnim ID-jem jednakim Pages putanji, jedan service worker za omotač i budući FCM. Javni prikaz je samo sintetički DEMO. Faza 02 ostaje BLOCKED.
- Promenjene datoteke: `apps/web/`, `scripts/check-pwa.mjs`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/03-pwa-osnova.md`, `README.md`, `.gitignore`.
- Izvršene komande i rezultati: `node scripts/check-pwa.mjs` — 15 prolaza jediničnih provera, TypeScript bez greške, produkcioni build sa bazom `/repo/`, zatim Chrome. Instalabilnost bez grešaka, samostalni `--app` prozor, offline posle jednog online učitavanja, OAuth nije u kešu, neuspeo novi omotač ne aktivira se, nova verzija čeka kraj unosa. U otvorenom Chrome-u dugme „Instaliraj” se pojavilo, a širina 360 px prošla je četiri ekrana.
- Stvarni uređaji / integracije: desktop Chrome na `127.0.0.1` (putanja `/repo/`) i verifikovana javna objava na GitHub Pages (`https://mlsivanovic.github.io/matchahead/`, HTTP 200). Android i iPhone na fizičkom uređaju su NOT_TESTED.
- Neizvršene provere: ikona na početnom ekranu fizičkog telefona, živa Firebase prijava u PWA, FCM isporuka na zatvorenoj PWA.

## Prethodna rađena celina

- Rezultat: izolovana proba push-a. Serverski tok koristi Firebase Installation ID i FCM HTTP v1. Lokalni potpis staje u 10 ms u workerd-u. Poruka nije viđena na zatvorenoj PWA, pa celina nije DONE.
- Promenjene datoteke: `docs/push-feasibility.md`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/02-proba-push-notifikacija.md`, `README.md`, `.env.example`, `.gitignore`, `experiments/push-probe/`, `scripts/check-push-probe.mjs`.
- Izvršene komande i rezultati: `node scripts/check-push-probe.mjs` — 22 prolaza, izgrađen klijent, sken bez privatnog ključa. `node scripts/check-data-contracts.mjs` — 20 prolaza. `node experiments/push-probe/scripts/measure-cpu.mjs` — hladan potpis medijana 2 ms, obnova 1 ms, razmena 42 ms čekanja. `npx wrangler check startup` u `experiments/push-probe` — snop 28,35 KiB, lokalni aktivni startup 0,0 ms na jednom uzorku.
- Stvarni uređaji / integracije: nema. Desktop Chrome na localhost proverio je stranicu, odbijenu dozvolu i test putanju. To nije FCM isporuka.
- Neizvršene provere: Android, iPhone, Cloudflare edge `cpuTime`, živi OAuth, živi FCM, živi Firestore, pravi KV.

## Prethodna završena celina

- Rezultat: mapa takmičenja za četiri kluba, matrica prava i potpunosti, tok jednog klika sa zajedničkim kešom i lokalni dokaz spajanja. Unos stvarnih utakmica ostaje blokiran ili neproveren.
- Promenjene datoteke: `docs/data-on-demand-feasibility.md`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/01b-pronalazak-na-zahtev.md`, `docs/data-feasibility.md`, `docs/data-alternatives.md`, `README.md`, `packages/domain/src/find-fixtures.ts`, `packages/domain/src/time.ts`, `packages/domain/src/quota.ts`, `packages/domain/src/index.ts`, `packages/domain/test/find-fixtures.test.ts`, `data/synthetic/find-fixtures-scenarios.json`, `scripts/check-data-contracts.mjs`.
- Izvršene komande i rezultati: `node scripts/check-data-contracts.mjs` — 19 prolaza, 0 padova, 26. septembar 2026.
- Stvarni uređaji / integracije: nema sportskog naloga, nema workera, nema Firebase-a, nema uređaja. Stranice FSS, Fixtur.es, UEFA, ABA i Evrolige su otvorene istog dana.
- Neizvršene provere: API-Football i API-Basketball sa pravim ključem; njihov broj strana; zona budućih evroligaških satova; pisana dozvola bilo kog izvora za MatchAhead ICS.

## Odluke koje sledeći zadatak mora sačuvati

- Linkovi na docs/decisions.md: odluka 01 o identitetu, UTC vremenu i zabrani plaćenog izvora; odluka 01B o kliku, kešu, praznom skupu dozvoljenih izvora i satu 00:00/01:00/02:00.
- Odluka 01C: samo četiri izbora u dva sporta, kroz jedinstven `selectableTeams` katalog. Protivnici u rasporedu ostaju neograničeni.
- Odluka 02: push cilj je FID, ne stari registration token. Worker ne šalje iz pregledača i ne uključuje naplatu. Cron podsetnika nije uključen. Faza 02 ostaje BLOCKED.
- Odluka 03: jedan service worker, ID aplikacije jednak Pages putanji, javni raspored je DEMO dok unos nije dopušten. Nova verzija se ne učitava tokom unosa.
- Verzije SDK-a i ugovora: `@matchahead/domain` 0.1.0. Klijentski FCM SDK u probi je `firebase` 12.19.0. Polje uređaja je `fid`. PWA je React 19.3.0, Vite 7.3.6 i vite-plugin-pwa 1.3.0. Produkcija ne zove `getToken()`.

## Prepreke

- Problem push-a: Firebase Spark projekat (`matchahead`) i Cloudflare nalog jesu obezbeđeni (`docs/infrastructure-readiness.md`), ali zatvorena PWA na fizičkom mobilnom uređaju nije primila poruku.
- Dokaz: `docs/push-feasibility.md` i `docs/infrastructure-readiness.md`. Android i iPhone su NOT_TESTED.
- Šta je potrebno: proveriti FCM isporuku na fizičkom Android i iPhone telefonu sa zatvorenom PWA aplikacijom.
- Problem podataka: nema izvora koji je istovremeno besplatan, dovoljan za objavljene utakmice ovih klubova i dopušten za unos u MatchAhead.
- Dokaz: `docs/data-on-demand-feasibility.md` i `docs/data-feasibility.md`.
- Šta je potrebno: pisana dozvola nosioca ili novi otvoreni izvor, pa tek onda adapter u fazi 05. API-Sports proba i dalje ne otvara pravo objave.
- Šta može nezavisno nastaviti: faza 04, prijava i podešavanja, preko postojećeg PWA omotača. Ne sme da registruje drugi service worker. Zadatak 05 ne sme da krene kao da je unos rešen. Push isporuka na zatvorenoj PWA čeka fizički telefon.

## Sledeći zadatak

- Broj i očekivani ishod: 04 — Google prijava i podešavanja. Push faza 02 ostaje BLOCKED. Faza 05 ostaje blokirana praznim skupom dozvoljenih izvora. PWA osnovu ne treba graditi ponovo.
