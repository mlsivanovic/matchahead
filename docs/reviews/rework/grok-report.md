# Grok rework report

Functional rework is in the authorized web files. Muse CSS, `ModalPanel`, `ThemePicker`, icons, and `vite.config.ts` were not edited. Backend, Firestore, domain models, stable calendar IDs, and calendar time rules were not edited. No remote push and no live Calendar writes.

## What shipped

- Theme is `light`, `dark`, or `auto` on `matchahead.device.prefs`. Missing or invalid values stay Auto. The boot script in `index.html` sets `data-theme`, `color-scheme`, `theme-color`, and the root background (`#F7F9FC` / `#111318`) before the module loads. Auto follows the system live. A manual choice is kept in module memory first; storage writes stay best-effort, so a failed `setItem` cannot snap the open session back to Auto. A reload with no stored theme is still Auto.
- Three tabs: Utakmice, Klubovi, Podešavanja. Old home and matches hashes open the same mounted agenda. Filters and document scroll stay across tabs. Private selection, the draft note, and open panels clear when the account identity changes.
- One day-grouped agenda, 20 per page, sticky controls. Sport and period sit on the toolbar. Club, competition, and Predstojeće / Promene / Arhiva sit in Filteri, with a count and Poništi. Display order is the local calendar date, undated last, then the existing time and id order inside a day. Promene keeps unconfirmed, postponed, and cancelled rows, and also a confirmed row whose previous instant or date actually differs. Sledeća is the earliest future confirmed `scheduled` or resolved `time_tbd` row, not a postponed or live row.
- Izaberi uses the same rows. Izaberi sve covers every eligible row of the active filters. Filter changes reset the page and the selection. Page changes keep it. The confirm panel states the event count, the one-time write, the optional note, and the 17:00 warning when the existing calendar predicate says the time is unknown. Back and Escape always close that panel. A dismissed or superseded write aborts, leaves the remaining ids selected, and does not apply its result to a newer account.
- Clubs are four rows, football then basketball. Prati does not fetch. The schedule opens on request: Pronađi utakmice, or Osveži when a snapshot exists, with the existing cooldown. Reliability warnings and that primary action sit in `schedule-toolbar`. Coverage and sources stay in O rasporedu. A row opens detail with place, round, season, source, reasons, and Dodaj ručno / Ukloni.
- Settings are six panels: Izgled, Vremenska zona, Obaveštenja (“Još nisu dostupna”), Nalog, Instalacija i pomoć, O aplikaciji. One timezone control writes the account zone when a profile exists, and otherwise only the device zone. Reminder and favorite values stay stored and have no controls. Login is the title, one sentence, Nastavi sa Google, the pilot line once, and the theme picker. The top brand is hidden until the app is unlocked, so the name appears once.

## Verification

- `npm run check` in `apps/web`: 142 tests, 0 failures.
- `npm run build`: `tsc --noEmit` and the Vite production build completed.
- Chromium on the running dev server, `docs/reviews/rework/evidence/theme-browser-check.mjs`: all seven checks passed, including manual Dark after `QuotaExceededError` and a system change to light. `docs/reviews/rework/evidence/theme-review.json` is that run.
- A separate 390px load showed one MatchAhead title, no top header, and the resolved root background.

Signed-in agenda, club, and settings flows were not clicked here. Those screens need an authenticated session, and this pass does not write real calendar events. Gemini still owns the browser scripts.

## Left

Device install on a phone, the signed-in browser passes, and any CSS adjustment stay with the coordinator and Muse. Production schedule data is unchanged by this client work.
