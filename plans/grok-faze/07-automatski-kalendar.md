# 07. Klupske ICS pretplate

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 05 i 06.

## Posao

Sportski raspored dolazi iz poslednjeg uspešnog „Pronađi utakmice” ili „Osveži raspored” za taj klub, bez zakazanog sportskog preuzimanja. ICS pretplata prati **poslednji objavljeni snimak**, a Googleovo osvežavanje feeda ne pronalazi samo nove utakmice. Objasni to u interfejsu, zajedno sa datumom poslednje provere. Ne generiši javni ICS iz izvora čija prava objave nisu potvrđena.

Generiši stabilan javni ICS feed po timu kroz sva potvrđeno pokrivena takmičenja. Primeni pravila iz glavnog plana: stabilan UID, revizije na promenu sadržaja, ispravne vremenske zone, date-only događaji, odlaganje i otkazivanje.

Dodaj „Prati u Google Calendaru”, kopiranje URL-a i jasna uputstva za telefon/računar. „Preuzmi ICS” je zasebna jednokratna radnja i ne sme izgledati kao pretplata.

U Firestore zabeleži samo ono što znamo: link otvoren ili korisnik potvrdio pretplatu. Ne čitaj sve Google kalendare. Agenda prikazuje razliku između praćenja, pretplate i ručnog upisa.

Upozori kada dva praćena kluba mogu dati dva ista Google događaja u odvojenim pretplaćenim kalendarima. Unutar PWA agende zadrži jedan red.

Implementiraj uputstvo za odjavu pretplate; brisanje favorita nije automatska odjava. U prod feedovima ne sme biti privatnih podataka ili privremenih URL-ova. Calendar alarmi mogu ostati dodatna korisnička mogućnost; ne računaju se kao ispunjenje PWA push zahteva.

## Uslov završetka

ICS prolazi parser. Kontrolisana promena vremena zadržava UID i stvarni Google klijent je preuzima nakon svog osvežavanja. Provereni su nepoznata satnica, otkazivanje i srpski znakovi. Zabeleži koje ponašanje je stvarno testirano i koje još čeka Google osvežavanje.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
