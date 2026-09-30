# Predaja zadatka 06 — samostalne UI komponente lične agende

Datum: 30. septembar 2026.
Status: UI DONE za pregled; integracija u App/screens NIJE deo ove predaje.
Grana: mlsivanovic/matchahead-06-agenda (nadogradnja na f9f7952, logika iz 06-agenda-osnova.md).

## Ostvaren rezultat

Nove samostalne komponente u `apps/web/src/ui/PersonalAgenda.tsx`
(`PersonalAgendaHome`, `PersonalAgendaScreen`), stilovi u
`apps/web/src/ui/PersonalAgenda.css` (import iz komponente), čisti pomoćnici u
`apps/web/src/ui/PersonalAgendaHelpers.ts`. Nisu uvezane u `App.tsx` ni
`screens.tsx` — integraciju dodeljuje koordinator kada auth (faza 04) bude spreman.

Pozivi čuvaju tačna imena propsa: `schedule`, `now`, `timeZone`, `online`,
`followed`, `manualFixtureIds`, `onToggleManual`; home dodaje `error`, mine
dodaje `draftNote`/`onDraft`. Dodatnih opcionih propsa nema.

- Home radi nad unijom `buildUserAgenda` (ne nad globalnim rasporedom):
  sledeća (`nextAgendaFixtures`, oznaka „Još N u isto vreme"), Danas i
  Narednih sedam dana iz agende, bezbedan prazan prikaz sa vezama ka
  Klubovima (`#/klubovi`) i Mojim utakmicama (`#/moje`), last-check/offline-stale
  indikator (`data-stale`/`data-offline`, poslednje osvežavanje, prag, warning).
- Mine: grupe Predstojeće / Termin naknadno / Odloženo ili otkazano / Arhiva
  (`groupUserAgenda`), filteri sport/klub/takmičenje, pristupačan detalj jedne
  utakmice (`aria-expanded`/`aria-controls`, jedan otvoren), razlozi
  („Pratim u aplikaciji: <klub>" vs „Ručni izbor"), DEMO katalog nezavisan od
  praćenja sa `onToggleManual`, napomena da uklanjanje ručnog izbora ne skida
  utakmicu koju pokriva praćenje. Reč „omiljeno" se ne koristi nigde.
- Bezbednost prikaza: sve kartice DEMO-označene, `kickoffText`/`countdownLabel`/
  `scheduleStatusLabel` iz logike (nepoznat sat nikad ponoć, bez odbrojavanja;
  prošlo je „Počela prema rasporedu", samo izričito `finished` je „Završeno").
  Nema Google/ICS tvrdnji — samo rečenica da upis nije deo faze.
- Bez sopstvenog sata: `now` dolazi iz propsa; nema `setInterval` ni
  `visibilitychange` slušaoca, pa osvežavanje korenske aplikacije važi i ovde.
- Logika agende (`logic/agenda.ts`) NIJE menjana — nije nađen pravi bug.

## Izmenjene datoteke

- `apps/web/src/ui/PersonalAgenda.tsx` — NOVO: obe komponente.
- `apps/web/src/ui/PersonalAgenda.css` — NOVO: dopuna uz globalne klase.
- `apps/web/src/ui/PersonalAgendaHelpers.ts` — NOVO: čisti pomoćnici
  (razlozi, stanje katalog-reda, filteri, opcije).
- `apps/web/test/personal-agenda-helpers.test.ts` — NOVO: 6 testova.
- `docs/handoffs/06-agenda-ui.md` — ovaj zapis.

NISU dirani: `App.tsx`, `screens.tsx`, auth/rules/domain modeli,
`package-lock.json`, `README`, `progress.md`, `decisions.md`.
`apps/web/node_modules/`, `dist/` i privremeni SSR direktorijumi nisu deo predaje
(privremeni `.pa-ssr*` obrisani pre komita).

## Izvršene provere i dokazi

30. septembar 2026, na grani `mlsivanovic/matchahead-06-agenda`:

- `cd apps/web && node --experimental-strip-types --test test/*.test.ts`
  — 39 testa, 39 prolaza, 0 padova (33 postojeća + 6 novih).
- `./node_modules/.bin/tsc --noEmit` u `apps/web` — bez greške.
- `npm run build` u `apps/web` — uspešan Vite build (precache 13 zapisa).
- `cd packages/domain && node --experimental-strip-types --test test/*.test.ts`
  — 20 testova, 20 prolaza, 0 padova.
- `node scripts/check-data-contracts.mjs` — 20 prolaza, 0 padova.
- SSR prikaz (`react-dom/server`, pravi `demo-schedule.json`, bez novih zavisnosti):
  48 tvrdnji, sve prolaze — prazan home sa vezom `#/klubovi`, sledeća/danas/
  nedelja sa odbrojavanjem, stale+offline indikatori, alert za grešku, sve 4
  mine-grupe, filteri sport/klub/takmičenje, razlozi praćenja/ručnog izbora,
  „Ukloni ručni izbor" + `aria-pressed` + napomena o zadržavanju praćenog,
  arhiva „Završeno", TBD bez odbrojavanja i bez `00:00`, `aria-expanded` detalj,
  katalog svih 8 DEMO utakmica, beleška, nijedno „Uživo"/„Upisano u Google"/
  „omiljen".

## Neizvršene provere

- Klik-test u pravom pregledaču (Puppeteer/Chromium nije pokretan; `onToggleManual`
  poziv je proveren na nivou stanja — SSR pokazuje ispravne `aria-pressed`
  oznake u oba smera — i pregledom koda, ne simuliranim klikom).
- Prikaz na uređaju / emulatoru; živi Firebase Auth tok (faza 04).
- Integracija u `App.tsx` — namerno ostavljena koordinatoru.

## Preostalo za koordinatora

1. Uvezati `PersonalAgendaHome`/`PersonalAgendaScreen` u `App.tsx` (uz
   `manualFixtureIds` stanje + `onToggleManual`, i postojeće `followed`/
   `draftNote`), kada auth schema bude spremna.
2. Faza 05 i dalje blokirana praznim skupom dozvoljenih izvora; odluka o `live`
   statusu ostaje kao u predaji osnove.
