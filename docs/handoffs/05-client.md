# Faza 05 — predaja klijenta (Muse, popravke posle pregleda)

Datum: 1. oktobar 2026. Grana: `mlsivanovic/matchahead-05-client`.
Ugovor: `docs/phase-05-work-contract.md`. Deljeni HTTP omotač:
`packages/domain/src/schedule-api.ts` (ugovor `0f090c6` + cherry-pick
koordinatorskih domenskih popravki `f00a06c`/`411225c` — nikakav paralelni
model u klijentu; tipovi `Fixture`, `CoverageStatus`, `SourceManifest`,
`Team`, `Competition` uvek iz `packages/domain/src/types.ts`).

## Finalni jedinstveni tok (nema dodatne agende)

Jedini tok podataka od servera do ekrana:

1. Klik „Pronađi utakmice” / „Osveži raspored” na ekranu Klubovi zove
   `postFindFixtures` (`apps/web/src/logic/schedule-api.ts`): isključivo
   `POST {base}/api/find-fixtures` sa `{ sport, teamId, seasonId, refresh }`
   (sezona tačno `2026-2027`, tim iz `selectableTeams`). Rok 20 s
   (`FIND_TIMEOUT_MS`) i spoljni `AbortSignal` (odjava/zamena naloga) važe
   do kraja čitanja tela i validacije kroz `Promise.race` — zaglavlja 200
   pa viseće telo daju `timeout`, prekid posle zaglavlja daje `aborted`.
   Trka štiti i kada fetch/mock ignoriše signal, pa UI nikad ne čeka
   beskonačnu promise; tajmer i listener se čiste tek na samom kraju.
2. Odgovor prolazi strogi validator (`parseFindResponse`): sva tri režima,
   `checkedAt string | null`, stvarni kalendarski datumi i strogi ISO
   trenuci sa zonom, vremenska konzistentnost (potvrđen termin ima trenutak,
   `time_tbd` nema izmišljen sat, nikad ponoć kao zamena), HTTPS izvorni
   URL-ovi bez kredencijala/`javascript:` (sintetički režim sme
   `synthetic:`, nikad `javascript:`), celobrojne revizije ≥ 0, sport/tim/
   sezona odnosi, takmičenja i učesnici iz imenika, `nextFixture` je prvi a
   `nextConfirmedFixture` prvi potvrđeni sa vraćenog spiska, provereni režim
   bez `forbidden` pokrivenosti i bez sintetičkih tragova. Greška bilo gde
   je `wrong-response`, ne prazan prikaz. Greške: `401/403` → prijava,
   `429` → kuldaun sa `Retry-After`, pad/tajmaut/pogrešan oblik → poruka +
   zadržan prikaz. Prekinut i zastareli zahtev se nikad ne upisuju.
3. Uspešan `verified-schedule`/`source-blocked` upisuje se u trajno stanje
   po klubu i sezoni (`apps/web/src/logic/schedule-store.ts`,
   `matchahead.device.schedule.*` na uređaju — javni podaci, preživljavaju
   zamenu naloga, bez uid/email/token tragova). Čitanje prolazi kroz isti
   potpuni validator; oštećeno je null. `synthetic-demo` se odbija pri
   upisu (efemeran, ne zamenjuje provereno i ne ulazi u agendu). Prva
   blokada sa `checkedAt: null` je validna („Još nema uspešne provere
   izvora”). Svaki uspešan odgovor pokreće `purgeRevokedSnapshots`:
   opoziv (forbidden/restricted uvek; allowed→unknown prelaz) briše par
   izvor+takmičenje iz SVIH snimaka sezone. Kuldaun 15 min za „Osveži”
   (prvi klik uvek slobodan); običan „Pronađi” kuldaun ne dira.
4. Početna i Moje grade STVARNU GLAVNU agendu iz
   `apps/web/src/logic/server-agenda.ts`: `unifiedVerifiedFixtures` spaja
   sve validne klupske `verified-schedule` snimke u jedan skup — najviša
   konzistentna revizija po stabilnom id-u, derbi tačno jednom čak i uz
   praćenje oba kluba, opozvani izvori isključeni; ista revizija sa
   različitim sadržajem je konflikt i ne objavljuje se. `buildUserAgenda`
   (postojeći: unija praćenih klubova i ručnih izbora) daje redove; Početna
   prikazuje next/danas/nedelju, Moje sport/klub/takmičenje filtere i grupe
   statusa — sve nad unificiranim skupom, sa tačnim poreklom
   (`data-server-agenda="unified"`, `data-provenance` = najsvežiji
   `checkedAt`). DEMO je izolovan (poseban odeljak „izolovano”, DEMO bedževi,
   bez DEMO-empty natpisa dok postoje pravi mečevi). Bez serverskih redova
   agenda je ista DEMO agenda kao pre, uz poštenu napomenu.
