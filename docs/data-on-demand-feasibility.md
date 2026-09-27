# Pronalazak utakmica na klik — provera 01B

Provera: 26. septembar 2026. Sezona je 2026/27. Ovaj dokument ne tvrdi da je zahtev „sve tada objavljene utakmice” automatski rešen.

Korisnik bira sport, klub i sezonu, pritisne „Pronađi utakmice” i očekuje sve **tada objavljene** buduće utakmice. Kasnije sam bira „Osveži raspored”. Stalno preuzimanje sportskog rasporeda nije zahtev. Zadatak 01 nije potvrdio potpun izvor. Ovaj zadatak proverava da li taj jedan klik ima dopušten i dovoljan izvor. Lokalni dokaz spajanja radi samo nad izmišljenim odgovorima u `data/synthetic/find-fixtures-scenarios.json`.

**Zaključak.** Tok jednog klika, zajednički keš, deduplikacija po stabilnom ID-u i status po takmičenju mogu da se naprave bez plaćenog servisa. Nije nađen nijedan besplatan izvor koji istovremeno ima potpun raspored ovih klubova i pravo da MatchAhead taj raspored upiše u svoju agendu, javni JSON ili svoj ICS. Za 0 € danas se može dokazano automatizovati samo lokalna funkcija nad sintetičkim podacima i ponuda **direktne** pretplate tamo gde je pružalac sam nudi korisniku. Unos tuđih utakmica u MatchAhead ostaje BLOCKED ili UNKNOWN.

Javna HTML stranica nije API i nije dozvola za javni feed. Nedokumentovani privatni endpoint nije produkcioni plan.

## Mapa takmičenja, 26. septembar 2026.

„Objavljeno” znači da su parovi ili datumi javno navedeni. Sat bez zone, i sat 00:00, 01:00 ili 02:00 bez drugog dokaza, ostaje nepotvrđen. Još neizvučena faza nije pronađena utakmica.

### FK Partizan — `football:rs:partizan`

| Takmičenje | Objava rasporeda | Buduće utakmice |
|---|---|---|
| Superliga Srbije | Parovi kola 1–26 jesu na stranici FSS. Buduća kola imaju datum, a sat 00:00 ili prazan sat. | Datumi objavljeni, satnice nepotvrđene. |
| Kup Srbije | Pretkolo od 20. avgusta 2026. ne uključuje ovaj klub. | Ulaz superligaša nije izvučen. Posebno stanje: nije objavljeno. |
| Liga šampiona, Liga Evrope, ligaška faza Lige konferencije | Klub nije u tim fazama. Kvalifikacije za Konferencijsku ligu su završene ispadanjem. | Nema buduće faze. To nije prazan feed. |
| Prijateljske | Klupski sajt 22. septembra 2026. najavljuje jednu utakmicu, 27. septembra u 15:00. | Jedna vest, ne feed. Spisak svih prijateljskih je UNKNOWN. |

### FK Crvena zvezda — `football:rs:crvena-zvezda`

| Takmičenje | Objava rasporeda | Buduće utakmice |
|---|---|---|
| Superliga Srbije | Isti FSS raspored. Kolo 11, 10. oktobar 2026, Radnički 1923–Crvena zvezda, sat 00:00 ili prazan. | Datumi objavljeni, satnice nepotvrđene. |
| Kup Srbije | Nije u pretkolu od 20. avgusta 2026. | Nije objavljeno. |
| Liga šampiona i Liga Evrope, ligaške faze | Nije učesnik tih faza. | Nema tih utakmica. |
| Liga konferencije, ligaška faza | UEFA je objavila šest parova. Deo satnica je 18:45, deo satnica na spisku po timu nedostaje. | Objavljeni parovi ligaške faze. Sat bez ispisanog sata ostaje nepotvrđen. |
| Liga konferencije, nokaut | Parovi se određuju posle ligaške faze. | Nije izvučeno. Posebno stanje, ne prazan spisak. |
| Prijateljske | Nije nađen feed. | UNKNOWN. |

### KK Partizan — `basketball:rs:partizan`

