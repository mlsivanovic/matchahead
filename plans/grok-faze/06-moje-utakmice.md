# 06. Početna, sledeća utakmica i hronološki pregled

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 04 i 05; može prvo na sintetičkim podacima.

## Posao

Implementiraj korisničku agendu kao uniju aktivnih praćenja klubova i ručnih izbora, deduplikovanu po fixture ID-u. Sačuvaj listu razloga uključivanja. Povlačenje jednog razloga ne uklanja utakmicu koju pokriva drugi.

Početna sadrži: sledeću utakmicu, domaćina/gosta, sport, takmičenje, lokalno vreme i odbrojavanje; ispod su Danas i Narednih sedam dana. Predlog teksta: „Sutra u 20:30 — za 1 dan i 3 sata”. Test podaci moraju biti označeni.

Moje utakmice sadrže: Predstojeće, Termin naknadno, Odložene/otkazane i Arhiva. Redosled potvrđenih budućih utakmica je UTC početak rastuće, a za jednake termine stabilan dodatni ključ. Lokalni datum određuje samo grupisanje. Nepoznat sat se ne pretvara u ponoć i ne učestvuje u preciznom odbrojavanju.

„Sledeća” je najranija buduća utakmica sa potvrđenim početkom koja nije otkazana/odložena bez termina. Ako je više istovremenih, pokaži i ostale ili oznaku „još N u isto vreme”. Kada termin prođe, osveži izbor; bez pouzdanog live izvora reci „Počela prema rasporedu”, ne „Uživo” ili „Završena”.

Prikaži odvojene statuse praćenja i Calendar upisa iz stalnog konteksta. Filter „Upisano u Google” obuhvata API potvrđene događaje uz datum provere; ICS prikaz ostaje odvojeno označen. Uključi filtere po sportu, klubu i takmičenju, i detalj utakmice.

Odbrojavanje ponovo računaj pri povratku na ekran/visibilitychange i promeni zone; ne oslanjaj se samo na interval koji se usporava u pozadini. Offline koristi poslednju listu uz oznaku zastarelosti.

## Uslov završetka

Testirati dva praćena protivnika (jedan red), uklanjanje jednog praćenja, istovremene utakmice, ponoć, DST, promenu zone, pomeranje termina, TBD, otkazivanje i povratak na ekran posle početka. Prazna agenda ima jasan sledeći korak. Prikaz nikada ne tvrdi da je Google upis potvrđen samo zato što korisnik prati klub.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
