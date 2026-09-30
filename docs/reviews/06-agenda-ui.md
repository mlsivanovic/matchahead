# Nezavisni pregled UI komponenti lične agende (faza 06)

Datum: 30. septembar 2026.  
Grana: `mlsivanovic/matchahead-06-agenda`  
Pregledani komiti: `f9f7952` (osnova logike) i `d0f8469` (samostalne UI komponente)  
Vrsta zadatka: READ-ONLY pregled DOM-a i koda bez diranja produkcionog koda, bez unosa u oblak, bez menjanja paketa.

---

## 1. Sažetak nalaza

Pregledane su samostalne komponente `PersonalAgendaHome` i `PersonalAgendaScreen` (`apps/web/src/ui/PersonalAgenda.tsx`), stilovi (`PersonalAgenda.css`), pomoćne funkcije (`PersonalAgendaHelpers.ts`) i logika agende (`logic/agenda.ts`).

Verifikacija u pravom pregledaču izvršena je kroz namenski, privremeni lokalni Vite test harness na portu 18765 koristeći `puppeteer-core` i instalirani Chromium/Chrome (`/usr/bin/google-chrome-stable`). Verifikovano je ponašanje u stvarnom DOM stablu uz reaktivno stanje korisničkih praćenja (`followed`), ručnih izbora (`manualFixtureIds`), simuliranog vremena (`now`), vremenske zone (`timeZone`) i mrežnog statusa (`online`).

Svi definisani zahtevi verifikacije funkcionišu u stvarnom pregledaču. Uočene su dve manje logičke mane (bezbedne po podatke, ali relevantne za UX) i tri arhitektonska zapažanja, detaljno dokumentovani u odeljku 4.

**Važna napomena o opsegu:** Integracija u korenski `App.tsx`, živi Firebase Auth (faza 04), PWA instalacija na uređaju i Google prijava u pregledaču **NISU TESTIRANI** ovde (`NOT_TESTED`), u potpunom skladu sa zadatkom koji je ograničen na samostalne DEMO komponente.

---

## 2. Rezultati provere u pregledaču (10 tačaka verifikacije)

Sve provere su izvršene u headless Chrome okruženju (`13/13` uspešnih automatizovanih scenarija, trajanje < 4s):

### 1. Prazna agenda (`followed: []`, `manualFixtureIds: []`)
- **Početna (`PersonalAgendaHome`):**
  - Ispravno prikazuje poruku: *„Tvoja agenda je prazna. Izaberi klub na ekranu Klubovi ili ručno dodaj DEMO utakmicu na ekranu Moje utakmice.”*
  - Link `<a href="#/klubovi">Klubovi</a>` i link `<a href="#/moje">Moje utakmice</a>` su prisutni u DOM-u, vidljivi i vode na tačne rute (`routeHash`).
  - Sekcija „Sledeća utakmica” prikazuje: *„Nema predstojeće DEMO utakmice sa potvrđenim terminom u tvojoj agendi.”*
  - Sekcija „Danas” prikazuje: *„Nema DEMO utakmice iz tvoje agende za današnji datum.”*
  - Sekcija „Narednih sedam dana” prikazuje: *„Nema DEMO utakmice iz tvoje agende u narednih sedam dana.”*
  - Nijedna kartica (`article.card`) se ne renderuje.
- **Moje utakmice (`PersonalAgendaScreen`):**
  - Prikazuje poruku o praznoj agendi uz link ka `#/klubovi`.
  - Zaglavlja grupa (`Predstojeće`, `Termin naknadno`, `Odloženo ili otkazano`, `Arhiva`) se **ne** prikazuju kada je agenda prazna (komponenta `AgendaGroup` čisto vraća `null`).
  - DEMO katalog na dnu prikazuje svih 8 utakmica sa opcijom „Dodaj ručno”.

