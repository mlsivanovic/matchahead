# Pokrivenost besplatnih sportskih podataka

Provera: 26. septembar 2026. Sezona o kojoj je reč je 2026/27.
Ovaj dokument ne tvrdi da je zahtev „sve utakmice” rešen.

**Novije pojašnjenje korisnika:** preuzimanje rasporeda treba da se pokrene dugmetom „Pronađi utakmice”, a kasnije po potrebi „Osveži raspored”; stalno preuzimanje sportskih podataka nije cilj. Zaključci ovog dokumenta o ograničenjima TheSportsDB, API-Sports i football-data.org i dalje važe. Računica za devet ciklusa dnevno je zastarela pretpostavka. Proveru klika, prava i satova 00:00/01:00/02:00 zatvara `docs/data-on-demand-feasibility.md`.

Statusi:

- **POTVRĐENO** — besplatan poziv je stvarno vraćen i proveren u ovoj sesiji.
- **NEPOKRIVENO** — objavljeni obim ili stvarni odgovor ne daju traženi raspored.
- **NEPROVERENO** — nema poziva ovim nalogom ili ključem. Javna lista liga nije dokaz.

Otvaranje PWA ne sme da zove sportski API. Preuzimanje pripada kasnijem zajedničkom osvežavanju, ne browseru.

## Zaključak

Besplatna i potpuna pokrivenost srpskih klubova kroz domaća, regionalna i evropska takmičenja **nije potvrđena**. Jedini izvor koji je u ovoj sesiji stvarno odgovorio, TheSportsDB javni ključ `123`, vraća isečak od najviše 15 utakmica po sezoni i jednu narednu utakmicu po timu. To ne pokriva raspored.

API-Football i API-Basketball ostaju neprovereni kandidati za besplatan nalog od 100 zahteva dnevno. Njihov cenovnik kaže da besplatan plan ograničava sezone, a uslovi ne daju licencu za javnu objavu. Bez ključa se ne sme tvrditi da aktuelna sezona prolazi.

football-data.org besplatni plan ne sadrži srpska takmičenja ni košarku. Za ovaj proizvod je nepokriven.

## Šta je danas u sezoni

Učešće nije upisano kao trajna pretpostavka. Ovo je stanje na dan provere, iz navedenih izvora.