5. Rase su zatvorene rednim brojem leta (`seq` u `useScheduleFinder`):
   dvoklik prekida prethodni let, izbor kluba/sporta prekida let,
   token uzet pre zamene naloga se ne šalje, kasni odgovor se ne upisuje,
   zastarela greška ćuti. Brzi uzastopni „Prati” klikovi sabiraju se
   funkcionalnom dopunom stanja (`App.tsx`). Zamena naloga zove
   `abortPending`; privatna agenda (praćenja/ručni izbori) čita se iz
   tekuće sesije/naloga, javni snimci ostaju na uređaju.

Adresa servera (`schedule-config.ts`): samo javni URL iz
`VITE_SCHEDULE_API_URL` — HTTPS uvek, HTTP samo loopback, bez
kredencijala/upita/fragmenta; prazno → pošteno onemogućen interfejs.
Token (`schedule-auth.ts`): `Authorization: Bearer` isključivo iz postojeće
Firebase sesije, samo u zaglavlju. Service worker: `/api/` odgovori su
network-only; jedan worker, bez push/FCM promena.

## Granice mock vs pravi server

- Ova grana NE sadrži pravi sportski server (Grok, `...-05-server`).
  `apps/web/scripts/check-schedule-ui.mjs` podiže KONTROLISANI lokalni
  fixture server (`http://127.0.0.1:<port>`) koji služi sva tri režima,
  greške 500/neispravan oblik/429-jednom, offline tok, dva fudbalska kluba
  sa deljenim derbijem i allowed→forbidden opoziv — nikakav pravi sportski
  izvor, nikakav direktan sportski host u bundle-u (to proverava i
  `check-pwa`). Svi mrežni zahtevi potiču od klika; server ih broji.
- Živa mrežna proba protiv pravog servera tek po integraciji kod
  koordinatora (pun PWA regression je na koordinatoru posle integracije).
- `VITE_SCHEDULE_API_URL=https://<server>` (produkcija, HTTPS) ili
  `http://127.0.0.1:<port>` (lokalno). Bez vrednosti: DEMO + sačuvano
  stanje uz poštenu poruku.

## Komande i rezultati (stvarni izlaz, exit 0)

- `npm run check` u `apps/web`: 103/103 PROŠLO (uključujući 29
  schedule-client: 17 zatečenih + 12 novih za rok/viseće telo/prekid u
  letu/kasni odgovor/derbi/reviziju/opoziv/konflikt/semantiku).
- `npm run check` u `packages/domain` (sa `f00a06c`/`411225c`): SVI PROŠLI.
- `tsc --noEmit` u `apps/web`: čist.
- `node scripts/check-schedule-ui.mjs` (jedinice + `tsc` + 2 builda + pravi
  Chrome 390×844 i 360×740 sa kontrolisanim fixture serverom): SVE PROŠLO,
  16 PASS linija — sekcija bez poziva pre klika; pronalaženje sa tačnim
  poreklom, izvorima, neobjavljenim Kupom i nepoznatim terminom; kuldaun;
  pad 500 i malformisan odgovor čuvaju prikaz; source-blocked sa
  `checkedAt: null` (zadržana utakmica, bez lažnog porekla); synthetic-demo
  označen i efemeran (reload bez novog poziva); drugi klub; Početna sa
  unificiranom agendom (derbi jednom u Sledećoj, najraniji next);
  Moje sa filterima kluba/takmičenja/sporta (derbi jednom u disjunktnim
  grupama, nepoznat termin bez sata); offline bez poziva uz sačuvan prikaz;
  360px bez preliva; allowed→forbidden opoziv prazni agendu i čisti oba
  klupska snimka; ugovor tela (≥10 ispravnih zahteva na klik, bez lažnog
  tokena); nekonfigurisan build pošteno onemogućen. Stvarni `exit 0`
  (bez visećih test-procesa).

## Ograničenja i ostalo za koordinatora

- `result.checkedAt` prve blokade je null po deljenom ugovoru; manifesti
  nose istoriju po izvoru.
- Nema periodičnog preuzimanja, Calendar OAuth-a ni push-a; DEMO fajl i
  natpis netaknuti. Domenski fajlovi dirnuti samo cherry-pickom
  `f00a06c`/`411225c` (nalog: revokacija preko kanonskog zapisa i
  allowed→unknown unutar keš prozora, kanonski derbi, odbijanje
  konfliktnih/malformisanih feedova, stvarni kalendarski trenuci).
- Nepoznat termin se nigde ne prikazuje kao `00:00`/`ponoć`.