### 2. Ručni dodaj/ukloni (`onToggleManual`) i čuvanje razloga
- **Jedan red po ID-ju:** Dodavanje utakmice koja već postoji preko praćenog kluba (npr. `fx-zvezda-sever` za praćeni `football:rs:crvena-zvezda`) ažurira **tačno jedan postojeći red** u agendi; ukupan broj kartica ostaje nepromenjen (nema dupliranja).
- **Očuvanje razloga:**
  - Pre klika: lista razloga sadrži samo `Pratim u aplikaciji: FK Crvena zvezda`. Dugme ima tekst `Dodaj ručno` i `aria-pressed="false"`.
  - Posle klika: lista razloga sadrži **oba razloga**: `Pratim u aplikaciji: FK Crvena zvezda` i `Ručni izbor`. Dugme prelazi u `Ukloni ručni izbor` uz `aria-pressed="true"`.
  - Prikazuje se jasna napomena: *„Uklanjanje ručnog izbora ne uklanja utakmicu: ostaje jer pratiš klub.”*
- **Povlačenje ručnog izbora:** Klik na `Ukloni ručni izbor` uklanja `Ručni izbor`, ali utakmica **ostaje u agendi** jer je klub i dalje praćen. Razlog praćenja ostaje sačuvan.
- **Utakmica van praćenih klubova:** Klik na `Dodaj ručno` u katalogu za nepraćeni klub dodaje tačno 1 karticu u agendu sa jedinim razlogom `Ručni izbor`. Uklanjanje tog izbora u potpunosti uklanja utakmicu iz agende.

### 3. Istovremene sledeće utakmice
- Kada dve utakmice dele identičan najraniji budući `startsAtUtc`, Početna stranica pod `<h2>Sledeća utakmica</h2>` prikazuje paragraf `.meta`:
  - `Još 1 u isto vreme.` (za 2 istovremene).
  - `Još 2 u isto vreme.` (za 3 istovremene).
- Sve istovremene utakmice se u celosti renderuju pod sekcijom „Sledeća utakmica”.

### 4. Filteri sport / klub / takmičenje
- **Sport:** Dugmad `Svi`, `Fudbal`, `Košarka` sa `aria-pressed` atributima. Izbor `Košarka` filtrira agendu isključivo na košarkaške utakmice (`sport === 'basketball'`). Izbor `Fudbal` filtrira na fudbal. `Svi` vraća sve.
- **Klub:** Padajući meni `#agenda-club` nudi `Svi klubovi` i klubove izvučene iz trenutne agende (`clubOptionsForAgenda`). Izbor kluba filtrira utakmice na one gde je taj klub domaćin ili gost.
- **Takmičenje:** Padajući meni `#agenda-competition` nudi `Sva takmičenja` i takmičenja iz agende (`competitionOptionsForAgenda`).
- **Prazan presek:** Kada kombinacija filtera (npr. sport Fudbal + DEMO košarkaška liga) ne daje nijedan rezultat, ispravno se prikazuje obaveštenje: *„Nema DEMO utakmice za ovaj filter.”*, a lista kartica je prazna.

### 5. Pristupačni detalj utakmice
- Kartice u „Moje utakmice” sadrže dugme sa `aria-expanded="false"` i `aria-controls="agenda-detail-<id>"`.
- Klikom na dugme:
  - Tekst se menja u `Sakrij detalj`, a `aria-expanded` prelazi u `true`.
  - U DOM-u se pojavljuje kontejner sa `id="agenda-detail-<id>"`, `role="region"` i pristupačnim `aria-label="Detalj: <title>"`.
  - Sadrži definicionu listu `<dl>` sa poljima: Takmičenje, Sezona, Domaćin, Gost, Mesto, Kolo, Raniji datum (ukoliko postoji).
- **Pravilo „jedan otvoren”:** Otvaranje detalja na drugoj kartici automatski zatvara prethodno otvorenu karticu (`aria-expanded` vraća se na `false` i region se uklanja iz DOM-a).
- Ponovni klik na otvorenu karticu zatvara detalj.

