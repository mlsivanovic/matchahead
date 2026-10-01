# Predaja zadatka 05 — server i unos rasporeda

Datum: 2026-10-01
Status: IN_PROGRESS

## Ostvaren rezultat

Serverski ugovor `POST /api/find-fixtures` je u `@matchahead/domain`. Tip uspeha je `FindFixturesHttpSuccess`. Prvi izvoz je `0a9ad3f`. Snimak i opoziv su `7b30c34`, `d414dac` i `879f905`. Ovaj servisni commit dodaje čuvanje prethodnog lokalnog datuma kada pomeranje nema UTC, i sam servis.

Servis računa `now` i beogradski datum. Firebase ID token prima samo u `Authorization`. Odgovor ima `kind` `verified-schedule`, `source-blocked` ili `synthetic-demo`. Greška je `{ error: { code, message } }` bez tajni.

Deploy cilj je Cloudflare Worker `matchahead-schedule` sa jednim SQLite Durable Object-om `ScheduleDirectoryObject`. U njemu su snimci, manifesti, indeks promena i kvote. Lokalni dokaz je Miniflare/workerd, uključujući `unsafeEvictDurableObject`. Worker paket ne uvozi `node:fs`, `node:zlib`, `node:crypto` ni `node:child_process`, i ne sadrži `api-live.euroleague.net`. Inflate PDF-a ide kroz `DecompressionStream('deflate')`. `pdftotext` se ne poziva.

Ingress Worker samo proverava metod, putanju, poreklo i token u URL-u, pa čita telo u jednom roku. Obrada je u Durable Object-u. Podrazumevani CPU SQLite Durable Object-a je 30 sekundi po zahtevu. Limit od 10 ms pripada ingress Workeru na Free planu, ne obradi u objektu. Zidno vreme parsiranja nije obračunati CPU Cloudflare-a. Plan naloga `matchahead` nije ponovo proveren. Deploy i naplata nisu dirani.

Produkcija zove `createGateSource`. Publikacija ostaje `unknown`, strane su prazne, izvor se ne zove, `kind` je `source-blocked`. To nije tvrdnja da HTML ili PDF ne staju u objekat. Sintetički test sa dozvolom `allowed` na `https://lab.schedule.test` pokreće prave FSS i Evroliga parsere unutar workerd-a. Dozvola dolazi samo iz laboratorijske politike, nikad iz dokumenta.

Odgovor filtrira manifeste na traženu sezonu i na takmičenja iz kataloga tog sporta. Skladište zadržava manifeste oba sporta. Posle FK, pa KK, pa ponovo FK, košarkaški odgovor nema fudbalski manifest, a Superliga zadržava `lastAttemptAt` prvog poziva. `teams` sadrži traženi klub, učesnike dozvoljenih HTML/PDF strana i protivnike koje kvar izvora zadrži u snimku. Protivnik van kataloga ima zemlju iz identiteta, prazan grad, prazne alias-e i prazan `providerIds`. Sat i dozvola se ne izmišljaju.

`PRODUCTION_ID_MAPPINGS` je prazan. Stari identifikatori `k{kolo}` i `r{kolo}` nisu isporučeni, pa tabela preslikavanja ne postoji. FSS identitet je slug domaćin-gost. Evroliga je slug strana, a kolo samo iz linije `ROUND N` neposredno iznad.

Faza nije DONE. Budžet 0 €. Push namespace nije diran. `apps/web` nije menjan.

## Izmenjene datoteke

- `packages/domain/src/find-fixtures.ts` i `packages/domain/test/find-fixtures.test.ts` — prethodni lokalni datum ostaje i kada su oba UTC polja prazna
- `experiments/schedule-service/` — Node proba, Worker, SQLite skladište, adapteri, testovi, `wrangler.jsonc`
- `scripts/check-schedule-service.mjs`
- `.env.example` — samo sportska polja faze 05
- `docs/handoffs/05-server.md`

`apps/web`, faza 02/push i globalna dokumentacija nisu menjani.

## Izvršene provere i dokazi

Komande, 1. oktobar 2026, Node 26.7.0 (mise). Node 22 nije instaliran i nije pokrenut.

- `node scripts/check-data-contracts.mjs` — 35 PASS, 0 FAIL, 132 ms
- `node scripts/check-schedule-service.mjs` — 40 PASS, 0 FAIL, 17916 ms

