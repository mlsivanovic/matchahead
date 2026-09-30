# Predaja zadatka 06 — osnova korisničke agende (čista logika)

Datum: 30. septembar 2026.
Status: logika DONE za testiranje; integracija u ekrane NIJE deo ove predaje.
Commit: 452873c (dopunjeno pre predaje; konačni hash u izveštaju)

## Ostvaren rezultat

Čista korisnička agenda u `apps/web/src/logic/agenda.ts` kao unija praćenih
klubova i ručnih izbora, bez ikakvog oslanjanja na Grok schema iz faze 04.
Potpis namerno prima samo `followedTeamIds: readonly string[]` i
`manualFixtureIds: readonly string[]`. Jedan red po stabilnom fixture ID-u,
sačuvani svi razlozi uključivanja
(`{kind:'followed_team',teamId} | {kind:'manual_selection',fixtureId}`).
Povlačenje jednog razloga ne uklanja utakmicu koju pokriva drugi.

Novo i sačuvano ponašanje:

- `buildUserAgenda` — unija, dedup po ID-u, nepoznati ručni ID se ignoriše,
  deterministički redosled (UTC početak rastuće, stabilan dodatni ključ).
- `groupUserAgenda` — Predstojeće / Termin naknadno / Odloženo ili otkazano /
  Arhiva. Prošla potvrđena utakmica ide u arhivu; odložena sa novim terminom
  ostaje u poremećaju; nepoznat sat nikad nije ponoć i nema odbrojavanje.
- `nextAgendaFixtures` — najraniji budući potvrđeni početak, istovremene
  vraćaju sve (ekran dodaje „još N u isto vreme"); predikat isti kao
  postojeći `nextConfirmedFixtures`.
- `scheduleStatusLabel` — bez pouzdanog live izvora nikad „Uživo" ni izvedeno
  „Završeno"; samo „Počela prema rasporedu". Izričit `finished` ostaje
  „Završeno"; izričit `live` spušta se na bezbednu rečenicu.
- Svi raniji exporti (`countdownLabel`, `kickoffText`, `myMatchGroups`,
  `fixturesForFollowed`, `nextConfirmedFixtures`, ostalo) netaknuti; ekrani
  rade kao pre dok koordinator ne dodeli integraciju.

Nezavisna komponenta `apps/web/src/ui/AgendaList.tsx` (`AgendaList`,
`AgendaRow`) prikazuje isključivo DEMO redove sa razlozima i bezbednim
statusom. Nije uvezana u `App.tsx` ni `screens.tsx` — integraciju dodeljuje
koordinator kada Grok schema bude spremna.

Samo sintetički DEMO podaci i izričite DEMO oznake. Nema Google/ICS tvrdnji,
nema stvarnog sportskog preuzimanja, nema auth implementacije.

## Izmenjene datoteke

- `apps/web/src/logic/agenda.ts` — dodata agenda-osnova (tipovi, unija,
  grupe, sledeća, bezbedan status); postojeće funkcije netaknute.
- `apps/web/test/agenda-user.test.ts` — NOVO: 18 testova ivica faze 06.
- `apps/web/src/ui/AgendaList.tsx` — NOVO: neuvezana prikazna komponenta.
- `docs/handoffs/06-agenda-osnova.md` — ovaj zapis.

NISU dirani (vlasništvo Grok/Gemini): `App.tsx`, `ui/screens.tsx`,
`FixtureCard.tsx`, auth/podešavanja, `user-local.ts`, `package-lock.json`,
`README`, `docs/progress.md`, `docs/decisions.md`.

`apps/web/node_modules/` i `dist/` nisu deo predaje.

## Izvršene provere i dokazi

30. septembar 2026, izolovani worktree na `be48495`:

- `cd apps/web && node --experimental-strip-types --test test/*.test.ts`
  — 33 testa, 33 prolaza, 0 padova (15 postojećih + 18 novih).
- `cd packages/domain && node --experimental-strip-types --test test/*.test.ts`
  — 20 testova, 20 prolaza, 0 padova.
- `node scripts/check-data-contracts.mjs` — 20 prolaza, 0 padova.
- `./node_modules/.bin/tsc --noEmit` u `apps/web` — bez greške.
- `npm run build` u `apps/web` — uspešan Vite build (precache 13 zapisa).
  Instalacija zavisnosti rađena sa `--no-package-lock --no-save`;
  `package-lock.json` netaknut (provereno `git status`/`git diff`).

Pokazano ponašanje (novi testovi): dva praćena protivnika = jedan red;
uklanjanje jednog praćenja čuva red; ručni izbor van praćenih ulazi;
istovremene sledeće vraćaju sve; ponoć UTC ostaje potvrđena; TBD nema
odbrojavanje; DST prelaz i promena zone menjaju lokalni datum istog UTC
trenutka; pomeranje čuva prethodni datum; otkazano ostaje u poremećaju;
prošlo po rasporedu kaže „Počela prema rasporedu".

## Neizvršene provere

- Prikaz na uređaju / emulatoru (samo logika + build).
- Živi Firebase Auth tok (faza 04, Grok vlasništvo).
- Stvarni sportski izvor (skup dozvoljenih izvora i dalje prazan, odluka 01B).

## Preostalo za koordinatora

1. Live auth/UI integracija: vezati `followedTeamIds` + `manualFixtureIds`
   na Grok schema čim bude spremna; tek tada uvezati `AgendaList` u ekrane.
2. Faza 05: unos i dalje blokiran praznim skupom dozvoljenih izvora.
3. Ekranski detalji faze 06 van ove predaje: filteri po sportu/klubu/
   takmičenju, detalj utakmice, tekst „Sutra u 20:30 — za 1 dan i 3 sata",
   oznaka „još N u isto vreme", visibilitychange/zone-change osvežavanje
   odbrojavanja, offline oznaka zastarelosti — sve nad ovom logikom.
4. Odluka o `live` statusu iz izvora: logika ga bezbedno spušta; ako faza 05
   jednog dana donese pouzdan live izvor, `scheduleStatusLabel` se tada menja.