### 6. Grupisanje Moje utakmice (4 grupe)
- Komponenta `groupUserAgenda` i `AgendaGroup` u DOM-u generišu tačno 4 celine:
  1. `Predstojeće` — potvrđeni budući termini (`startsAtUtc >= now`, `timeConfirmed: true`, nije otkazano/odloženo/završeno).
  2. `Termin naknadno` — utakmice sa `timeConfirmed: false` i statusom `time_tbd` (npr. `fx-kk-partizan-zapad`, `fx-kk-zvezda-zreb`).
  3. `Odloženo ili otkazano` — utakmice sa statusom `postponed` ili `cancelled` (npr. `fx-zvezda-odlozeno`).
  4. `Arhiva` — završene utakmice (`status: finished`, npr. `fx-partizan-proslo`) i utakmice čiji je termin prošao u odnosu na `now` (`startsAtUtc < now`, npr. `fx-zvezda-sever`).

### 7. Nepotvrđeno vreme bez ponoći i odbrojavanja
- Utakmice sa `time_tbd`:
  - Tekst satnice glasi: *„Termin nije potvrđen. Datum u izvoru: 10. oktobar 2026.”*
  - Tekst **ne** sadrži `00:00`, `24:00`, niti reč `ponoć`.
  - Kartica **nema** element `.countdown` (odbrojavanje se ne prikazuje).
- Utakmice bez poznatog protivnika (npr. `fx-kk-zvezda-zreb` gde je `awayTeamId: null`):
  - Naslov je bezbedan: *„KK Crvena zvezda — Protivnik nije određen”*.
- Odložene utakmice bez termina:
  - Tekst satnice glasi: *„Odloženo. Novi termin nije objavljen. Raniji datum: 25. septembar 2026.”*, bez odbrojavanja.

### 8. Promena vremenske zone i lokalnih datuma
- Za utakmicu u UTC terminu `2026-09-30T15:00:00Z`:
  - U zoni `Europe/Belgrade` (CEST / UTC+2): formatirano kao `30. septembar 2026. u 17:00`.
  - U zoni `America/New_York` (EDT / UTC-4): formatirano kao `30. septembar 2026. u 11:00`.
- **Prelaz preko ponoćne granice:**
  - Utakmica u terminu `2026-09-30T23:00:00Z` pri trenutku `now = 2026-09-30T12:00:00Z`:
    - U `Europe/Belgrade` (UTC+2) lokalni termin je `01. oktobar u 01:00` -> utakmica se na Početnoj grupiše u **„Narednih sedam dana”**.
    - U `America/New_York` (UTC-4) lokalni termin je `30. septembar u 19:00` -> utakmica se na Početnoj grupiše u **„Danas”**.

### 9. Uski mobilni raspored (360px širina)
- Testirano pod viewportom `{ width: 360, height: 800 }`:
  - `document.documentElement.scrollWidth === 360` i `document.body.scrollWidth === 360` — **nema horizontalnog skrola**.
  - Svi elementi unutar aplikacije (`.agenda-actions`, `.agenda-reasons`, `.filters`, `.agenda-selects`, `.card`, `textarea`, `<dl>`) imaju `scrollWidth <= clientWidth + 1px`.
  - Flex i grid kontejneri se pravilno prelamaju (`flex-wrap: wrap`, responzivni grid kolaps na jednu kolonu ispod 560px).

### 10. Oznake zastarelosti i rada van mreže
- **Zastareli podaci (`data-stale="true"`):** Kada razlika između `now` i `fetchedAt` pređe `staleAfterHours` (12h), kontejner dobija atribut `data-stale="true"` i crvenkasti obod (`var(--stale)`). Tekst glasi: *„Podaci su zastareli. Prag je 12 časova od poslednjeg zapisa u fajlu.”*
- **Sveži podaci (`data-stale="false"`):** Unutar praga od 12h tekst glasi: *„Zapis u fajlu je unutar praga od 12 časova. I dalje je sintetički DEMO.”*
- **Rad van mreže (`online: false`):**
  - Početna stranica: kontejner dobija `data-offline="true"` uz tekst *„Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.”*
  - Moje utakmice: na vrhu ekrana se prikazuje upozorenje `<p class="warning">Van mreže. Prikaz je iz poslednjeg učitavanja i ne donosi sveže termine.</p>`.