Zid ovog procesa u tom nizu, nije obračunati CPU:

- Node Evroliga PDF: `euroleague-node-wall-ms=77.5`
- workerd sačuvani FSS HTML: `fss-html-wall-ms=42.0`
- workerd sačuvani Evroliga PDF: `euroleague-pdf-wall-ms=50.0`

Workerd, isti niz:

- paket sadrži `parseFssSuperliga`, `parseEuroleaguePdf` i `DecompressionStream`, i rečenicu `pdftotext se ne poziva`
- raspored, revizija i kvota ostaju posle gašenja objekta; isti odgovor ne diže reviziju; pomeranje, odlaganje i otkaz zadržavaju id
- timeout, 429, prazan i nepotpun odgovor i nestanak sa strane ne prave otkazivanje; protivnik `football:xx:gost` ostaje u `teams`
- dozvoljeni FSS HTML daje 26 budućih mečeva, id završava na `:fss:partizan-gost-01`, `startsAtUtc` je null, status `time_tbd`; imenik ima `football:rs:partizan`, `football:xx:gost-01` i `football:rs:crvena-zvezda`
- opoziv u minutu prazni i drugi klub, bez novog preuzimanja tela
- produkcija je `source-blocked`, pokrivenost `unknown`, nijedan izlazni sportski zahtev; dokaz ne pominje `10 ms` kao razlog
- FK Partizan, KK Partizan, pa opet FK Partizan: košarkaški manifesti počinju sa `basketball:`, treći fudbalski odgovor samo sa `football:`, Superliga `lastAttemptAt` je isti, keš je `throttled`, `fixtureFetches` ostaje 0
- kvote naloga, IP i globalni plafon preživljavaju gašenje i vraćaju 429
- zaglavljeno telo vraća 400 `payload_too_large` i sledeći zahtev prolazi; zaglavljen sertifikat vraća 401 i ne ostaje u kešu
- tuđe poreklo 403, token u URL-u 401, polje `now` u telu 400

Sačuvani dokumenti u `/tmp/ma-sources`, nisu u gitu. Obavezne provere su u `adapters.test.ts`. Brojevi su sa ovog diska, 1. oktobar 2026:

- FSS: 182 nacrta, `incomplete_page`, nijedan `startsAtUtc`, nema `k{kolo}` identiteta
- ABA: 180 nacrta, `incomplete_page`; meč 15 ostaje `startsAtUtc` null, datum `2026-10-02`, sat `18:30`; jedini UTC je meč 27, Cluj, `2026-10-11T10:00:00Z` preko Europe/Bucharest
- Partizan fudbal: 34 nacrta, nepotpuno, jedan zakazan ili bez sata, odlaganja postoje, zona prazna
- FK Crvena zvezda: 22 nacrta, nepotpuno, nema zone, hero 13:00 nije termin
- KK Partizan: 0 nacrta; KK Crvena zvezda: `incomplete_page`; KLS: 0 nacrta
- Evroliga PDF: 380 redova, `rounds` 0, `incomplete_page`. Izvučeni tekst nema `ROUND N` neposredno iznad datuma, pa se kola ne izmišljaju. 8. januar 2027. Zvezda kod kuće je `2027-01-08T19:00:00Z` iz GMT kolone. Javno preuzimanje nije dozvola.

## Živo i mock

Produkcija je živi ulaz, ali svaki feed ostaje `publication: unknown` i bez strana. Odgovor je `source-blocked`. Nema živog rasporeda.

Sintetički `allowed` na laboratorijskom domaćinu jeste pravi parser nad kontrolisanim HTML/PDF telom. To nije produkcioni izvor i nije dozvola za objavu. `kind` ostaje `synthetic-demo`.

## Blokade izvora

- Pravo objave za FSS, ABA, sajtove klubova i Evroliga PDF nije utvrđeno. Produkcija zato ne označava `allowed`.
- Evroliga PDF je javno preuzimanje, ne licenca za redistribuciju. `api-live.euroleague.net` se ne zove.
- FSS, Partizan, FK Crvena zvezda i ABA redovi bez Cluj sata nemaju zonu, pa `startsAtUtc` ostaje null. ABA UTC postoji samo kad taj red sam odštampa sat u Klužu.
- Sačuvani FSS, ABA i Evroliga nisu potpuni. Kola se ne dopunjuju. Nestanak reda nije otkazivanje.
- KK Partizan, KK Crvena zvezda i KLS nemaju upotrebljiv raspored 2026-2027 u sačuvanim stranama.
- Plan Cloudflare naloga nije potvrđen. Nema deploya.