| Takmičenje | Objava rasporeda | Buduće utakmice |
|---|---|---|
| ABA liga, grupa B | Zvanični kalendar ima kasnija kola sa CET satom. Prvo kolo, uključujući Partizan–Ilirija, na istom izvodu piše TBA. Vest od 20. septembra 2026. navodi 27. septembar bez sata u izvodu. | Regularna sezona je delimično objavljena. TBA nije 00:00. |
| ABA, Top 8 i doigravanje | Zavisi od tabele. | Nije izvučeno. |
| Evroliga, regularna sezona | Parovi su objavljeni 29. jula 2026. Izmena domaćinstva Partizan–Efes prijavljena je 8. septembra 2026. Zvanične stranice utakmica pokazuju sat bez zone u izvučenom tekstu. | Parovi objavljeni. Sat bez zone nije potvrđen UTC. |
| Evroliga, play-in, plej-of i Final Four | Prozori datuma jesu objavljeni. Protivnici nisu. | Nije izvučeno. |
| KLS / domaća Superliga | Oba beogradska kluba su u sastavu lige za 2026/27. Njihov raspored utakmica nije nađen. Prošle sezone su ušli tek u prolećnu Superligu. | Nije objavljeno. Isečak TheSportsDB i dalje ih nema. |
| Kup Radivoja Koraća 2027. | Završnica 2026. bila je prethodna sezona. Žreb za 2027. nije nađen. | Nije objavljeno. |
| Evrokup i ABA 2 | Nisu učesnici: Evroliga i ABA grupa B. | Nema tih utakmica. |

### KK Crvena zvezda — `basketball:rs:crvena-zvezda`

Ista slika kao za KK Partizan, uz ABA grupu A. Prvo kolo Borac–Crvena zvezda na izvodu zvaničnog kalendara je TBA. Evroliga, regularna sezona, objavljena je istog 29. jula 2026. Nokaut faze ABA i Evrolige nisu izvučene. KLS i Kup Koraća za ovu sezonu nisu objavljeni. Evrokup i ABA 2 nisu njihova takmičenja.

FK Partizan i KK Partizan ostaju `football:rs:partizan` i `basketball:rs:partizan`. Ime nije ključ.

## Satnice koje su stvarno otvorene

