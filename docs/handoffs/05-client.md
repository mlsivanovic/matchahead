# Faza 05 — predaja klijenta (Muse)

Datum: 1. oktobar 2026. Grana: `mlsivanovic/matchahead-05-client`.
Ugovor: `docs/phase-05-work-contract.md`. Deljeni HTTP omotač:
`packages/domain/src/schedule-api.ts` (commit `0a9ad3f`, cherry-pickovan sa
koordinatorove dojave — nikakav paralelni model u klijentu).

## Šta je isporučeno

- Tipizovani HTTP klijent `apps/web/src/logic/schedule-api.ts`: isključivo
  `POST {base}/api/find-fixtures` sa `{ sport, teamId, seasonId, refresh }`
  (sezona tačno `2026-2027`, tim iz `selectableTeams`). Odgovor se proverava
  strogim validatorom (`FindFixturesHttpSuccess`): sva tri režima
  (`verified-schedule`, `source-blocked`, `synthetic-demo`), `checkedAt`
  `string | null`, `lastAttemptAt`/`lastSuccessAt`, manifesti, promene.
  Datumi su stvarni kalendarski datumi, trenuci strogi ISO sa zonom
  (odbija `2026-02-30`, sat bez zone, `25:00`). Greške: `401/403` →
  prijava, `429` → kuldaun sa `Retry-After`, pad/tajmaut/pogrešan oblik →
  poruka + zadržan prikaz. Prekinut zahtev (`aborted`) se nikad ne upisuje.
- Adresa servera `apps/web/src/logic/schedule-config.ts`: samo javni URL iz
  `VITE_SCHEDULE_API_URL`. Jedan deljeni validator sa klijentom: HTTPS uvek,
  HTTP samo loopback (`localhost`/`127.0.0.1`/`::1`) jer Bearer ne sme preko
  javnog HTTP-a; kredencijali, upit i fragment se odbijaju. Prazno → pošteno
  onemogućen interfejs bez imena promenljivih („Server rasporeda nije podešen
  u ovoj instalaciji…”). Nikakav ključ ili token u Vitu.
- Token `apps/web/src/logic/schedule-auth.ts`: `Authorization: Bearer`
  isključivo iz postojeće Firebase sesije (`currentUser.getIdToken(false)`),
  samo u zaglavlju — nikad u URL-u, logu, kešu ni buildu. Bez sesije poziv
  ide bez zaglavlja pa server vrati 401 (nema lažnog tokena).
- Trajno stanje `apps/web/src/logic/schedule-store.ts`: poslednje dobro
  stanje po klubu i sezoni u `localStorage` pod ključem uređaja
  (`matchahead.device.schedule.*`, javni podaci — preživljava zamenu naloga,
  bez uid/email/token tragova). Čitanje prolazi kroz isti potpuni validator
  kao mreža; oštećeno je null. `synthetic-demo` se odbija pri upisu
  (efemeran, ne zamenjuje provereno). Prva blokada sa `checkedAt: null` je
  validna i prikazuje „Još nema uspešne provere izvora.” Kuldaun 15 min za
  „Osveži” (prvi klik uvek slobodan).
- UI `apps/web/src/ui/ScheduleFinder.tsx`: izbor sporta/kluba (samo 4),
  fiksna sezona, „Pronađi utakmice” / „Osveži raspored” (zaključano u
  kuldaunu sa porukom), oznaka režima, poslednja uspešna provera ili pošteno
  „nema”, lista sa izvornim linkovima (`data-source-url`), pokriće po
  takmičenju (`data-coverage`/`data-availability`: objavljeno, neobjavljeno,
  greška izvora, ne učestvuje, nepoznato), manifesti sa poslednjim uspehom,
  promene. Blokada se ne prikazuje kao proverena. Ugrađeno na ekran Klubovi;
  agenda (Početna/Moje) dobija samo `verified-schedule` snimke sa tačnim
  poreklom (`data-server-agenda`, `data-provenance`). Derbi ostaje jedan red
  preko postojećeg `buildUserAgenda`. Zamena naloga prekida tekući zahtev
  (`abortPending` na promenu identiteta naloga).
- Service worker: `/api/` odgovori su eksplicitno network-only
  (`isPrivateApiUrl` + postojeća `authorization` grana). Jedan worker, bez
  promena push/FCM. `check-pwa` ažuriran: više ne zabranjuje fazu 05, već
  traži `/api/find-fixtures` poziv i zabranjuje direktne sportske hostove u
  bundle-u.

## Komande i rezultati

- `npm run check` u `apps/web`: 91/91 PROŠLO (73 zatečena + 18 novih:
  17 schedule-client + 1 cache-policy). `tsc --noEmit` čist.
- `npm run check` u `packages/domain` (cherry-pickovan ugovor): 28/28 PROŠLO.
- `node scripts/check-schedule-ui.mjs` (jedinice + `tsc` + 2 builda + pravi
  Chrome 390×844 sa kontrolisanim fixture serverom): SVE PROŠLO — 11 PASS
  linija: sekcija bez poziva pre klika; pronalaženje sa tačnim poreklom
  `2026-10-01T08:00:00.000Z`, izvorima, neobjavljenim Kupom i nepoznatim
  terminom; kuldaun zaključava Osveži; pad 500 i malformisan odgovor čuvaju
  prikaz; source-blocked sa `checkedAt: null` („Još nema uspešne provere”,
  bez lažnog porekla, zadržana utakmica); synthetic-demo vidljivo označen i
  efemeran (reload pokazuje trajnu blokadu, 0 novih poziva); agenda/početna
  sa poreklom; server video samo ispravna tela na klik bez Authorization
  (neprijavljen); nekonfigurisan build pošteno onemogućen.
- Postojeći `check-pwa` sadržaj (statika/jedan worker/DEMO) netaknut osim
  ažurirane faza-05 tvrdnje; pun `check-pwa` browser tok je na koordinatoru
  pri integraciji jer pripada globalnom CI-u.

## Podešavanje servera (za koordinatora/integraciju)

- Build: `VITE_SCHEDULE_API_URL=https://<server>` (produkcija, HTTPS).
  Lokalno: `VITE_SCHEDULE_API_URL=http://127.0.0.1:<port>`.
- Bez vrednosti aplikacija radi sa DEMO + sačuvanim stanjem i pošteno kaže
  da pronalaženje nije dostupno. Firebase ostaje postojeći Vite setup;
  ništa novo se ne dodaje u `import.meta.env`.

## Ograničenja i ostalo za koordinatora

- Nema pravog servera u ovoj grani (Grok): browser provera je protiv
  kontrolisanog fixture servera; živa mrežna proba tek po integraciji.
- `result.checkedAt` prve blokade je null po deljenom ugovoru: UI to kaže
  eksplicitno, manifesti nose istoriju po izvoru.
- Nema periodičnog preuzimanja, Calendar OAuth-a ni push-a; DEMO fajl i
  natpis netaknuti. Domenski fajlovi se ne diraju (samo cherry-pick).