| Klub | Sport | Šta je objavljeno za 2026/27 | Izvor i datum |
|---|---|---|---|
| FK Crvena zvezda | fudbal | Superliga, kolo 11 na dan 10. oktobra protiv Radničkog 1923. Posle ispadanja iz kvalifikacija za Ligu šampiona i Ligu Evrope igra ligašku fazu Lige konferencije. | [Klupski raspored Superlige](https://www.crvenazvezdafk.com/sr-latn/vesti/zvezdin-raspored-u-superligi-za-sezonu-2026-27), tekst od 12. juna 2026, stranica otvorena 26. septembra 2026. [BBC](https://www.bbc.com/serbian/articles/cvgykrweppdo/lat), 28. avgust 2026. |
| FK Partizan | fudbal | Superliga. Kvalifikacije za Ligu konferencije završene ispadanjem; nema jesenje ligaške faze. TheSportsDB i dalje drži Ligu konferencije na kartici tima, što je zastarelo članstvo, ne dokaz učešća. | [BBC](https://www.bbc.com/serbian/articles/cvgykrweppdo/lat), 28. avgust 2026. TheSportsDB `lookupteam` 133960, 26. septembar 2026. |
| FK Vojvodina | fudbal | Superliga, vidi se u odigranim kolima. Evropske kvalifikacije su završene ranije u sezoni. | [Wikipedia, Superliga 2026/27](https://sr.wikipedia.org/wiki/%D0%A1%D1%83%D0%BF%D0%B5%D1%80%D0%BB%D0%B8%D0%B3%D0%B0_%D0%A1%D1%80%D0%B1%D0%B8%D1%98%D0%B5_%D1%83_%D1%84%D1%83%D0%B4%D0%B1%D0%B0%D0%BB%D1%83_2026/27.), izmena 23. septembra 2026. |
| KK Partizan | košarka | ABA liga, grupa B, i Evroliga. Nije u prvih 15 utakmica KLS koje je vratio besplatan poziv. | [HotSport](https://hotsport.rs/2026/08/27/aba-liga-raspored-2026-27-partizan-crvena-zvezda/), 27. avgust 2026. [NIN](https://www.nin.rs/sport/vesti/123987/pocinje-nova-sezona-evrolige-crvena-zvezda-i-partizan-ponovo-medu-20-klubova), 23. septembar 2026. |
| KK Crvena zvezda | košarka | ABA liga, grupa A, i Evroliga. Nije u tom KLS isečku. | Isti izvori kao za KK Partizan. |
| KK Vojvodina | košarka | Vidljiv u KLS rasporedu koji počinje 3. oktobra 2026. Ovo je drugi klub od FK Vojvodina. | TheSportsDB `eventsseason` liga 5121, 26. septembar 2026. |

FK Partizan i KK Partizan nisu isti tim. Besplatna pretraga `searchteams.php?t=Partizan` vratila je albanski Partizani B (`idTeam` 140673), ne beogradski FK ni KK. Ime nije dovoljan ključ.

## Matrica

„Besplatan pristup” važi samo ako je poziv obavljen. Provider ID iz TheSportsDB polja `idAPIfootballv3` nije provera API-Football naloga.

| Sport | Tim | Takmičenje | Sezona | Izvor | Provider ID | Pristup | Naredne utakmice | Vreme | Odlaganje / otkaz | Objava | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fudbal | FK Partizan, FK Crvena zvezda, FK Vojvodina | Superliga | 2026/27 | TheSportsDB | liga 4671 | Da, ključ `123` | Ne sve. Sezona seče na 15, od 17. jula do 1. avgusta. `eventsnext` daje još jednu | Delimično. Završene imaju lokalno vreme; naredna Zvezdina nema `strTimeLocal` | Viđen `strStatus=PST` na 2491205, uz `strPostponed=no`. Otkazivanje nije viđeno | Vidi uslove ispod | **NEPOKRIVENO** kao potpun raspored. Isečak je potvrđen |
| Fudbal | ista tri | Kup Srbije | 2026/27 | TheSportsDB | nema u listi za Srbiju | Lista ima 2 lige, ispod limita 10 | Ne | — | — | — | **NEPOKRIVENO** |
| Fudbal | ista tri | Liga šampiona, ligaška faza | 2026/27 | football-data.org | takmičenje jeste u besplatnih 12 | Ovi klubovi nisu u ligaškoj fazi | Nema njihovih utakmica te faze | — | — | **NEPROVERENO** | **NEPOKRIVENO** za njihove mečeve |
| Fudbal | FK Crvena zvezda | Kvalifikacije Lige šampiona i Lige Evrope | 2026/27 | football-data.org | nisu među besplatnih 12 | Ne | Ne | — | — | **NEPROVERENO** | **NEPOKRIVENO** |
| Fudbal | FK Crvena zvezda | Liga konferencije | 2026/27 | TheSportsDB | liga 5071 | Da | Ne. Prvih 15 je početak kvalifikacija 7–9. jula, bez srpskog kluba | UTC-sličan `strTimestamp` bez slova Z | U tom isečku nije viđeno | Vidi uslove | **NEPOKRIVENO** |
| Fudbal | FK Partizan | Liga konferencije, ligaška faza | 2026/27 | BBC + TheSportsDB kartica | kartica i dalje ima 5071 | Klub je ispao | Nema faze | — | — | — | Nije učesnik faze. Istorija kvalifikacija **NEPOKRIVENO** na besplatnom isečku |
| Fudbal | svi | Prijateljske | 2026/27 | TheSportsDB, football-data.org | nije vraćeno | Ne | Ne | — | — | — | **NEPROVERENO** da li neki drugi izvor ima feed; u ovim katalozima **NEPOKRIVENO** |
| Fudbal | sva navedena | sva navedena | 2026/27 | API-Football | Superliga kao 286 samo iz TheSportsDB polja, nije provereno kod njih | Nalog ne postoji u projektu | — | — | Dokumentacija ima statuse, nisu viđeni na ovom nalogu | Uslovi ne daju licencu objave | **NEPROVERENO** |
| Košarka | KK Vojvodina | KLS | 2026/27 | TheSportsDB | liga 5121, tim 143997 | Da | Samo ako stane u prvih 15, od 3. oktobra | Svih 15 ima isto `16:00:00`, status null, lokalno vreme null | Nije viđeno | Vidi uslove | **NEPOKRIVENO** kao potpun raspored |
| Košarka | KK Partizan, KK Crvena zvezda | KLS / kasnija Superliga | 2026/27 | TheSportsDB | 5121 | Nisu u vraćenom isečku | Ne | — | — | — | **NEPROVERENO** da li je prolećna faza već objavljena. Besplatan isečak je **NEPOKRIVENO** |
| Košarka | sva tri | Kup Radivoja Koraća | 2026/27 | TheSportsDB | nema u listi za Srbiju | Lista ima jednu ligu | Ne | — | — | — | **NEPOKRIVENO** u katalogu. Objava žreba **NEPROVERENO** |
| Košarka | KK Partizan, KK Crvena zvezda | ABA | 2026/27 | TheSportsDB | liga 4477 | Poziv uspeo, `events: null` i za `2026-2027` i za `2026`, isto i `eventsnextleague` | Ne | — | — | Vidi uslove | **NEPOKRIVENO**. Raspored jeste objavljen van ovog API-ja |
| Košarka | KK Partizan, KK Crvena zvezda | ABA 2 | 2026/27 | TheSportsDB + vest o grupama | liga 5706 postoji | Utakmice nisu tražene | Novinska podela grupa ih ne stavlja u ABA 2 | — | — | — | Nisu učesnici prema vesti od 27. avgusta 2026. Feed **NEPROVERENO** |
| Košarka | KK Partizan, KK Crvena zvezda | Evroliga | 2026/27 | TheSportsDB | nije u Evropi (5 liga, ispod limita 10) | Nije nađen ID | Ne | — | — | — | Katalog Evrope **NEPOKRIVENO** za taj upit. Postojanje ID-ja pod drugom državom **NEPROVERENO** |
| Košarka | KK Partizan, KK Crvena zvezda | Evrokup | 2026/27 | TheSportsDB + spisak Evrolige | liga 4547 | Utakmice nisu tražene | Spisak od 20 klubova stavlja oba u Evroligu | — | — | — | Nisu učesnici prema NIN-u, 23. septembra 2026. Feed **NEPROVERENO** |
| Košarka | sva navedena | sva navedena | 2026/27 | API-Basketball | — | Nalog ne postoji | — | — | — | Ista grupa uslova kao API-Football | **NEPROVERENO** |
| Košarka | sva | sva | — | football-data.org | — | Samo fudbal, 12 takmičenja | Ne | — | — | — | **NEPOKRIVENO** |

Zvanične strane Superlige, KLS-a i ABA lige ostaju referenca za poređenje. Postojanje stranice nije javni API ni dozvola za preuzimanje. Projekat se ne oslanja na nedokumentovane API-je rezultata.

## Šta je stvarno pozvano

Lokalni DNS za `www.thesportsdb.com` vraća `0.0.0.0`, pa pozivi nisu išli iz shell-a. Odgovori su uzeti 26. septembra 2026. preko spoljnog čitača stranica. Ključ `123` je javni test ključ iz [dokumentacije](https://www.thesportsdb.com/documentation), nije tajna.

| Poziv | Rezultat |
|---|---|
| `searchteams.php?t=Arsenal` | Arsenal, Soccer, `idTeam` 133604. Kontrolni poziv radi. |
| `searchteams.php?t=Partizan` | Jedan pogrešan tim: Partizani B, Albanija, Soccer, 140673. |
| `search_all_leagues.php?c=Serbia&s=Soccer` | Tačno dve lige: Superliga 4671 i Prva liga 5074. Sezona `2026-2027`. Opis Superlige i dalje kaže 16 klubova; sezona 2026/27 ima 14. |
| `eventsseason.php?id=4671&s=2026-2027` | Tačno 15 događaja, od 17. jula do 1. avgusta 2026. Poslednji pre sečenja je Novi Pazar–OFK 1:4. |
| `eventsnext.php?id=133960` | Jedna utakmica: Partizan–Novi Pazar, 10. oktobar 2026, `16:00:00` bez zone, `strTimeLocal` null, status `NS`. Protivnik nije upoređen sa delegiranjem FSS. |
| `eventsnext.php?id=133987` | Jedna utakmica: Radnički 1923–Crvena zvezda, 10. oktobar 2026, isti oblik vremena. Datum i par se slažu sa klupskim rasporedom od 12. juna 2026. Sat nije tamo naveden. |
| `lookupteam.php?id=133960` | Partizan Belgrade, Soccer, Beograd, Superliga. Druga liga na kartici je Liga konferencije, što je u suprotnosti sa ispadanjem. |
| `eventsseason.php?id=5071&s=2026-2027` | 15 najranijih utakmica kvalifikacija, 7–9. jul 2026. Nema Partizana, Zvezde ni Vojvodine. |
| `search_all_leagues.php?c=Serbia&s=Basketball` | Samo KLS, 5121, sezona `2026-2027`. |
| `eventsseason.php?id=5121&s=2026-2027` | 15 utakmica, 3–17. oktobar 2026, sve na `16:00:00`, status null. Među njima KK Vojvodina. Nema KK Partizana ni KK Zvezde. |
| `search_all_leagues.php?c=Europe&s=Basketball` | Pet liga, ispod limita 10: ABA 4477, ABA 2 5706, Liga šampiona 4548, EuroBasket žene 4890, Evrokup 4547. Evrolige nema. |
| `eventsseason.php?id=4477&s=2026-2027`, `s=2026`, `eventsnextleague.php?id=4477` | Sva tri odgovora su uspešan JSON `{"events":null}`. |

Odlaganje koje je stvarno viđeno: `idEvent` 2491205, Radnički 1923–Železničar Pančevo, 26. jul 2026, `strStatus` `PST`, rezultati null, `strPostponed` i dalje `no`. Novi termin nije u isečku. Otkazivanje, status TBD i paginacija preko 15 nisu viđeni. Dokumentacija ne nudi parametar stranice za `eventsseason`; limita je 15 na besplatnom ključu i 3000 na plaćenom.

`strTimestamp` nema sufiks zone. Kod završenih superligaških utakmica lokalno vreme je dva sata kasnije, što odgovara letnjem `Europe/Belgrade`, ali to nije ugovor. Naredne utakmice imaju prazno lokalno vreme. Model zato ne prihvata sat bez zone kao potvrđen UTC.

## API-Football i API-Basketball

Nisu pozvani. U projektu nema `.env` ni ključa. Direktno otvaranje `api-football.com` iz ovog okruženja dobija Cloudflare 403, pa su uslovi uzeti iz javnog izvoda stranice.

| Tvrdnja | Izvor | Datum izvora | Šta iz toga sledi |
|---|---|---|---|
| Free plan: 100 zahteva dnevno, reset u 00:00 UTC, nekorišćeno propada | [Cenovnik](https://www.api-football.com/pricing) i [vodič za kvotu](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage) | Cenovnik viđen 26. septembra 2026; vodič 27. jul 2026. | Dnevni plafon je 100 po planu. |
| Free: 10 zahteva u minutu. Pro je 7.500 dnevno i košta 19 USD za fudbal | Isti vodič i cenovnik | 2026. | Plaćeni plan nije u budžetu. |
| Košarka: Free 100 dnevno, Pro 7.500 za 15 USD. Besplatne sezone su ograničene | [api-basketball.com](https://api-basketball.com/) | Stranica viđena 26. septembra 2026. | Ista prepreka sezone, posebna kvota ako važi rečenica ispod. |
| „100 requests per day for each API” | [api-sports.io](https://api-sports.io/) | 11. septembar 2026. | Marketinški tekst kaže da se fudbal i košarka ne dele. Nije provereno zaglavlje naloga. |
| Besplatan plan pokriva skorašnje sezone, plaćeni dublju istoriju | [Početni vodič](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | 13. mart 2026. | Ne dokazuje sezonu 2026. |
| Greška naloga: „Free plans do not have access to this season, try from 2021 to 2023.” | [Reddit](https://www.reddit.com/r/webdev/comments/1kvug2h/footballapi_experience_issues_season_2025/) | 26. maj 2025. | Stariji dokaz suprotnog ograničenja. Zato sezona 2026 ostaje **NEPROVERENO**, ne nepokriveno. |
| Više naloga radi povećanja free limita je zabranjeno | [Uslovi](https://www.api-football.com/terms) | Stranica označena 26. avgust 2026. | Ne otvarati drugi nalog. |
| API ne daje licencu za objavu. Korisnik mora sam da traži prava od nosilaca. Preprodaja je zabranjena | Isti uslovi | 26. avgust 2026. | Javni JSON/ICS nije dozvoljen samim ključem. |
| Coverage na `/leagues` ne garantuje 100% podataka. Za takmičenje koje nije počelo features mogu biti false | [Dokumentacija](https://www.api-football.com/documentation) | Viđeno 26. septembra 2026. | Prazan coverage nije dokaz da takmičenja nema. |
| Košarka traži `x-apisports-key`. Coverage zavisi od sezone | [Basketball v1](https://api-sports.io/documentation/basketball/v1) | Viđeno 26. septembra 2026. | Bez ključa nema provere ABA, Evrolige ni KLS. |

Paginacija API-Football nije merena. U dokumentovanim primerima postoji `paging.current` i `paging.total`. Dok jedan poziv za sezonu 2026 ne vrati `paging`, broj stranica ostaje nepoznat i kvota ispod je samo računica.

## football-data.org

[Pokrivnost](https://www.football-data.org/coverage), otvorena 26. septembra 2026: besplatno i trajno su Liga šampiona, Primeira liga, Premijer liga, Eredivizija, Bundesliga, Ligue 1, Serie A, La Liga, Championship, brazilska Serie A, Svetsko prvenstvo i Evropsko prvenstvo. Srbije nema u tabeli svih takmičenja. Lige Evrope i Lige konferencije nisu u besplatnom bloku.

[Cenovnik](https://www.football-data.org/pricing) ostavlja besplatan plan, a dodatke naplaćuje. Registrovani besplatni klijent ima 10 poziva u minutu. To ne dodaje srpski fudbal ni košarku. Prava ponovne objave njihovog teksta nisu proverena u ovoj sesiji.

## TheSportsDB kvota i objava

[Dokumentacija](https://www.thesportsdb.com/documentation), 26. septembar 2026:

- 30 zahteva u minutu, HTTP 429, čekanje jedan minut.
- `eventsseason`: besplatno 15, premium 3000.
- `eventsnext` i `eventsnextleague`: besplatno 1.
- `searchteams`: besplatno 1. Napomena na stranici da je pretraga ograničena na Arsenal nije tačna za poziv Partizan; ipak se vraća jedan, često pogrešan, tim.
- V2 i livescore traže plaćen ključ. Cenovnik premium pristupa je 9 USD mesečno ili 295 USD jednokratno. To nije budžet od 0 €.

[Uslovi](https://www.thesportsdb.com/docs_terms_of_use.php), poslednja izmena 17. septembra 2026:

- Sadržaj sa zvaničnih krajnjih tačaka sme da se kopira, uz zabrane ispod.
- Besplatan ključ je za razvoj. Objava aplikacije u prodavnici aplikacija traži plaćenu pretplatu.
- Preprodaja API-ja je zabranjena.
- Tuđi grbovi i žigovi nisu ustupljeni.

Javna PWA na GitHub Pages nije prodavnica aplikacija. Uslovi ipak ne kažu da je ICS pretplata dozvoljena. Objava je zato ograničena, ne potvrđena. Grbovi se ne ugrađuju u proizvod dok pravo nije provereno.

## Dnevna potrošnja

Formula iz specifikacije:

`osvežavanja dnevno × zahtevi po osvežavanju + katalog + rezerva za ponavljanje`

Predloženi ritam, još uvek samo plan, jeste na tri sata: 8 zakazanih ciklusa i jedan ručni, dakle 9. Broj korisnika ne ulazi u formulu. Otvaranje aplikacije ne dodaje zahteve.

### TheSportsDB, izmereni oblik poziva

Jedan ciklus koji ponavlja ono što je danas imalo smisla:

| Zahtev | Broj |
|---|---|
| Sezona Superlige, KLS, Lige konferencije i ABA | 4 |
| ABA drugi pokušaj forme sezone i `eventsnextleague` | 2 |
| `eventsnext` za FK Partizan i FK Crvena zvezda | 2 |
| Zbir po ciklusu | 8 |

Katalog jednom dnevno: tri poziva za lige (Srbija fudbal, Srbija košarka, Evropa košarka). Rezerva od 15 pokriva ponavljanje posle 429.

`9 × 8 + 3 + 15 = 90` zahteva dnevno. To staje u 30 po minutu, jer je jedan ciklus 8 poziva. **Ne staje u limita od 15 zapisa.** Dodatni ciklusi ponavljaju isti isečak; ne otključavaju ostatak sezone. Zato je kvota ovde sekundarna prepreka.

### API-Football, računica, nije merenje

Ako bi sezona 2026 bila dozvoljena i ako bi liga stala na jednu stranu:

- tri ligaška poziva: Superliga, Kup, Liga konferencije;
- `9 × 3 + 2 katalog + 6 rezerva = 35` od 100.

Ako se umesto lige zove svaki od 14 superligaša: `9 × 14 = 126` još pre kupa i Evrope, što prelazi 100. Jedini kvotno moguć oblik je poziv po ligi, i samo dok je broj stranica mali. To važi tek posle stvarnog odgovora.

### API-Basketball, računica, nije merenje

Ako važi posebnih 100 i sezona 2026/27: Evroliga, ABA, KLS i Kup Koraća, jedna strana.

`9 × 4 + 2 + 8 = 46` od 100. ABA 2 i Evrokup nisu u ovom zbiru jer provera učešća za Beograd trenutno vodi na druga takmičenja. Ako paginacija ili sezonska zabrana postoje, računica pada.

### football-data.org

Koristan broj zahteva za ovaj proizvod na besplatnom planu je 0. Deset poziva u minutu ne pravi pokrivenost.

## Model i sintetički skup

Ugovori su u `packages/domain`. `Team.id` uključuje sport, pa `football:rs:partizan` i `basketball:rs:partizan` ne sudaraju. `Fixture.id` se gradi iz sporta, takmičenja, sezone, provajdera i njegovog ID-ja utakmice. Nema termina ni sponzora.

`startsAtUtc` postoji samo kao potvrđen trenutak sa `Z` ili brojčanim pomakom. Nepoznata satnica ostavlja `startsAtUtc` prazan i, ako datum postoji, drži `scheduledLocalDate`. Odlaganje bez novog termina prebacuje stari trenutak u `previousStartsAtUtc`.

`CoverageStatus.scheduleAvailability` razlikuje `unpublished` i `source_error`. Prazan ili nepotpun odgovor zadržava prethodni raspored i ne sme da se protumači kao otkazivanje. Otkazivanje je samo eksplicitan status.

`data/synthetic/domain-scenarios.json` je označen sa `kind: synthetic`. Datumi su u 2027. i izmišljeni su. Pokriva pomeranje, odlaganje, otkazivanje, datum bez sata, termin bez datuma i protivnika, i jedan derbi koji vide oba kluba.

Provera: `node scripts/check-data-contracts.mjs`.

## Šta korisnik može da podesi

Bez novca i bez drugog naloga:

1. Nalog na <https://dashboard.api-football.com>. Kartica nije potrebna. Besplatan plan se uključuje registracijom.
2. Iz dashboard-a uzeti posebno fudbalski i košarkaški ključ.
3. Vrednosti staviti u lokalni `.env`, koji git ignoriše, ili kasnije u GitHub Secrets. Imena su u `.env.example`: `APISPORTS_FOOTBALL_KEY` i `APISPORTS_BASKETBALL_KEY`.
4. Zaglavlje je `x-apisports-key`. Ne stavljati ključ u frontend.
5. Jedan probni poziv, pa stati: `GET https://v3.football.api-sports.io/fixtures?league=286&season=2026` i košarkaški `GET https://v1.basketball.api-sports.io/games?season=2026-2027` za ligu koju dashboard stvarno vrati za ABA ili Evroligu.
6. Ako telo sadrži `plan` i tekst da besplatne sezone ne uključuju traženu godinu, aktuelna sezona je nepokrivena. Tada se ne prelazi na Pro.
7. `FOOTBALL_DATA_TOKEN` ne otvara srpska takmičenja. Može se registrovati radi potvrde, nije potreban za ovaj zaključak.

Posle tog jednog para poziva može se doneti odluka da li automatski izvor uopšte postoji. Dok je odgovor nepokriven, ostaju dve kasnije mogućnosti van ovog zadatka: sužen spisak takmičenja koji korisnik izričito prihvati, ili ručno održavan raspored. Ni jedno ni drugo nije ispunjen zahtev za sve utakmice.