| Šta piše | Gde | Šta iz toga sledi |
|---|---|---|
| 10. oktobar 2026, 00:00, Partizan–Novi Pazar i Radnički 1923–Crvena zvezda. Isti blok kasnije na stranici nema sat. | [FSS, Superliga 26/27](https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/), 26. septembar 2026. | Datum je objavljen. 00:00 nije potvrđen početak. |
| 6. septembar 2026, 19:00, Crvena zvezda–Partizan 2:1. | Ista FSS stranica. | Kad je termin delegiran, sajt ispisuje pravi sat. Zato je 00:00 na budućim kolima oznaka da sat još nije dat. |
| 10. oktobar 2026, 02:00 +02:00, Partizan–Novi Pazar. 1. novembar 2026, 01:00 +01:00, Partizan–Zemun. Odigrano 6. septembra je 19:00 +02:00. | [Fixtur.es, FK Partizan](https://fixtur.es/en/team/fk-partizan), 26. septembar 2026. | 02:00 dok važi letnje vreme i 01:00 posle prelaska na zimsko (poslednja nedelja oktobra 2026. je 25. oktobar) jesu lokalni prikaz ponoći UTC. Nisu potvrđeni termini. |
| Svih sedam mečeva 11. i 12. kola na 02:00 +02:00. | [Fixtur.es, Superliga](https://fixtur.es/en/serbia-superliga), isti dan. | Isti placeholder za ceo krug, ne sedam stvarnih termina u 02:00. |
| 15. oktobar 2026, Lugano–Crvena zvezda (18:45). Deo kasnijih kola na spisku po timu nema sat, uključujući Gent 26. novembra. | [UEFA, ligaška faza](https://www.uefa.com/uefaconferenceleague/news/02a8-2174cb200f25-b94693ddff4e-1000--2026-27-conference-league-all-the-league-phase-fixtures/) i [spisak po timu](https://www.uefa.com/uefaconferenceleague/news/02a8-217779a8ad3a-b4c75bb82a48-1000--conference-league-league-phase-fixtures-by-team/). | 18:45 je sat koji je UEFA ispisala uz taj meč. Kolo bez sata ostaje nepotvrđeno. Nokaut nije izvučen. |
| Partizan–Mega, ponedeljak 5. oktobar 2026, 18:30 CET. Prvo kolo, TBA. | [ABA kalendar](https://www.aba-liga.com/calendar/), izvod 26. septembra 2026. | Sat sa ispisanim CET može da se čuva kao potvrđen trenutak. TBA ne postaje 00:00. |
| Zvanični URL odigranog meča sadrži `2026-09-25 18:45`. Budući prikaz „13:30, 18. decembar 2026” nema zonu u izvučenom tekstu. | [Evroliga, Partizan–Milan](https://www.euroleaguebasketball.net/euroleague/game-center/2026-27/partizan-mozzart-bet-belgrade-armani-olimpia-milan/E2026/10/) i stranica utakmica Olimpijakosa. | Odigrani meč nije budući raspored. Sat budućeg meča bez zone ostaje nepotvrđen. |
| 27. septembar 2026, 15:00, Partizan–Rodina, SC Partizan-Teleoptik. | [partizan.rs](https://partizan.rs/vesti/5499/zakazana-prijateljska-utakmica-protiv-fk-rodina), 22. septembar 2026. | Klub je naveo sat koji nije 00:00, 01:00 ni 02:00. To je jedna vest, ne izvor za sve utakmice. |

Lokalna funkcija zato svaki odštampani 00:00, 01:00 i 02:00, i goli `00:00:00Z`, ostavlja bez `startsAtUtc`. Takav meč može da stoji u listi sa datumom i statusom `time_tbd`. Ne ide u vremenski kalendarski događaj i nema minutni push.

## Izvor × takmičenje × sezona × pristup × potpunost × pravo

Pravo se odnosi na upis u MatchAhead agendu, javni JSON ili ICS koji pravi MatchAhead. Direktna pretplata koju pružalac sam daje korisniku nije isto što i pravo da MatchAhead preuzme feed.

| Izvor | Takmičenje i sezona | Pristup 26. septembra 2026. | Potpunost | Pravo upotrebe |
|---|---|---|---|---|
| FSS HTML | Superliga 2026/27 | Javna stranica. Nema dokumentovanog API-ja. | Parovi kroz 26. kolo. Budući sat je 00:00 ili prazan. | BLOCKED za unos. Stranica je referenca, nije licenca. |
| FSS vest | Kup Srbije 2026/27, pretkolo | Javna vest od 20. avgusta 2026. | Superligaši nisu u tom žrebu. | BLOCKED. Faza za ova dva kluba je neobjavljena, ne prazna. |
| Fixtur.es ICS | Superliga, kup i evropska takmičenja koja oni vode za klub | Javni `webcal://ics.fixtur.es/v2/fk-partizan.ics`, bez naloga. Postoji i Google link. | Buduća kola imaju placeholder 01:00/02:00. Odigrani mečevi imaju prave sate. | Direktna pretplata korisnika jeste njihov proizvod. Parsiranje i ponovna objava su BLOCKED. Na dnu stranice je Copyright 2015–2026 De Agendamakers B.V. Nije nađena dozvola za tuđi proizvod. |
| UEFA.com | Liga konferencije 2026/27, ligaška faza, FK Crvena zvezda | Javna stranica i dugme „Add to calendar” za korisnika. Nema verifikovane otvorene dozvole za treću stranu. | Šest parova objavljeno. Deo satova 18:45, deo bez sata. Nokaut nije izvučen. | BLOCKED za unos. Korisnik može da koristi UEFA-ino dugme. |
| UEFA.com | Liga šampiona i Liga Evrope, ligaške faze, oba FK | Ovi klubovi nisu učesnici. | Nema njihovih mečeva te faze. | Nije izvor za njih. |
| ABA HTML | ABA 2026/27, oba KK | Javni kalendar. Nema dokumentovanog otvorenog API-ja. | Deo kola ima CET. Prvo kolo je TBA. Doigravanje nije izvučeno. | BLOCKED za unos. |
| Evroliga HTML | Evroliga 2026/27, oba KK | Javne stranice utakmica. | Regularna sezona je objavljena. Play-in, plej-of i Final Four nemaju parove. | BLOCKED za unos. |
| `api-live.euroleague.net` | Evroliga | Postoji u tuđim bibliotekama. Specifikacija je nedokumentovana i nije licenca. | Nije proveravano kao produkcioni put. | BLOCKED. Ne ulazi u plan. |
| Sportradar / Evroliga | Kladioničarski podaci Evrolige i Evrokupa do 2031. | Najava od 26. avgusta 2026. | Ne pokriva ovaj proizvod. | Nije besplatan izvor. Ne daje MatchAhead pravo na raspored. |
| KLS / kls.rs | Domaća liga 2026/27, oba KK | Nije nađen objavljen raspored ovih klubova. | UNKNOWN da li će prolećna faza biti objavljena kasnije. Danas nije objavljeno. | BLOCKED dok nema i stranice i prava. |
| KSS | Kup Radivoja Koraća 2027. | Žreb nije nađen. | Nije objavljeno. | BLOCKED. |
| TheSportsDB ključ `123` | Superliga, KLS, ABA, Liga konferencije | Pozivi iz zadatka 01, 26. septembar 2026. Besplatno seče sezonu na 15 i daje jednu narednu. ABA je `events: null`. | NEPOKRIVENO kao potpun raspored. Novi klikovi ponavljaju isti isečak. | Ograničeno. Uslovi ne potvrđuju javni ICS. Grbovi se ne ugrađuju. |
| API-Football i API-Basketball | Sva navedena, sezona 2026/27 | Nema ključa u projektu. Nije pozvano. | UNKNOWN da li besplatan plan uopšte vraća ovu sezonu i koliko ima strana. | BLOCKED za javni JSON/ICS i kad bi poziv uspeo. Uslovi ne daju licencu objave. Plaćeni plan nije u budžetu. |
| football-data.org | Srpski fudbal i košarka | Besplatan katalog i dalje nema ta takmičenja. | NEPOKRIVENO. | Nije kandidat. |
| Klupska vest | Jedna prijateljska FK Partizan | Javna HTML vest. | Jedan meč, ne sezona. | UNKNOWN za prenos teksta. Nije feed. |

## Tok `findFixtures(sport, teamId, season)`

Redosled jednog klika, isti onaj koji lokalna funkcija sprovodi nad sintetičkim feedovima:

1. Identitet tima mora da se poklopi sa sportom. FK i KK istog imena se ne mešaju. Pretraga po imenu nije dovoljna.
2. Katalog takmičenja te sezone. Svako takmičenje ima svoj izvor. Izvor čije pravo nije `allowed` ne šalje utakmice u odgovor. U produkciji je ta lista danas prazna.
3. Sve strane odgovora. Ako `totalPages` i primljene strane ne odgovaraju, rezultat je greška izvora. Nepotpun spisak se ne objavljuje i ne briše prethodni.
4. Validacija. Sat 00:00, 01:00, 02:00 i goli `00:00Z` gube `startsAtUtc`. Utakmica bez ovog tima se odbacuje. Prazan odgovor koji tim uopšte ne pominje nije dokaz da utakmica nema.
5. Deduplikacija po stabilnom ID-u `{sport}:{takmičenje}:{sezona}:{provajder}:{id provajdera}`. Isti ID na dve strane ostaje jedan zapis. Drugi provajder, čak i uz isti par i datum, ostaje drugi ID dok ne postoji provereno mapiranje.
6. Status po takmičenju: `published`, `unpublished`, `source_error`, `not_participant` ili `unknown`. Neobjavljen nokaut i tajmaut nisu isto. `claimsNoMatches` je uvek `false`.
7. Zajednički keš, ključ `teamId + sezona`. Dok je zapis mlađi od 6 časova, sledeći klik ne zove izvor. „Osveži” pre 15 minuta takođe ne zove izvor. Više korisnika deli isti zapis.
8. Odgovor: buduće utakmice hronološki, sledeća utakmica i posebno sledeća sa potvrđenim UTC trenutkom. Samo potvrđeni trenutak sme u minutni push. Nestanak utakmice iz novog odgovora nije otkazivanje. Promena sata čuva ID i podiže reviziju samo kad se sadržaj stvarno promeni.

Tajni ključ ne ide u PWA, u Vite promenljivu ni u log. Ako izvor traži ključ ili blokira CORS, jedini sloj koji sme da ga drži je server. Dok nijedan izvor nije istovremeno dopušten i dovoljan, taj server nema šta da pozove.

### Najgori broj zahteva i vreme

Ovo je računica oblika poziva, nije merenje živog API-ja. Paginacija API-Sports i dalje nije viđena.

Ako bi jedan svež klik imao četiri takmičenja sa 2, 1, 1 i 1 stranom, to je 5 zahteva. Sto korisnika od kojih 99 dobije keš troši 5, ne 500. Četiri kluba jednom dnevno bila bi 20. Četiri kluba četiri puta dnevno bila bi 80, što staje u ilustrativnih 100 samo dok je broj strana ovako mali.

Razmak od 15 minuta sam ne čuva dnevni plafon: u jedan dan staje 96 svežih osvežavanja jednog ključa, puta 5 je 480. Zato keš mora da ima i globalni dnevni plafon, ne samo razmak po klubu. Dok je broj strana nepoznat, ni 20 ni 80 nisu garancija.

Ako provajder pušta 10 zahteva u minutu bez burst-a, 5 zahteva ima donju granicu od 24 sekunde samog razmaka, plus mreža. To nije izmereno. TheSportsDB pušta 30 u minutu, ali limita od 15 zapisa znači da dodatni klik ne dopunjuje sezonu.

Jedna invokacija Cloudflare Workers Free ima 50 spoljnih podzahteva. Klik od 5 staje. Klik koji traži više od 50 spoljnih poziva ne staje u jednu besplatnu invokaciju i ne sme da se reši plaćenim planom.

### Server, CORS i zloupotreba

Besplatan sloj je Cloudflare Worker na planu Free, ispred GitHub Pages. Pregledač zove samo taj worker, nikad sportski host. Ključ, ako jednog dana postoji dopušten izvor koji ga traži, stoji kao tajna workera. Dozvoljen je samo origin GitHub Pages projekta.

Keš je zajednički, po klubu i sezoni. Workers KV na free planu ima 100.000 čitanja i 1.000 upisa dnevno. Svaki svež klik je upis. To je tvrđi plafon od broja korisnika i mora da se broji.

Zloupotreba se seče ovako, kad faza 04 ima nalog:

- poziv traži Firebase ID token; otvoreni proksi bez naloga se ne uključuje;
- granica po nalogu i po IP adresi;
- 6 časova zajedničkog keša i 15 minuta najkraćeg razmaka po klubu, čak i za „Osveži”;
- globalni dnevni brojač sportskih podzahteva koji staje pre tuđe kvote i pre 1.000 KV upisa;
- odgovor koji nije `allowed` se ne upisuje.

Otvaranje PWA i dalje ne zove sportski izvor. Cron za već zakazane push podsetnike nije preuzimanje rasporeda.

### AI

AI nije uključen. Nema izabranog besplatnog AI API-ja koji bi bio održiv deo budžeta od 0 €, i ne uvodi se plaćeni. Ako se kasnije pojavi takav način, sme da predloži meč samo uz URL izvora. Predlog bez URL-a ostaje `nepotvrđeno`, ne ulazi u kalendar i ne zakazuje push. AI nije zamena za prazan ili nedopušten izvor. Ručni nedeljni pregled nije proizvodni tok.

## Šta se za 0 € može dokazano automatizovati

Može:

- lokalno spajanje više takmičenja, opisano iznad, nad podacima označenim kao `synthetic`;
- prikaz statusa po takmičenju, uključujući neobjavljenu fazu i grešku izvora;
- zajednička računica keša i kvote;
- link ka direktnoj pretplati koju Fixtur.es sam nudi za fudbalski klub, uz obavezno upozorenje da su 01:00 i 02:00 nepotvrđeni sati dok ih Fixtur.es ne zameni;
- link ka UEFA dugmetu „Add to calendar” za korisnika, bez preuzimanja njihovog kalendara u MatchAhead.

Ne može, i ne sme da se predstavi kao gotovo:

- punjenje MatchAhead agende, push-a ili MatchAhead ICS-a utakmicama FSS, Fixtur.es, UEFA, ABA, Evrolige, KLS ili TheSportsDB;
- tvrdnja da su budući superligaški sati poznati;
- tvrdnja da API-Sports pokriva sezonu 2026/27;
- scrapovanje zvaničnih sajtova ili nedokumentovani Evroliga endpoint kao plan faze 05.

## Korisnički tokovi

**Pronađi utakmice.** Korisnik izabere sport, klub i sezonu. Odgovor je hronološka lista samo onoga što je dozvoljeni izvor stvarno vratio, plus red po takmičenju: provereno, nije objavljeno, izvor nedostupan, nije učesnik, potpunost nepoznata, pravo blokirano. Prikazuje se datum poslednje provere. Danas bi taj ekran za četiri kluba pokazao blokirana prava i neobjavljene faze, ne punu listu tuđih mečeva.

**Dodaj sve u Calendar.** Dugme važi samo za utakmice sa potvrđenim UTC trenutkom i dozvolom izvora. Meč sa nepotvrđenim satom može da se vidi uz oznaku „vreme nije potvrđeno”, ali se ne upisuje kao termin na sat. Upis i dalje traži Google dozvolu tek u trenutku upisa, u kasnijoj fazi. Dok je unos blokiran, dugme nema šta da doda.

**Prati kroz ICS.** MatchAhead ne objavljuje svoj ICS od tuđih podataka. Gde pružalac nudi sopstvenu pretplatu, aplikacija može da da taj link. Google onda osvežava **njihov** kalendar svojim ritmom. To ne puni MatchAhead agendu ni push, i ne ispravlja placeholder sat dok ga pružalac ne ispravi. Klik na ICS link i dalje nije dokaz da je događaj u korisnikovom Google nalogu.

**Osveži raspored.** Korisnik ga pokreće sam. Ako je keš mlađi od 15 minuta, vidi se prethodni provereni rezultat i vreme te provere. Posle toga se poredi novi i stari snimak: novo, pomereno, otkazano, nepromenjeno. ID ostaje isti kad se sat promeni. Prazan ili neuspeo odgovor ne briše poslednji dobar raspored i ne znači „klub nema utakmica”.

## Faza 05, praktičan plan

Faza 05 sme da ugradi dugme i prikaz pokrivenosti. Sme da zove `findFixtures` nad dozvoljenim feedovima. Danas je skup dozvoljenih izvora prazan, pa funkcija za svako stvarno takmičenje ostaje ograničena i ne puni se izmišljenim terminima.

Redosled kad se faza otvori:

1. Uvesti samo one izvore koje ovaj dokument tada i dalje vodi kao dopuštene. Novi izvor traži novu proveru prava i jedan stvarni odgovor, ne pretpostavku.
2. Serverski sloj je Worker Free. Ključ ostaje van pregledača. Ako klik traži više od 50 spoljnih podzahteva, suziti ga ili odustati, ne preći na plaćeni plan.
3. Keš po klubu i sezoni, 6 časova prikaza, 15 minuta najkraćeg osvežavanja, globalni dnevni plafon.
4. Na stranici kluba pokazati takmičenja i razlog ako faza nije izvučena ili je pravo blokirano.
5. API-Sports i dalje sme da se proba jednim besplatnim nalogom i malim brojem poziva, ključem van repozitorijuma. Uspešan odgovor ne otvara javni ICS.
6. Ne uvoditi periodično preuzimanje na tri sata. Ne uvoditi nedokumentovane endpointove. Ne pokretati fazu 02 iz ove celine.

## Retko osvežavanje, Calendar i push

Snimak važi dok korisnik ponovo ne pronađe raspored. Ako se meč pomeri u međuvremenu, Google događaj i push ostaju na starom potvrđenom terminu. Ekran to mora da kaže, zajedno sa datumom poslednje provere.

Ručno upisane Google događaje faza 08 sme da menja tek dok je aplikacija otvorena i korisnik odobri pristup. ICS koji drži tuđi pružalac osvežava Google sam, svojim kašnjenjem. MatchAhead ne vidi da li je taj događaj stigao.

Push za zatvorenu PWA i dalje traži server koji budi već sačuvane podsetnike. To ne preuzima novi raspored i ne sme da se zakazuje za sat koji nije potvrđen. Otkazivanje je samo izričit status, nikad zaključak iz praznog odgovora.

## Lokalni dokaz

`findFixtures` u `packages/domain/src/find-fixtures.ts` nema mrežni poziv. Provera:

`node scripts/check-data-contracts.mjs`

Rezultat 26. septembra 2026: 19 testova, 19 prolaza, 0 padova. Novi testovi pokrivaju spajanje više takmičenja, odbacivanje tuđeg meča, jedan zapis za duplirani ID, različit ID drugog provajdera, FK/KK, čuvanje ID-ja pri promeni sata, ostanak meča koji nestane iz odgovora, razliku neobjavljenog nokauta i greške izvora, prazan odgovor koji ne znači „nema utakmica”, keš i prerano osvežavanje, i računicu kvote. Satovi 00:00, 01:00 i 02:00 ostaju bez potvrđenog trenutka.

Sintetički skup nije produkcioni raspored i ne sme se objaviti kao jedan.
