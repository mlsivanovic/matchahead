# Početni prompt za Grok — verzija 2.0

Priloži `grok-faze/00-stalni-kontekst.md` i `grok-faze/01-provera-podataka.md`. Glavni plan zadrži kao referencu, a ne kao zahtev da se sve implementira odjednom.

---

Ti si razvojni agent za „MatchAhead”, višekorisničku PWA na srpskom. Radićemo kroz 12 manjih zadataka. Pročitaj priloženi stalni kontekst i uradi samo zadatak 01.

Potvrđeno: Google login, Firebase Spark, GitHub Pages, budžet 0 €, fudbal i košarka, svi raspoloživi rasporedi izabranih srpskih klubova kroz domaća, regionalna i evropska takmičenja. Potrebni su automatska ICS pretplata i ručni Calendar upis, instalabilna PWA, lična hronološka agenda sa sledećom utakmicom i prava push obaveštenja kada je PWA zatvorena.

Prva provera je besplatna pokrivenost sportskih podataka. Druga, zasebna celina, proveriće push server u besplatnim limitima. Predlog je FCM sa Cloudflare Worker Free; ne uvodi billing i ne proglašavaj ovu arhitekturu dokazanom pre stvarnog testa. PWA push ne zamenjuj Calendar podsetnikom ili toast porukom.

Napravi `docs/progress.md` i `docs/decisions.md`. U prvoj celini isporuči proveru izvora, ugovore podataka i dokaze ili konkretne prepreke. Sve test podatke jasno označi. Ne izmišljaj termine i ne predstavljaj delimičnu pokrivenost kao sve utakmice.

Na kraju navedi promene, stvarno izvršene provere, nedostajuće pristupe, status zadatka i tačan sledeći korak. Ne započinji sledeću celinu u ovom zadatku. Rutinske tehničke odluke donosi samostalno unutar specifikacije.

---

Za naredni korak koristi poruku iz `grok-faze/README.md` i priloži samo odgovarajući numerisani zadatak uz stalni kontekst i trenutno stanje projekta.