- **Greška u učitavanju (`error` prop):** Prikazuje se upozoravajući paragraf sa `role="alert"`.

---

## 3. Izvršene komande i dokazi

Verifikacija je izvršena na radnom stablu grane `mlsivanovic/matchahead-06-agenda`:

1. **Jedinični testovi aplikacije (`apps/web`):**
   ```bash
   cd apps/web && node --experimental-strip-types --test test/*.test.ts
   ```
   *Rezultat:* `39/39` prolaza, `0` padova (trajanje ~145ms).

2. **Jedinični testovi domena (`packages/domain`):**
   ```bash
   cd packages/domain && node --experimental-strip-types --test test/*.test.ts
   ```
   *Rezultat:* `20/20` prolaza, `0` padova (trajanje ~120ms).

3. **Ugovori podataka (`scripts/check-data-contracts.mjs`):**
   ```bash
   node scripts/check-data-contracts.mjs
   ```
   *Rezultat:* `20/20` prolaza, `0` padova.

4. **Automatizovani pregled stvarnog DOM-a u pregledaču (Puppeteer + Vite dev server na portu 18765):**
   ```bash
   node apps/web/.tmp-harness/test-suite.mjs
   ```
   *Rezultat:* `13/13` prolaza, `0` padova:
   - ✔ 1. Prazna agenda -> Klubovi link & empty state poruke (152ms)
   - ✔ 2. Ručni add/remove ažurira tačno jedan red i čuva razloge praćenja (428ms)
   - ✔ 3. Istovremene sledeće utakmice: „Još N u isto vreme” i sve kartice (192ms)
   - ✔ 4. Filteri sport / klub / takmičenje u Moje utakmice (584ms)
   - ✔ 5. Pristupačni detalj (aria-expanded, aria-controls, jedan otvoren) (367ms)
   - ✔ 6. Grupisanje: Predstojeće, Termin naknadno, Odloženo/otkazano, Arhiva (130ms)
   - ✔ 7. Nepoznato vreme: bez 00:00, bez ponoći, bez odbrojavanja (123ms)
   - ✔ 8. Promena vremenske zone / lokalnih datuma i pomeranje grupisanja (311ms)
   - ✔ 9. Uski 360px layout: odsustvo horizontalnog prelivanja i skrola (223ms)
   - ✔ 10. Indikatori zastarelosti i mrežnog statusa (stale/offline) (253ms)
   - ✔ 11. Polje za unos beleške: onDraft i data-draft-dirty atribut (352ms)
   - ✔ 12. Analiza stabilnosti unakrsnih filtera pri promeni sporta (260ms)
   - ✔ 13. Analiza live statusa i ponašanja odbrojavanja (125ms)
   - ✔ 14. Analiza prikaza završenih utakmica u Danas na početnom ekranu (125ms)

---

## 4. Pregled koda i uočene nepravilnosti (Bug & Code Inspection)

Tokom dubinskog pregleda koda uočene su sledeće stavke za buduće faze:

### Mana 1: Zadržavanje izabranog kluba pri promeni filtera sporta (Nizak/Srednji prioritet)
- **Lokacija:** `apps/web/src/ui/PersonalAgenda.tsx` (linije 140–208) i `applyAgendaFilters` u `PersonalAgendaHelpers.ts` (linija 77).
- **Opis:** Stanje filtera `filter` čuva se u lokalnom `useState<AgendaFilter>`. Kada korisnik u padajućem meniju izabere klub (npr. `FK Crvena zvezda`), a potom klikne na dugme drugog sporta (npr. `Košarka`), vrednost `filter.clubId` ostaje nepromenjena (`football:rs:crvena-zvezda`). Pošto nijedna košarkaška utakmica ne sadrži fudbalski klub ID, funkcija `applyAgendaFilters` odbacuje sve utakmice i ekran prikazuje *„Nema DEMO utakmice za ovaj filter.”*.
- **Reprodukcija:** Na ekranu „Moje utakmice” izabrati klub `FK Crvena zvezda` u selectu, zatim kliknuti na sport `Košarka`. Prikazuje se prazna lista.
- **Predlog za buduću integraciju:** Pri promeni `filter.sport` resetovati `clubId` i `competitionId` na `ALL_FILTER_VALUE`, ili filtrirati opcije u `clubOptionsForAgenda` prema izabranom sportu.

