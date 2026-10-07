# Lokalni dokazi

`published-before.png`: stvarna objavljena aplikacija 7. oktobra, Orca embedded browser, pre reworka. Nije dokaz novog proizvoda.

`visual-foundation.txt`: WCAG relative luminance proračun semantičkih parova. Ne zamenjuje proveru svih stvarnih komponenti.

`modal-review.json`: 13 provera u headless Chromium preko Puppeteer. Ovo je desktop browser sa promenjenim viewportom, nije stvaran Android.

Reprodukcija foundation modal scenarija iz korena repo-a (razvojni Vite port 5180):

```sh
cp docs/reviews/rework/evidence/modal-harness.tsx.txt apps/web/modal-review.tsx
cp docs/reviews/rework/evidence/modal-harness.html.txt apps/web/modal-review.html
node docs/reviews/rework/evidence/modal-browser-check.mjs
rm apps/web/modal-review.tsx apps/web/modal-review.html
```

Harness je privremen, nije u produkcijskom bundle-u. Browser skripta koristi apsolutnu putanju ovog checkout-a i `/usr/bin/chromium`.

`schedule-service.txt`: `node scripts/check-schedule-service.mjs`, exit 0, typecheck i 56/56 testova, kontrolisani workerd testovi bez objave.

`theme-review.json`: 7/7 Chromium provera Auto promene sistema, ručnog izbora, ponovnog otvaranja, odbijenog setItem i 390px prijave; login Light/Dark slike su iz istog scenarija.
`prepaint-review.json`: 5/5 sa namerno blokiranim React modulom. Podrazumevani Dark sistem, ručni Light/Dark, neispravan JSON i SecurityError pri pristupu skladištu daju ispravnu pozadinu/color-scheme/meta pre Reacta. Nije snimak fizičkog telefona.
`web-coordinator.txt`: nezavisno 152/152 web testova (najnovija provera; prethodni checkpointi 142 i 148). `domain-coordinator.txt`: 35/35 ugovora/domenskih testova.

`pwa-coordinator.txt`: existing PWA script snapshot run by coordinator, exit0. Builds/152 tests/typecheck, /repo/ routing, manifest/single worker, Chrome installability, standalone/iPhone flags, offline shell, OAuth cache exclusion, failed-update preservation and accepted update pass. Module path/webRoot and three temp paths isolated only; assertions unchanged, source SHA256 in `pwa-coordinator-snapshot.json`. Physical Android still NOT_TESTED.

`component-review.json`: 39/39 provera stvarnih React komponenti sa kontrolisanim fixture props i mock callback funkcijama. Pokriva 0/1/20/105 redova, paginaciju bez duplikata, izbor preko stranica i reset filterom, sticky kontrole, Light/Dark prikaze i šest panela podešavanja, mobilne/landscape/desktop širine i tekst na 200%. Ovo nije dokaz integracije prijave, Firestore-a ili Calendar API-ja. Provere ponovljene posle poslednje responsive CSS izmene.

`component-{matches,clubs,settings}-{light,dark}-390.png`, `component-settings-{0..5}-{light,dark}-390.png` i `component-enlarged-dark-390.png`: vizuelni dokazi iz istog komponentnog scenarija, Chromium simulacija viewporta, bez fizičkog Android uređaja.

Reprodukcija komponentnog scenarija na razvojnom portu 5180:

```sh
cp docs/reviews/rework/evidence/component-harness.tsx.txt apps/web/component-review.tsx
cp docs/reviews/rework/evidence/component-harness.html.txt apps/web/component-review.html
node docs/reviews/rework/evidence/component-browser-check.mjs
rm apps/web/component-review.tsx apps/web/component-review.html
```

Privremeni harness fajlovi uklonjeni su pre produkcijskog build-a. Browser skripta koristi lokalne apsolutne putanje ovog checkout-a.

`skip-link-before-fix.json`: stvarni App na razvojnom portu 5180, tastatura Tab/Enter na kapiji. Početni hash za Klubove/Podešavanja prelazi u #sadrzaj i povećava history.length. `skip-link-browser-check.mjs --before` čuva reprodukciju; bez tog argumenta proverava očuvan hash/istoriju i fokus na main. Ovo je izolovana kapija, bez tvrdnje o autentifikovanim tokovima.

Gemini baseline dokazi prihvaćeni su posle ispravki i stvarnog izvršavanja: `auth-browser.txt` 47/47, `schedule-ui.txt` završena regresija sa mock Calendar POST/409/GET, `pwa-browser.txt` i `rework-harness.txt` 43/43 uz `harness-results.json`. Prvobitne nepotpune tvrdnje vraćene su na doradu. `gemini-baseline.md` razlikuje izvršeni obuhvat od preostalih punih App scenarija; integrisani audit je završen, 82/82 stvarno izvršenih provera.

`panel-two-tabs-review.json`: 5/5 ciklusa Settings/ModalPanel sa dve fixture stranice, bez Auth/API poziva. `panel-two-tabs-background-failure.md` beleži prethodni protocol timeout pri interakciji sa tabom u pozadini; `bringToFront()` ispravlja testnu interakciju uz isti timeout. Za reprodukciju koristiti privremene komponentne fajlove iz gornjeg postupka, zatim `node docs/reviews/rework/evidence/panel-two-tabs-check.mjs` i ukloniti oba app fajla. Ne zamenjuje proveru propagacije odjave.

`integrated-audit.txt` / `audit-results.json`: završni nezavisni82/82, autentifikovani App/emulator i presretnuti Calendar odgovori, uključujući OAuth otkazivanje, deferred odjavu/Back, skrol, fokusirani modal, pet širina i Light/Dark panele. `F13-preview-notice.diff`: pregled poslednje ispravke statusa. Finalni build i152 web testova ponovljeni posle završetka izmena. Fizički Android ostaje NOT_TESTED.
