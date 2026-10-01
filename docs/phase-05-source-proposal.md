# Predlog za izvore rasporeda i izlazak iz blokade faze 05

Provera: 1. oktobar 2026. Ovo je istraživanje i predlog, ne prihvaćena promena zahteva niti produkcioni adapter. Budžet ostaje 0 €, pronalaženje i osvežavanje ostaju na korisnikov klik. Faza 05 ostaje BLOCKED za kompletan produkcioni tok.

Preporuka: kombinovati izvore po takmičenju, prvenstveno javne ligaške rasporede, zatim klupske stranice za potvrdu termina i prijateljske utakmice. HTML adapter je tehnički moguć bez sportskog API ključa. AI koristiti za pomoć pri razvoju parsera i eventualne predloge iz vesti; ne kao autoritet za datum, sat ili otkazivanje.

## Šta zapravo blokira fazu

Prethodna provera spojila je pristup, potpunost i prava u jednu prepreku. Treba ih pratiti odvojeno:

- **Pristup:** može li server preuzeti i parsirati izvor? Za ABA i fudbalske stranice ispod HTTP pristup je sada demonstriran.
- **Potpunost:** obuhvata li odgovor sva objavljena kola izabranog takmičenja i sezone? Jedna dostupna stranica ili sledeća utakmica to ne dokazuju za ceo klub.
- **Tačnost vremena:** postoje li potvrđen sat i pravilo vremenske zone? Objavljen par je koristan i kada sat nije poznat.
- **Način korišćenja:** pokrivaju li uslovi izvora planirano preuzimanje, keš, prikaz, ličnu agendu, podsetnike i javni ICS? Te mogućnosti ne treba tretirati kao jednu dozvolu.

Nepostojanje pronađene dozvole nije dokaz izričite zabrane. Za takav slučaj precizna oznaka je `unknown`; prema postojećoj projektnoj odluci unos ipak ostaje zatvoren dok korišćenje nije razjašnjeno. Ovaj predlog ne menja odluke 01/01B niti postavlja `publication: allowed`.

## Izvori provereni sada

