# 08. Ručni izbor i evidencija Google događaja

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 04, 05 i 06; koristi pravila preklapanja iz 07.

## Posao

Posle „Pronađi utakmice” ponudi izbor pojedinačnih ili **svih tada pronađenih** događaja. Na „Osveži raspored” uporedi sa već upisanim događajima, pa uz korisnikovo odobrenje uskladi nove/pomerene/otkazane; ne obećavaj promene između korisnikovih osvežavanja.

Implementiraj izbor više utakmica i posebno Google Calendar odobrenje. Koristi namenski aplikacioni kalendar i najmanje potrebne scope-ove; osnovni izbor je calendar.app.created. Access token je samo u memoriji. Ne uvodi serverske Google refresh tokene.

Kreiraj determinističke event ID-jeve nezavisne od vremena početka. Proveri vlasništvo/oznaku aplikacije pre menjanja događaja. Ponovni pokušaj nakon timeout-a prvo proverava prethodni ID.

Poveži status po utakmici sa agendom: čeka upis, uspešno, greška, poslednja uspešna provera, uklonjeno u Googleu. Delimičan uspeh ne sme nestati iza jednog opšteg error ekrana.

„Osveži upisane utakmice” proverava i usklađuje samo poznate aplikacione događaje uz dozvolu. Obradi uklanjanje u Googleu, odbijenu dozvolu, nestali kalendar i prekid između Calendar upisa i Firestore potvrde. Brisanje u Googleu ne znači da korisnik više ne prati klub; ta dva izbora su odvojena.

Opcioni Calendar reminder i PWA push su dva nezavisna kanala. Ako korisnik uključi oba, objasni mogućnost dva podsetnika. Ne traži Calendar dozvolu za PWA push.

Ne obećavaj osvežavanje ručnih Google događaja dok je PWA zatvorena; push servis menja samo notifikacije, ne korisnikov kalendar.

## Uslov završetka

Dva klika, dupli zahtev i oporavak posle prekida daju jedan događaj u istom namenskom kalendaru. Promena termina zadržava ID. Agenda tačno prikazuje potvrđene i nepotvrđene upise. Testovi pokrivaju delimičan uspeh, istek autorizacije, obrisani događaj i eksplicitnu obnovu.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
