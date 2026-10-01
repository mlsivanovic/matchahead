# Nezavisna revizija izvora i QA plan za Fazu 05 (MatchAhead)

Datum revizije: 1. oktobar 2026.  
Autor revizije: Gemini CLI (nezavisni reviewer u orkestraciji `run_6d3c53cc583e`, zadatak `task_804dbb018b0e`, dispatch `ctx_a7b5497562f3`).  
Predmet: Faza 05 — Tehnička revizija izvora, vremenskih dokaza i QA plana za preuzimanje rasporeda na zahtev (sezona 2026/27).  
Referentna dokumenta: `docs/phase-05-work-contract.md`, `docs/phase-05-source-proposal.md`, `docs/data-feasibility.md`, `docs/data-on-demand-feasibility.md`.

---

## 1. Sažetak revizije

Ovaj dokument pruža tehničku i činjeničnu proveru javnih izvora podataka za FK Partizan, FK Crvena zvezda, KK Partizan i KK Crvena zvezda u sezoni 2026/27:
1. **Empirijski dokaz pristupa i sezone:** Rezultati GET proba (`scripts/probe-schedule-sources.mjs`) bez zaobilaženja tehničkih mera.
2. **Činjenični dokazi satnica:** Jasno razdvajanje potvrđenih UTC satnica od datuma bez satnice i placeholder polja. Ako zona i sat nisu dokazivi bez pretpostavki, `startsAtUtc` je `null`.
3. **Status prava i ugovorni uslovi:** Isključivo dokumentovani nalazi iz uslova korišćenja izvora i merodavnih propisa. **MatchAhead nema verifikovanu licencu za preuzimanje niti pristanak nosilaca prava.** Korišćenje zavisi od odluke operatera, a javna redistribucija (ICS) ostaje ograđena (gated).
4. **Nezavisni QA plan:** Definisane provere za serverske adaptere i klijentski PWA tok, pre završne verifikacije integrisanog koda.

---

## 2. Tabela izvora i empirijske GET probe

Probe su izvršene 1. oktobra 2026. skriptom `scripts/probe-schedule-sources.mjs` uz standardni `User-Agent`.

