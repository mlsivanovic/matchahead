# 11. Otpornost, privatnost i integracioni testovi

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 03–10 implementirani; 01 i 02 imaju razrešene blokade.

## Posao

Proveri celu putanju od korisnikovog „Pronađi utakmice” i kasnijeg „Osveži raspored” do PWA agende, ICS feeda, ručnog Calendar usklađivanja i push-a. Proveri i slučaj kada je izvor promenio termin, ali korisnik još nije osvežio raspored: UI ne sme tvrditi da je termin najnoviji. Kanali imaju različite brzine; test ne sme zahtevati da Google ICS odmah preuzme promenu.

Simuliraj pad izvora, zastarele podatke, oštećen JSON, Google 429, istek autorizacije, Firestore kvotu, nevažeću push registraciju i Worker CPU limit. Sačuvaj poslednji dobar raspored; prikaz greške mora reći šta je dostupno i šta čeka.

Proveri Rules, serversku autorizaciju i IAM: Admin/serverski pristup zaobilazi klijentska Rules pravila, pa endpoint sam proverava korisnika i ograničenja. Proveri CORS i zabrani proizvoljno slanje na tuđe uređaje. Tajne ne smeju u frontend, Pages paket, source map ili log.

Testiraj isti uređaj sa dva naloga, više uređaja istog korisnika, odjavu offline i brisanje naloga. Privatni keš se briše; jobs i devices se deaktiviraju. Kada offline odjava ne može odmah obavestiti server, dokumentovati i rešiti preostali rizik dostave, uz payload bez osetljivih detalja i najranije moguće odjavljivanje registracije.

Testiraj mobile accessibility, screen reader nazive, filtere, istovremene utakmice, DST, novu PWA verziju i notification click posle promene base putanje. Ne proširuj proizvod novim funkcijama u ovoj fazi.

## Uslov završetka

Postoji izveštaj sa PASS/FAIL/NOT_TESTED za kritične tokove. Nema otvorenih grešaka koje izlažu tuđe podatke, lažno potvrđuju upis ili šalju poznato otkazan reminder. Neuspešna spoljna usluga ne briše listu. Izmerene kvote, opoziv, retry i oporavak su dokumentovani.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