## Kriterijumi koji nisu ispunjeni

- Nijedan produkcijski izvor nema `publication: allowed`.
- Živi deploy nije rađen. Nalog i naplata nisu dirani.
- PWA, agenda i browser tok nisu deo ovog vlasništva. Gemini vežba klijentski validator `eb4a71f` posebno.
- Node 22 nije pokrenut.

## Odluke koje sledeći task mora sačuvati

- Klijent odbacuje svaki meč čiji `provider` i `competitionId` više nisu `allowed`, za svaki klub, ne samo za klub iz tekućeg zahteva. `kind: source-blocked` zamenjuje listu. Keš uređaja drugog kluba ne sme da vrati opozvani meč. Serverski opseg je `879f905` i workerd test opoziva.
- Odgovor sme da sadrži samo manifeste čije je takmičenje u vraćenom katalogu tog sporta. Skladište i dalje čuva oba sporta.
- `teams` mora da pokrije svakog učesnika budućeg meča, uključujući protivnika zadržanog posle kvara izvora.
- `checkedAt` i `lastSuccessAt` su null dok bar jedan dozvoljen feed nije objavljen. Manifest odvaja pokušaj, uspeh i promenu.
- Id utakmice ne sadrži sat ni sponzora. 00:00, 01:00 i 02:00 nisu potvrđen termin.
- `SCHEDULE_MODE=synthetic` nije dozvoljen kad je `NODE_ENV=production`. `x-matchahead-test-now` važi samo uz sintetički režim i `SCHEDULE_ALLOW_TEST_CLOCK=1`.
- Token ne ide u URL, log, trajni keš ni Vite. CORS ne zamenjuje prijavu.
- Ne zvati `api-live.euroleague.net`. Ne označavati izvor `allowed` bez odluke sa dokazom.

## Potrebni pristupi i ručni koraci

Imena, bez vrednosti. `FIREBASE_PROJECT_ID` je već u fazi 02.

Lokalna Node proba, samo `SCHEDULE_BIND_HOST` (podrazumevano `127.0.0.1`), port `SCHEDULE_PORT` (8787):

`node --experimental-strip-types experiments/schedule-service/src/main.ts`

Još: `SCHEDULE_MODE`, `SCHEDULE_STORE_DIR`, `SCHEDULE_ALLOWED_ORIGINS`, `SCHEDULE_TRUST_PROXY`, `SCHEDULE_IO_TIMEOUT_MS` (prazno znači 5000). `SCHEDULE_LAB_URL`, `SCHEDULE_LAB_KIND` i `SCHEDULE_LAB_PARSER` samo za sintetički test.

Worker nije deployovan: `experiments/schedule-service/wrangler.jsonc`, ime `matchahead-schedule`, binding `SCHEDULE`, klasa `ScheduleDirectoryObject`, migracija `v1-schedule-directory`. Ne pokretati wrangler deploy i ne dirati `matchahead-push-probe`. Na Workeru nema `SCHEDULE_STORE_DIR`. Produkcija: `SCHEDULE_MODE=production`, bez `SCHEDULE_LAB_URL`.

Kvote u kodu: nalog 96 zahteva i 24 sveža na dan, IP 192 i 48, 30 neuspelih prijava po IP, globalno 100 upstream zahteva. Dan je Europe/Belgrade. Keš pogodak ne troši svež ni globalni plafon.

## Sledeći task

Muse: klijent faze 05 po HTTP ugovoru. Manifest takmičenja mora postojati u vraćenom katalogu. Svaki učesnik budućeg meča mora biti u `teams`. Puni opseg opoziva ostaje: za svaki klub odbaciti meč čiji provider i takmičenje više nisu `allowed`. Preduslov za `verified-schedule` je odluka da je neki produkcijski izvor `allowed`.

Gemini: prava i zone ostaju nepotvrđeni. Ovaj dokument ne pokreće sledeći task.