| Izvor | Stvarna provera | Predložena uloga i ograničenje |
|---|---|---|
| [ABA, eksplicitna sezonska putanja](https://www.aba-liga.com/calendar/26/1/) | HTTP 200; Python `html.parser` izdvojio je 36 redova za PAR/CZV kroz kola 1–18 iz jednog HTML odgovora. Redovi imaju parove, a deo i datume/satnice. | Najbolji prvi kandidat za tehnički adapter: jedna ligaška stranica služi oba KK. Broj redova nije dokaz svih faza sezone. Kolo 1 je TBA; broj sezone u URL-u proveriti, ne zaključivati iz kalendarske godine. Pravo korišćenja nije potvrđeno. |
| [FSS, Superliga 26/27](https://fss.rs/takmicenje/mozzart-bet-super-liga-srbije-26-27/) | HTTP 200; raspored postoji u HTML-u. Nađeno je 68 različitih linkova ka izveštajima, što nije ukupan broj objavljenih utakmica. Običan parser tabela izdvojio je tabelu plasmana, ne kompletan raspored. | Ligaški izvor za oba FK; potreban poseban parser blokova rasporeda i provera svih kola. Linkovi izveštaja mogu dati identitet gde postoje; ne pretpostavljati da svaki budući par već ima taj link. |
| [FK Partizan, utakmice](https://partizan.rs/utakmice) | HTTP 200; SSR HTML, `__NUXT_DATA__` i linkovi `/utakmice/<id>`. Vidljiva sledeća utakmica ima TBA. | Dopuna za potvrdu termina i prijateljske mečeve. Sama prisutnost Nuxt podataka ne dokazuje da payload ima sve buduće utakmice. |
| [FK Crvena zvezda, raspored](https://www.crvenazvezdafk.com/sr-latn/raspored-rezultati) | HTTP 200; budući domaći i evropski parovi i pojedinačni URL-ovi utakmica nalaze se u HTML-u. | Koristan dopunski izvor. U zaglavlju i listi postoje neusaglašene satnice i dodatni 00:00 elementi; ne izdvajati prvi sat iz celog teksta stranice. |
| [KK Partizan, takmičenja](https://partizan.basketball/takmicenja) | `kkpartizan.rs` preusmerava na `partizan.basketball`; tabela Evrolige prikazuje mečeve 2025/26. | Sekundarni izvor; bez provere sezone može uneti zastareo raspored. Trenutno nije dokaz rasporeda 2026/27. |
| [KK Crvena zvezda, kalendar](https://kkcrvenazvezda.rs/calendar) | HTTP 200. U preuzetom HTML-u vide se navigacija i tabele; potpuna lista budućih mečeva nije izdvojena. | Kandidat za dodatnu proveru prikaza koji izvršava JavaScript. Next.js šabloni sa `{{date}}` nisu stvarni događaji. |
| [Evroliga, Game Center](https://www.euroleaguebasketball.net/en/euroleague/game-center/) i [zvanični kalendar](https://euroleaguebasketball.ecal.com/) | Game Center je u ovoj web proveri vratio 403. ECAL stranica je dostupna, ali izbor klubova, sadržaj pretplate i tačnost događaja nisu demonstrirani. | Zvanična korisnička pretplata je zaseban kandidat; ne pretpostavljati da daje pravo uvoza u MatchAhead. Za sopstveni adapter potreban dostupan i potvrđen izvor. |

HTTP proba obavljena je malim brojem GET zahteva pomoću Python `requests`; ekstrakcija ABA tabele pomoću standardnog `html.parser`. Nisu korišćeni privatni endpointovi, autentifikacija, zaobilaženje zaštite ni AI ekstrakcija. Puna paginacija, otkazivanje, promene termina i Cloudflare runtime nisu testirani. Izvorni HTML i tuđi rasporedi nisu upisani u javne podatke projekta.

## Predloženi tok bez AI zavisnosti

`Pronađi utakmice → server → adapteri takmičenja → validacija → postojeći findFixtures/keš → prikaz pokrivenosti`

1. Server poziva samo odabrane, proverene izvore za sport i sezonu. Za ABA jedna provera može služiti oba kluba; keš sirovog izvora deliti po takmičenju/sezoni, a postojeći rezultat i dalje po klubu/sezoni.
2. Adapter obrađuje javni HTML ili ugrađene podatke koje ista stranica isporučuje. Dokumentovan JSON/ICS je bolji kada postoji i kada upotreba odgovara uslovima. Ne uvoditi privatni endpoint kao skriveni produkcioni oslonac.
3. Za svaku utakmicu čuvati izvorni URL, izvorni ID gde postoji, sezonu, kolo, timove i dokaz satnice. Promena termina čuva identitet. Ako dva izvora opisuju isti meč, potrebno je eksplicitno mapiranje njihovih ID-jeva.
4. Sat TBA/prazan/placeholder ostaje `startsAtUtc: null`. Ni sat 13:00 nije automatski potvrđen samo zato što nije ponoć. ABA oznaku CET treba razjasniti u odnosu na letnje računanje vremena pre konverzije; ne primenjivati slepo fiksni UTC+1.
5. Promena strukture HTML-a ili nepotpun odgovor daje `source_error` i čuva poslednji dobar raspored. Nestanak reda nije otkazivanje. Izvor koji pokazuje drugu sezonu odbaciti.
6. Zadržati klik, zajednički keš, ograničenje osvežavanja i globalni plafon zahteva iz 01B. Ne dodavati periodično preuzimanje. Parser i CPU vreme tek izmeriti u izabranom serverskom okruženju.

Pokrivenost se dokazuje po takmičenju, ne tvrdnjom da postoji jedan savršen servis. Kupovi, doigravanja i prijateljske utakmice imaju posebne izvore/status. Neobjavljen žreb ne može rešiti nijedan scraper ili AI.

## Gde AI pomaže

- Tokom razvoja: pomaže da se naprave i poprave deterministički parseri. To ne zahteva AI API u aplikaciji.
- Za nestrukturisanu klupsku najavu: može predložiti polja uz tačan URL i dokaz iz teksta. Predlog prolazi proveru sporta, sezone, klubova, domaćinstva, datuma i zone; nerešena polja ostaju nepotvrđena.
- AI ne sme da dopunjava neobjavljen sat ili protivnika. Dva sajta sa istim prepisanim podatkom nisu nezavisna potvrda. Korisnikov klik na „potvrdi” ne rešava pravo redistribucije.

Za budžet 0 € preporučuje se da prva verzija nema serverski AI poziv. Automatizovana obrada vesti bila bi kasniji dodatak, sa posebno dokazanom cenom, pouzdanošću i načinom korišćenja izvora.

## Kako konkretno otvoriti fazu 05

**Prvi radni paket: tehnička proba ABA adaptera bez javne objave podataka.** Proveriti svih 18 kola i 18 parova svakog kluba, izdvojiti ID-jeve utakmica iz njihovih javnih linkova, sačuvati razliku TBA/datum/sat i proveriti stabilnost dva uzastopna odgovora. Današnja jednokratna ekstrakcija je polazni dokaz pristupa, ne gotov adapter. Zatim istu metodologiju primeniti na FSS i klupske dopune.

**Drugi radni paket: provera korišćenja po izvoru.** Pregledati konkretne uslove, a kada ne pokrivaju namenu tražiti pojašnjenje od izvora/organizatora. Opis namene neka bude uzak: besplatna aplikacija za četiri seniorska tima, samo osnovni podaci rasporeda, naveden izvor, korisnički klik i keš. Odvojeno navesti javni prikaz, privatnu agendu/podsetnike i javni ICS. Odgovor za jedan način korišćenja ne prepisivati kao odobrenje za sve ostale.

Primer teksta za upit, **nije poslat**:

> Razvijamo besplatnu aplikaciju MatchAhead za praćenje utakmica FK/KK Partizan i Crvena zvezda. Želeli bismo da sa vašeg rasporeda na korisnikov zahtev preuzmemo par, takmičenje, datum, potvrđeno vreme, lokaciju i status utakmice, uz link ka izvoru i zajednički keš. Molimo za pojašnjenje da li dopuštate takvo preuzimanje i prikaz, čuvanje korisnikovih odabranih utakmica i podsetnike, kao i zasebno javni ICS. Ako postoji namenski JSON/CSV/ICS izvor ili pravila učestalosti, koristili bismo njega. Ne preuzimamo grbove, fotografije ni tekstove vesti.

Ako jedan izvor bude odobren, njegova integracija može početi uz jasno ograničenu pokrivenost. To otvara deo posla; faza 05 postaje DONE tek kada ispuni postojeći zahtev svih tada objavljenih relevantnih utakmica, validaciju, trajno stanje i provere kvarova.

## Rezervne opcije i njihove granice

- **Dogovoren JSON/CSV od kluba ili organizatora:** najjednostavnije dugoročno rešenje ako mogu dati podatke i odgovarajuću dozvolu za upotrebu. Automatizovani izvoz koji oni održavaju je bolji od ručnog nedeljnog sastavljanja rasporeda. Takav dogovor danas ne postoji.
- **Direktne korisničke pretplate:** [Fixtur.es za FK Partizan](https://fixtur.es/en/team/fk-partizan) i zvanični ECAL/UEFA tokovi mogu biti zasebne opcije. Ne pune automatski MatchAhead agendu ni njegov push; ne zatvaraju originalnu fazu 05.
- **API-Sports free:** [API-Football cenovnik](https://www.api-football.com/pricing) potvrđuje 100 zahteva dnevno i ograničene sezone; [API-Basketball katalog](https://api-sports.io/sports/basketball) navodi široku pokrivenost. Bez stvarnog ključa sezona i potpunost ostaju neproverene. [Uslovi](https://www.api-football.com/terms) predviđaju razvoj aplikacija, ali izričito ne daju licencu za objavu podataka: ključ sam ne zatvara postojeću prepreku.
- **TheSportsDB:** [uslovi](https://www.thesportsdb.com/docs_terms_of_use.php) dopuštaju kopiranje i izmenu sadržaja zvaničnog API-ja uz uslove i prava trećih lica; ne treba ih predstavljati kao opštu zabranu obrade. Ipak, potpunost za naše klubove nije rešena. [Dokumentacija](https://www.thesportsdb.com/documentation) za dnevni raspored navodi free limit 3: prebacivanje sa sezonskog na dnevni endpoint nije dokaz rešenja trunciranja. U ovom istraživanju nije izvršena nova API proba.

## Ishod

Tehnički put preko javnog HTML rasporeda je demonstriran za ABA, bez ključa i AI-ja. Potpun produkcioni izvor za sva četiri tima i sve namene nije potvrđen. Sledeći konkretan korak je ABA adapter kao izolovana tehnička proba, uz proveru uslova korišćenja; zatim FSS adapter i dopunski izvori. Aplikacija i objavljeni DEMO podaci nisu menjani.