| Izvor / URL | HTTP Status | Veličina | Obim i sezona (2026/27) | robots.txt (Zapažanje) | Tehnički identifikatori i zapažanja |
|---|---|---|---|---|---|
| **ABA Liga — Kalendar**<br>[`aba-liga.com/calendar/26/1/`](https://www.aba-liga.com/calendar/26/1/) | **200 OK** | 982 KB | **Grupna faza 2026/27** (sezona 26 u URL-u). 18 kola po grupama A i B, ukupno 36 mečeva za KK CZV i KK Partizan. | `Allow: *`<br>(Nema zabrana) | Stabilni numerički ID meča u linkovima (npr. `/match/2/26/1/Overview/...`). **Satnicu ima samo 7 mečeva; 25 mečeva ima samo datum, a 4 su `TBA`.** |
| **FSS — Superliga Srbije**<br>[`fss.rs/takmicenje/...`](https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/) | **200 OK** | 426 KB | **Regularni deo 2026/27**. Svih 26 kola u jednom HTML dokumentu (189 blokova utakmica, 40+ pominjanja `ПАРТИЗАН` i `ЦРВЕНА ЗВЕЗДА`). | `Disallow: /wp-admin/`<br>`Allow: /takmicenje/` | Odigrani mečevi imaju linkove ka izveštajima `/izvestaj-sa-utakmice/{id}`. Buduća kola nemaju linkove ka izveštajima, a sat je ispisan kao `00:00` (placeholder za TBD satnicu). |
| **FK Partizan — Zvanični sajt**<br>[`partizan.rs/utakmice`](https://partizan.rs/utakmice) | **200 OK** | 906 KB | Nuxt 3 SSR podaci (`__NUXT_DATA__`, 797 KB). Sadrži samo **1 sledeći meč** (`matchesScheduled: [matchId 235]`) i odigrane mečeve (`matchesCompleted: 48`). | `Allow: /` | Strukturiran JSON objekat (`matchId: 235`, `matchTimeUTC: "0000-00-00 00:00:00"`). Nije izvor za celu sezonu, već sekundarna potvrda sledećeg meča. |
| **FK Crvena zvezda — Zvanični sajt**<br>[`crvenazvezdafk.com/...`](https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati) | **200 OK** | 298 KB | Webflow CMS lista. Prikazuje Superligu i Ligu konferencije (15.10.2026 18:45 protiv FK Lugano). | `Allow: /` | **Konfliktna polja na stranici:** Hero sekcija ima `10.10.2026 13:00`, dok tabela ispod za isti meč ima `10.10.2026 00:00`. Parsiranje se ne sme oslanjati na prvi sat pronađen na stranici. |
| **Evroliga — Zvanični PDF kalendar**<br>[`ftpserver.euroleague.net/...`](https://ftpserver.euroleague.net/media/2026-27_EL_RS_CALENDAR_PRINTABLE.pdf) | **200 OK** | 295 KB | **Regularna sezona 2026/27** (38 kola). Svih 38 mečeva za KK Partizan i 38 za KK Crvena zvezda (uključujući 2 večita derbija). | Javno objavljeno u Media Centre saopštenju ([#24407](https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407)) uz verifikovan tačan link u HTML-u | Sadrži paralelne kolone `TIME LOCAL` i `TIME GMT` za svaku utakmicu. Zaglavlje ima `%PDF` potpis. Pristup bez bot zaštite (čist HTTP 200). Statički bazni raspored; ne sadrži naknadna pomeranja tokom sezone. Lokalna ekstrakcija; Worker okruženje nije verifikovano. |
| **KK Partizan — Zvanični sajt**<br>[`partizan.basketball/takmicenja`](https://partizan.basketball/takmicenja) | **200 OK** | 32 KB | **Zastareli podaci.** Prikazuje tabelu Evrolige za sezonu 2025/26 (utakmice iz septembra/oktobra 2025). | `Allow: /` | Nije ažuriran za 2026/27 u trenutku probe. Ne sme se koristiti bez validacije godine u datumu meča. |
| **KK Crvena zvezda — Zvanični sajt**<br>[`kkcrvenazvezda.rs/calendar`](https://kkcrvenazvezda.rs/calendar) | **200 OK** | 198 KB | Sadrži navigaciju i šablone za kalendar, ali detaljan raspored 2026/27 zahteva klijentski JavaScript / dinamičko učitavanje. | `Allow: /` | Nije pogodan za statički HTML parser bez headless pretraživača. |
| **Evroliga — Game Center**<br>[`euroleaguebasketball.net/...`](https://www.euroleaguebasketball.net/en/euroleague/game-center/) | **429 Too Many Requests** | 31 KB | Nedostupno za skripte. Odgovor nosi Vercel Bot Mitigation (`x-vercel-mitigated: challenge`). | — | Tehnički blokiran za direktni web scraping. Zaobilaženje bot izazova zabranjeno. Odgovor servisa: `kind: "source-blocked"`. |
| **Evroliga — ECAL Widget**<br>[`euroleaguebasketball.ecal.com`](https://euroleaguebasketball.ecal.com/) | **200 OK** | 2.3 KB | Skripta za sinhronizaciju korisničkog kalendara (`sync.ecal.com/v2/ecal.widget.js`). | — | Vidžet za direktan lični upis u Google/Apple kalendar, nije API za preuzimanje podataka. |
| **TheSportsDB — Besplatni ključ (123)**<br>`api/v1/json/123/...` | **200 OK** | 12 KB | Superliga (4671): vraća 15 mečeva (isečeno 1. avgusta 2026). ABA (4477): vraća `{"events":null}`. | — | Ograničenje besplatnog ključa na 15 zapisa onemogućava preuzimanje sezone. |

---

## 3. Matrica pokrivenosti po takmičenjima (Sezona 2026/27)

Statusi usklađeni sa `ScheduleAvailability` enumom iz `packages/domain/src/types.ts`:

| Sport | Klub | Takmičenje | Sezonska faza | Izvor | `ScheduleAvailability` | `TimePrecision` | Činjenično obrazloženje |
|---|---|---|---|---|---|---|---|
| Fudbal | FK Partizan | Superliga Srbije | Regularni deo (kola 1–26) | FSS HTML | `published` | `date_only` | FSS objavljuje 26 kola; buduća kola imaju `00:00` placeholder (`startsAtUtc: null`). |
| Fudbal | FK Crvena zvezda | Superliga Srbije | Regularni deo (kola 1–26) | FSS HTML | `published` | `date_only` | FSS raspored; buduća kola imaju `00:00` placeholder (`startsAtUtc: null`). |
| Fudbal | FK Crvena zvezda | UEFA Liga konferencije | Ligaška faza (6 kola) | FK CZV sajt | `published` | `unconfirmed_clock` (kolo 1)<br>`date_only` (kasnija) | 1. kolo (Lugano, 15.10. 18:45) navodi lokalni sat bez vremenske zone (`startsAtUtc: null`). Kasnija kola bez ispisanog sata ostaju `date_only`. |
| Fudbal | FK Partizan | Evropska takmičenja | 2026/27 | — | `unknown` | `unknown` | U odsustvu verifikovane primarne stranice o eliminaciji/učešću, status je `unknown`. |
| Fudbal | Oba FK | Kup Srbije | 2026/27 | — | `unknown` | `unknown` | U odsustvu zvaničnog rasporeda/žreba sa primarnim URL-om, status je `unknown`. |
| Košarka | KK Partizan | ABA Liga | Regularna grupna faza (18 kola) | ABA HTML | `published` | `date_only` / `unconfirmed_clock` | Od 18 mečeva, samo 7 ima sat, 25 ima samo datum, a 4 su `TBA`. Za sve važi `startsAtUtc: null`. |
| Košarka | KK Crvena zvezda | ABA Liga | Regularna grupna faza (18 kola) | ABA HTML | `published` | `date_only` / `unconfirmed_clock` | Isti status u grupi A. 1. kolo je `TBA`, kasnija kola većinom bez satnice (`startsAtUtc: null`). |
| Košarka | Oba KK | ABA Liga | Top 8 i završnica | — | `unpublished` | `unknown` | Parovi i satnice zavise od plasmana u grupama; žreb nije objavljen. |
| Košarka | KK Partizan | Evroliga | Regularna sezona (kola 1–38) | Zvanični PDF kalendar | `published` | `utc_confirmed` | Svih 38 mečeva ima paralelne `LOCAL` i `GMT` satnice. `startsAtUtc` je verifikovan. |
| Košarka | KK Crvena zvezda | Evroliga | Regularna sezona (kola 1–38) | Zvanični PDF kalendar | `published` | `utc_confirmed` | Svih 38 mečeva ima paralelne `LOCAL` i `GMT` satnice. `startsAtUtc` je verifikovan. |
| Košarka | Oba KK | Evroliga | Play-in i Final Four | — | `unpublished` | `unknown` | Parovi nisu izvučeni. |
| Košarka | Oba KK | KLS (Domaća liga) | 2026/27 | — | `unknown` | `unknown` | U odsustvu primarnog URL-a o propozicijama i rasporedu za ove klubove, status je `unknown`. |
| Košarka | Oba KK | Kup Radivoja Koraća | 2026/27 | — | `unknown` | `unknown` | U odsustvu objavljenog žreba i primarnog URL-a, status je `unknown`. |

---

## 4. Analiza vremenskih dokaza i vremenskih zona

Prema domenskom ugovoru (`packages/domain/src/types.ts`):
- `startsAtUtc` sme sadržati samo verifikovan ISO 8601 UTC trenutak (sa `Z` ili numeričkim pomakom).
- Ako satnica nije potvrđena ili je zona dvosmislena, **`startsAtUtc` OBAVEZNO ostaje `null`**, uz `timeConfirmed: false` i `status: "time_tbd"`.

### 4.1. ABA Liga: Dvosmislenost oznake "CET" i odsustvo satnica
- **Empirijski nalaz:** Od 36 utakmica beogradskih klubova u ABA kalendaru:
  - 4 utakmice imaju oznaku `TBA`.
  - **25 utakmica ima samo datum bez ikakvog sata** (npr. `Sunday, 18.10.2026 B`).
  - Samo 7 utakmica ima ispisan sat (npr. `05.10.2026 18:30 CET`).
- **Analiza zone:** U oktobru 2026. na Balkanu važi letnje računanje vremena (CEST, UTC+2). Oznaka `CET` je formalno UTC+1, dok se u praksi koristi kolokvijalno. Pošto satnica i zona nisu nesumnjivo utvrđeni, primena pretpostavljenog pomaka je nedozvoljena.
- **Pravilo obrade:** Za sve utakmice ABA lige koje nemaju verifikovan UTC sat:
  `startsAtUtc = null`, `timeConfirmed = false`, `status = "time_tbd"`.

### 4.2. FSS Superliga: Placeholder 00:00
- FSS za sva buduća kola navodi `00:00` (npr. `10.10.2026. 00:00`). Odigrane utakmice imaju stvarne sate (npr. `19:00`, `20:00`).
- Sat `00:00` je placeholder koji označava da tačan termin nije delegiran.
- **Pravilo obrade:** `startsAtUtc = null`, `scheduledLocalDate = "2026-10-10"`, `status = "time_tbd"`.

### 4.3. FK Crvena zvezda: Uočeni konflikt polja na stranici i nevalidnost regex heuristike
- Hero sekcija sajta prikazuje `10.10.2026 13:00` u okviru widgeta za odbrojavanje, dok tabela rasporeda ispod za isti meč protiv Radničkog 1923 prikazuje `10.10.2026 00:00`.
- Uočeni konflikt vrednosti na istoj stranici (13:00 naspram 00:00) činjenica je iz izvora, a ne pretpostavka o internim šablonima CMS-a.
- Ovaj oprečni podatak dokazuje da naivno parsiranje prvog pronađenog sata (npr. regex `\d{2}:\d{2}`) proizvodi netačne podatke. Za utakmice gde je u tabeli navedeno `00:00`, primenjuje se `startsAtUtc = null`, `status = "time_tbd"`.

### 4.4. Zvanični Euroleague kalendar: Verifikovane GMT satnice
- Dokument `2026-27_EL_RS_CALENDAR_PRINTABLE.pdf` direktno je povezan u Media Centre saopštenju ([#24407](https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407)), što je potvrđeno proverom HTML sadržaja saopštenja.
- Binarni tok sadrži `%PDF` potpis i naslov `2026-27 EUROLEAGUE REGULAR SEASON CALENDAR`.
- Dokument sadrži paralelne kolone `TIME LOCAL` i `TIME GMT`:
  - *Oktobar (letnje vreme):* 22.10.2026 Partizan–Zvezda -> `LOCAL 20:45`, `GMT 18:45` (razlika +02:00, CEST).
  - *Februar (zimsko vreme):* 11.02.2027 Zvezda–Partizan -> `LOCAL 20:00`, `GMT 19:00` (razlika +01:00, CET).
- GMT kolona u ovom zvaničnom dokumentu omogućava postavljanje potvrđenog `startsAtUtc` (npr. `"2026-10-22T18:45:00Z"`) uz `timeConfirmed: true` i `status: "scheduled"`.
- *Metodološka napomena:* Brojanje tekstualnih tokena u sirovom tekstu (38 pominjanja za svaki tim i skup kola 1..38) predstavlja empirijsku opservaciju; end-to-end ekstraktovanje zahteva parsiranje pojedinačnih redova tabele.

---

## 5. Arhitektura stabilnog identiteta utakmica

Format ID-ja propisan domenskim modelom:
`{sport}:{competitionId}:{seasonId}:{provider}:{providerFixtureId}`

1. **ABA Liga:** Numerički ID iz linka meča (`/match/{matchId}/...`):
   `basketball:aba:2026-2027:aba:{matchId}` (npr. `basketball:aba:2026-2027:aba:2`).
2. **FSS Superliga:** Buduća kola nemaju izveštaj ID u tabeli. U dvokružnom sistemu od 26 kola svaki par se sastaje tačno jednom na terenu tima A:
   `football:superliga:2026-2027:fss:{homeTeamSlug}-{awayTeamSlug}`.
   Nakon odigravanja, `providerAliases` povezuje zvanični `reportId`.
3. **Evroliga:** Kanonski ID se gradi isključivo iz parova i domaćinstva u dvokružnom sistemu, bez vezivanja za kolo, kako bi preživeo naknadna pomeranja kola:
   `basketball:euroleague:2026-2027:euroleague:{homeTeamSlug}-{awayTeamSlug}`.
   Kolo (`round`) se čuva isključivo u metapodacima objekta (`fixture.round`), dok se provajderski specifični ključevi ili izveštaji mapiraju preko `providerAliases`.
4. **Deduplikacija derbija:** Pošto se ID gradi deterministički iz parova i takmičenja, večiti derbi dobija identičan `fixture.id` na oba kluba, sprečavajući dupli unos u ličnoj agendi.

---

## 6. Činjenični uslovi izvora, merodavni propisi i operativni status

### 6.1. Nalazi iz uslova korišćenja izvora
1. **Zvanični uslovi Evrolige ([`https://inform.euroleague.net/terms`](https://inform.euroleague.net/terms), važeći od 16. maja 2025):**
   - Član *Euroleague Platforms Content* eksplicitno ograničava licencu na privatan pristup i upotrebu **NA PLATFORMAMA EVROLIGE** (*to access and use the Euroleague Platforms privately for non-commercial purposes*), a ne u eksternim aplikacijama trećih lica.
   - Član *Euroleague Basketball Statistics* uređuje statistiku učinka igrača i utakmica (stav 7 izričito zabranjuje upotrebu u vezi sa bilo kojim servisom koji sadrži bazu sveobuhvatnih, redovno ažuriranih statistika bez prethodnog pristanka). Ne može se automatski pretpostaviti da se odredbe o statističkim bazama direktno primenjuju na novinski PDF raspored utakmica (`2026-27_EL_RS_CALENDAR_PRINTABLE.pdf`), ali ni taj dokument ne sadrži dozvolu za eksternu automatizovanu distribuciju.
   - **Opseg:** MatchAhead je višekorisnička aplikacija i ne poseduje ugovornu licencu Evrolige. Budžet od 0 € ne predstavlja pravni osnov za preuzimanje.
2. **Uslovi domaćih sajtova (FSS, ABA, klubovi):**
   - Eksplicitni uslovi korišćenja ili dozvole za automatizovano preuzimanje podataka na javno dostupnim stranicama rasporeda **nisu pronađeni**. Ovo ne dokazuje da u opštim aktima saveza/klubova ili zakonodavstvu ne postoje druga ograničenja.
   - `robots.txt` (RFC 9309) je tehnički protokol za web indeksere, a ne pravni ugovor ili licenca.

### 6.2. Merodavni zakonski propisi i sudska praksa
- **Zakon o autorskom i srodnim pravima Republike Srbije (ZASP):**
  - Zvanični tekst dostupan preko Zavoda za intelektualnu svojinu ([ZIS](https://www.zis.gov.rs/prava/autorsko-i-srodna-prava/)).
  - Zakon o izmenama i dopunama ZASP ([„Sl. glasnik RS”, br. 66/2019](https://www.parlament.gov.rs/upload/archive/files/lat/pdf/zakoni/2019/225-19%20-%20Lat.pdf)):
    - **Član 5a stav 4. ZASP (izmene 2019):** *„Zaštita autorskim pravom se ne odnosi na sadržinu baze podataka niti se takvom zaštitom na bilo koji način ograničavaju prava koja postoje na tom sadržaju.”*
- **Sudska praksa Suda pravde EU (CJEU):**
  - **C-604/10 *Football Dataco* ([ECLI:EU:C:2012:115](https://curia.europa.eu/juris/liste.jsf?num=C-604/10)):** Sud je presudio da baza podataka/raspored uživa autorskopravnu zaštitu samo ako izbor ili raspored podataka predstavlja sopstvenu intelektualnu kreaciju autora (uslov originalnosti). Rutinski rasporedi određeni tehničkim pravilima lige taj uslov po pravilu ne ispunjavaju, ali to se ceni od slučaja do slučaja i ne predstavlja automatsko izuzeće.
  - **C-30/14 *Ryanair v PR Aviation* ([ECLI:EU:C:2015:10](https://curia.europa.eu/juris/liste.jsf?num=C-30/14)):** Sud je izričito utvrdio da kada baza podataka ne uživa autorskopravnu niti *sui generis* zaštitu, vlasnik sajta zadržava ugovornu slobodu (*freedom of contract*) da **kroz Uslove korišćenja ugovorno zabrani ili ograniči neovlašćeni scraping svojih podataka**.
  - **Zaključak o praksi CJEU:** Sudska praksa EU ne pruža nikakav opšti „legal clearance” za preuzimanje rasporeda, jer ugovorna ograničenja i uslovi korišćenja ostaju na snazi nezavisno od autorskog statusa baze.

### 6.3. Operativni status i preporuka
- **MatchAhead nema verifikovanu licencu za preuzimanje podataka sa ovih izvora.**
- Nema pravnog osnova za proglašavanje bilo kakvog „pravnog clearance-a” ili „potpune pravne usklađenosti”.
- **Preporuka operateru:**
  1. Za potrebe istraživanja i tehničke demonstracije (Faza 05), tehnički adapteri demonstriraju mogućnost čitanja podataka.
  2. U produkcijskom okruženju, servisi za koje ne postoji eksplicitno odobrenje mogu se transparentno označiti statusom `kind: "source-blocked"` ili `scheduleAvailability: "unknown"`.
  3. Javni neautentifikovani ICS feed ostaje **ograđen (gated)** kako bi se izbegao rizik povrede ugovornih uslova (*Ryanair C-30/14*).

---

## 7. QA Plan i strategija verifikacije Faze 05

### Nivo 1: Deterministička provera mrežnih proba (`scripts/probe-schedule-sources.mjs`)
- **Komanda:** `node scripts/probe-schedule-sources.mjs` (mora vratiti exit code 0).
- Verifikuje HTTP odzive, detekciju 38 kola Evrolige u PDF-u, detekciju 26 kola Superlige i ABA strukturu.

### Nivo 2: Serverski servis rasporeda (`experiments/schedule-service/`)
Grok mora testirati:
1. **Parser ABA Lige:** Mapiranje utakmica bez potvrđenog sata u `startsAtUtc: null` i `status: "time_tbd"`.
2. **Parser FSS Superlige:** Mapiranje `00:00` u `startsAtUtc: null`.
3. **Parser Evrolige (PDF):** Ekstrakcija 38 kola i čitanje GMT kolone za `startsAtUtc`.
4. **Keširanje i kuldaun:** Drugi zahtev unutar 15 minuta vraća keš bez mrežnih poziva. Simulacija greške izvora primenjuje `stale-while-revalidate`.
5. **Autentifikacija:** Odbijanje zahteva bez Firebase Bearer tokena.

### Nivo 3: Izvodljivost izvršavanja na platformi (0 € budžet i Cloudflare Workers / Durable Objects)
- **Razgraničenje budžeta procesiranja (primarna dokumentacija Cloudflare):**
  - **Ingress Worker (Free plan):** Ograničen na standardnih 10 ms CPU po zahtevu. Njegova uloga je isključivo jeftina provera metoda, putanje, porekla (CORS), veličine tela i prosleđivanje zahteva. Verifikacija Firebase tokena/potpisa, trajne kvote (rate limiting), parsiranje i skladištenje izvršavaju se unutar Durable Object-a.
  - **SQLite Durable Object:** Prema zvaničnoj specifikaciji platformskih limita ([Cloudflare DO Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)), CPU budžet po zahtevu u SQLite Durable Object-u iznosi **30 sekundi** (fusnota 4: resetuje se na 30 s po svakom dolaznom zahtevu) i nije uslovljen plaćenim planom. Prema cenovniku ([Cloudflare DO Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)), SQLite DO je dostupan na Free planu (100.000 zahteva/dan, 13.000 GB-s/dan, 5 GB skladišta; prekoračenje kvote odbija zahteve bez naplate).
- **Razgraničenje 10 ms limita i status runtime dokaza:**
  - Dokumentovani budžet od 30 s u Durable Object-u uklanja tvrdnju o 10 ms neizvodljivosti kao razlog za odustajanje od obrade u DO-u.
  - Stvarni dokaz izvođenja HTML/PDF parsera u `workerd` runtime okruženju (uz `node:zlib` kompatibilnost ili `DecompressionStream`) ostaje na čekanju (runtime proof pending).
- **Preporuka i QA kriterijum:**
  - Ingress Worker ostaje minimalan i lagan; kapija objavljivanja izvora (`publication`) ostaje `unknown` po defaultu za neproverene izvore.
  - Za produkcijski servis rasporeda target ostaje Worker ulaz povezan sa SQLite Durable Object adapterom.
  - Lokalni Node.js dokaz (fs moduli) služi samo za offline verifikaciju, dok završni QA zahteva proveru pod `workerd` okruženjem i dokumentovanje izmerenog edge CPU statusa i limita memorije/baze bez pretpostavke o promeni hostinga ili plaćenom planu (Free nalog ostaje nepotvrđen 403 u lokalnom okruženju).

### Nivo 4: Klijentski PWA tok (`apps/web/`)
Muse mora verifikovati:
1. Prikaz pronađenih mečeva grupisan po takmičenjima, uz jasnu oznaku `time_tbd` za nepotvrđene termine.
2. Rad dugmeta „Osveži raspored” uz poštovanje kuldauna.
3. Rad dugmeta „Dodaj u agendu” i deduplikaciju derbija.
4. Prikaz sačuvanih mečeva u offline režimu.

### Nivo 5: Završna integrisana QA provera (Gemini CLI)
- Nakon što koordinator integriše kod u zajedničku granu, Gemini CLI će izvršiti nezavisnu završnu proveru:
  - Mobilni pregled na 390px preko Puppeteer skripte (`scripts/check-schedule-ui.mjs`).
  - Provera celog toka prijave, pretrage rasporeda i ažuriranja agende.
  - Provera da u DOM-u nema `NaN` datuma niti satnica `00:00:00`.

---

## 8. Zaključak

1. **Tehnička izvodljivost:**
   - ABA kalendar i FSS Superliga pružaju javne podatke za domaća prvenstva, ali sa nepotpunim satnicama (većina mečeva je `date_only` ili `time_tbd`).
   - Zvanični Euroleague PDF kalendar sadrži 38 kola sa GMT satnicama. Dokumentovani budžet od 30 s CPU u SQLite Durable Object-u uklanja prepreku od 10 ms, dok stvarni dokaz izvođenja pod `workerd` okruženjem ostaje predmet empirijske provere u završnom QA.
2. **Pravni i ugovorni status:**
   - MatchAhead nema verifikovanu licencu. Korišćenje podataka zavisi od odluke operatera, a javni ICS feed ostaje ograđen (gated).
3. **Nezavisni QA:**
   - QA plan postavlja objektivne kriterijume verifikacije; Gemini CLI ostaje spreman za završno testiranje nakon integracije.
