# Raspored na zahtev — predlog toka, 26. septembar 2026.

Provera ovog predloga je završena istog dana u `docs/data-on-demand-feasibility.md`. Ovaj tekst ostaje opis toka. Statusi izvora, prava i kvota su u tom izveštaju.

Ovaj dokument dopunjuje `data-feasibility.md`. Korisnik je pojasnio da **ne traži stalno osvežavanje sportskih podataka**. Glavni tok je: izabere sport i klub → pritisne „Pronađi utakmice” → pregleda sve **trenutno objavljene** buduće utakmice tog kluba u izabranoj sezoni → izabere Calendar režim i podsetnike. Kasnije može sam da pritisne „Osveži raspored”.

Ovo ne potvrđuje da postoji besplatan izvor sa potpunom pokrivenošću, niti rešava prava na javno preuzimanje/objavu. „Sve utakmice sezone” znači sve utakmice **već objavljene do tog dana** u relevantnim takmičenjima. Još neizvučena nokaut faza ili nepoznat protivnik ne mogu se izmisliti.

## Predloženi tok podataka

1. **Jedan zahtev korisnika, jedna pretraga po klubu i sezoni.** Iza dugmeta proveriti identitet tima (FK/KK), spisak relevantnih takmičenja te sezone i sve stranice/izvore za ta takmičenja. Ne oslanjati se na jedan rezultat pretrage po imenu. Svaki adapter mora imati potvrđen pristup i odgovarajuće uslove upotrebe. Ako izvor traži tajni ključ ili blokira CORS, poziv ide kroz zaštićen besplatan serverski sloj, ne iz GitHub Pages browsera. Izbor tog sloja i kvote treba dokazati u 01B.
2. **Zajednički keš po klubu/sezoni.** Više korisnika koji traže isti klub može dobiti poslednji validirani rezultat; prikazati datum provere i ponuditi izričito ručno osvežavanje. Keš i ograničenje poziva sprečavaju da više korisnika potroši besplatnu dnevnu kvotu. Ne uvoditi periodično osvežavanje sportskih podataka kao podrazumevani tok.
3. **Potpunost je proverljiv rezultat, ne obećanje pre poziva.** Za svako takmičenje pokazati `provereno`, `nije objavljeno`, `izvor nedostupan`, `nije podržano` ili `potpunost nepoznata`, uz izvor. Sačuvati stabilan ID utakmice, URL i datum izvora, potvrdu/nesigurnost vremena i promene. Prazan odgovor nije dokaz da klub nema utakmica.
4. **AI može pomoći pri jednom zahtevu, ali nije jedini izvor istine.** Ako postoji bezbedan i besplatan način da se pokrene, AI može predložiti mečeve iz zvanične stranice/PDF-a. Rezultat mora imati URL i dokaz o datumu, proći determinističku proveru identiteta, zone, duplikata i potpunosti. Bez proverljivog izvora prikazati `nepotvrđeno`; ne slati takav termin u kalendar niti zakazivati push. Ne ugrađivati tuđi API ključ u PWA.
5. **Ručni izuzeci.** Kada izvor ne postoji ili parsiranje ne uspe, urednički uvoz celog kola/rasporeda može biti rezervna opcija. To nije obavezan nedeljni posao u osnovnom toku i ne menja korisnikov zahtev da aplikacija sama na klik pronađe dostupne utakmice.

## Kalendar, agenda i push iz jednog snimka

- Po završetku pretrage korisnik vidi hronološku listu i sledeću potvrđenu utakmicu. Može odabrati pojedine ili sve pronađene utakmice za namenski Google Calendar. [Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/create-events) podržava kreiranje događaja i klijentski definisan ID, što je korisno za izbegavanje duplikata pri ponovnom upisu. Prava korisnika tražiti tek za upis.
- Drugi ranije potvrđeni režim je **ICS pretplata**, ali njen sadržaj ostaje isti dok MatchAhead ponovo ne pronađe/objavi raspored. Googleovo povremeno preuzimanje ICS-a samo po sebi ne pronalazi nove mečeve. Ako je feed po klubu javan, prethodno proveriti uslove izvora za takvu distribuciju.
- Push može da stigne sa zatvorenom PWA za već sačuvane **potvrđene termine**; za isporuku i dalje treba server koji proverava dospele podsetnike. To **nije** stalno preuzimanje sportskog rasporeda. Ako se utakmica pomeri, a korisnik ne osveži raspored, Calendar i push mogu ostati na starom terminu. UI to mora jasno reći.
- Na „Osveži raspored” prikazati diff (nove, pomerene, otkazane, nepromenjene) pre usklađivanja. Ručno upisane Google događaje ažurirati tek kada je aplikacija otvorena i korisnik odobri Calendar pristup; za ICS Google sam odlučuje kada preuzeti novu verziju. Zadržati isti ID pri promeni termina.
- Događaj bez potvrđenog sata može biti prikazan sa oznakom „vreme nije potvrđeno”, ali nema minutni push. Nikad ne tretirati 00:00, 01:00 ili 02:00 kao potvrđen sat samo zato što ga izvor tako prikazuje.

## Konkretni kandidati za 01B

[Fixtur.es za srpsku Superligu](https://fixtur.es/en/serbia-superliga) nudi besplatnu **direktnu** pretplatu na kalendare klubova i navodi kup/evropska takmičenja. [FK Partizan 2026/27](https://udcf.fixtur.es/en/team/fk-partizan?noTimeZoneConvert=1) ima buduće termine prikazane u 01:00/02:00; proveriti da li su placeholderi. Direktan link korisniku je koristan izlaz, ali bez dozvole/tehničke integracije ne puni MatchAhead agendu i push.

[ABA](https://www.aba-liga.com/calendar/) i [KLS](https://kls.rs/kalendar/) imaju zvanične rasporede za poređenje. Javna HTML/PDF stranica nije sama po sebi API niti potvrda prava na javni MatchAhead JSON/ICS. API-Sports probni pozivi ostaju moguća provera, ali nisu uslov da se istraži ovaj tok; čak i uspešan odgovor ne daje automatski pravo ponovne objave.

## Šta ostaje neizvesno

- Da li postoji dopušten mašinski čitljiv izvor za svako takmičenje i aktuelnu sezonu; na zahtev se ne može nadomestiti nepostojeći ili nedostupan raspored.
- Koliko jedan potpuni upit kluba/sezone troši zahteva, vremena i besplatnih kvota, uključujući više korisnika. [Google Calendar API ima zasebne kvote](https://developers.google.com/workspace/calendar/api/guides/quota), koje ne rešavaju sportske podatke.
- Da li javni ICS koji generiše MatchAhead sme sadržati podatke iz svakog konkretnog izvora. Bez toga ponuditi samo direktnu pretplatu pružaoca gde postoji, ili ograničiti funkciju.

## Sledeći zaseban zadatak

01B proverava **pretragu na zahtev**, izvore, prava, kvote i mali lokalni prototip kompletnog odgovora sa statusima pokrivenosti. Faza 05 tek posle toga implementira korisničko dugme na izabranim dopuštenim izvorima. Faza 02 dokazuje push isporuku nezavisno od sportskih podataka.