### Mana 2: `countdownLabel` ne filtrira `live` status (Nizak prioritet / granični slučaj)
- **Lokacija:** `apps/web/src/logic/agenda.ts` (linije 36–38).
- **Opis:** Funkcija `countdownLabel(fixture, nowMs)` proverava:
  ```ts
  if (fixture.status === 'finished' || fixture.status === 'cancelled' || fixture.status === 'abandoned') return null;
  ```
  Nedostaje provera `fixture.status === 'live'`. Ako izvor označi utakmicu kao `live`, a zbog prividnog odstupanja satova `Date.parse(fixture.startsAtUtc) >= nowMs`, `countdownLabel` će vratiti tekst odbrojavanja (npr. `počinje za manje od minuta`), dok `scheduleStatusLabel` bezbedno ispisuje `Počela prema rasporedu`.
- **Reprodukcija:** Poziv `countdownLabel` sa `status: 'live'` i `startsAtUtc` 10 sekundi u budućnosti u odnosu na `nowMs`.
- **Predlog:** Dodati `|| fixture.status === 'live'` u guard uslov funkcije `countdownLabel`.

### Zapažanje 3: Početna sekcija „Danas” uključuje završene utakmice iz tog dana
- **Lokacija:** `apps/web/src/ui/PersonalAgenda.tsx` (linije 69–82).
- **Opis:** Za razliku od sekcije „Sledeća utakmica” koja isključuje završene, otkazane i prekinute utakmice (`nextAgendaFixtures`), sekcije „Danas” i „Narednih sedam dana” filtriraju isključivo na osnovu poklapanja kalendarskog datuma (`fixtureCalendarDate(entry.fixture, timeZone) === today`). Ukoliko je utakmica danas završena, ona se prikazuje pod „Danas” sa statusom `Završeno`. Ovo je legitimno ponašanje u kalendaru (pregled celog dana), ali ga vredi evidentirati pre integracije u korenski `App.tsx`.

### Zapažanje 4: Nedostatak dugmeta „Detalj” na Početnom ekranu
- **Lokacija:** `apps/web/src/ui/PersonalAgenda.tsx` (linije 105–136).
- **Opis:** `PersonalAgendaHome` ne prosleđuje `onToggleDetail` komponenti `AgendaEntryCard`, pa se dugme za proširivanje detalja ne pojavljuje na karticama početnog ekrana. Korisnik detalje vidi tek prelaskom na „Moje utakmice”.

### Zapažanje 5: Sintaksa ID selektora sa dvotačkama
- **Lokacija:** `apps/web/src/ui/PersonalAgenda.tsx` (linija 410): `id={`agenda-detail-${fixture.id}`}`.
- **Opis:** Pošto `fixture.id` sadrži dvotačke (npr. `football:rs:crvena-zvezda...`), selektovanje preko `document.querySelector('#' + id)` izaziva CSS syntax error ukoliko se ne koristi `document.getElementById(id)` ili `CSS.escape(id)`. Atribut `aria-controls` radi ispravno jer uzima sirovi string ID tokena.

---

## 5. Zaključak

Komponente lične agende razvijene u zadatku 06 u potpunosti zadovoljavaju sve funkcionalne, vizuelne i pristupačne kriterijume postavljene specifikacijom. Prikaz u stvarnom DOM-u je čist, stabilan pod promenama stanja, bezbedan pri radu van mreže i responzivan na uskim ekranima (360px).

Komponente su spremne za uvezivanje u korensku aplikaciju (`App.tsx` i `screens.tsx`) onog trenutka kada koordinator završi auth integraciju (faza 04).
