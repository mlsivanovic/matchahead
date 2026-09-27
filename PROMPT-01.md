# Prompt za Grok — task 01

Radi u postojećem projektu:
`/home/mls/GIT/matchahead`

Ovo je prvi od 12 odvojenih taskova za izradu aplikacije „MatchAhead”. U ovom tasku uradi ISKLJUČIVO celinu 01 — proveru besplatnih sportskih podataka i definisanje zajedničkih ugovora podataka. Ne započinji celinu 02 niti razvoj kompletne aplikacije.

Prvo pročitaj, ovim redom:
1. `README.md`
2. `plans/grok-faze/00-stalni-kontekst.md`
3. `plans/grok-faze/01-provera-podataka.md`
4. `docs/progress.md` i `docs/decisions.md`
5. Relevantne odeljke 5 i 7 iz `plans/plan-za-grok-sportski-kalendar.md`.

Potvrđeni proizvod je višekorisnička PWA na srpskom, sa Google prijavom, Firebase Spark bazom, GitHub Pages hostingom i budžetom 0 €. Prati srpske fudbalske i košarkaške klubove kroz sva njihova relevantna takmičenja. Imaće automatske ICS pretplate, ručni Google Calendar upis, ličnu agendu sa sledećom utakmicom i prave push notifikacije dok je PWA zatvorena. U ovom tasku proveravaš samo izvore i model podataka potrebne za taj proizvod.

Konkretno:
- Istraži aktuelnu dokumentaciju i uslove besplatnih izvora. Proveri aktuelnu sezonu, relevantna domaća, regionalna i evropska takmičenja, buduće utakmice, paginaciju, preciznost termina, odlaganja, kvote i uslove javne JSON/ICS objave.
- Proveri najmanje dva fudbalska i dva košarkaška kluba. Razlikuj FK i KK istog imena. Za svaku tvrdnju zabeleži izvor i datum; javna lista liga nije dokaz da ih besplatan nalog stvarno daje.
- Napravi `docs/data-feasibility.md` sa matricom pokrivenosti, statusima POTVRĐENO / NEPOKRIVENO / NEPROVERENO, dokazima i izračunatom dnevnom potrošnjom.
- Definiši TypeScript ugovore za Team, Competition, Fixture i CoverageStatus, sa stabilnim identitetima i pravilnim tretmanom UTC vremena/nepoznate satnice.
- Pripremi mali jasno označen sintetički skup za pomeranje, odlaganje, otkazivanje, TBD i istu utakmicu dva praćena kluba. Dodaj samo minimalne skripte i provere potrebne ovoj celini.

Ako su potrebni API nalog ili ključ koji nisu dostupni, precizno objasni šta nedostaje i kako se bezbedno podešava. Nastavi nezavisno istraživanje i modele; stvarnu API proveru označi kao NEPROVERENO. Ne izmišljaj rezultate, ne ugrađuj tajne u kod i ne uvodi plaćeni servis, billing ili više naloga radi zaobilaženja kvote. Bez potvrđene potpune pokrivenosti nemoj tvrditi da je zahtev „sve utakmice” rešen.

Na kraju:
1. Ažuriraj `docs/progress.md` i `docs/decisions.md`.
2. Napravi `docs/handoffs/01-provera-podataka.md` po šablonu `docs/handoff-template.md`.
3. Navedi izmenjene datoteke, stvarno izvršene provere, neispunjene kriterijume, preporuku izvora i potrebne korisničke korake.
4. Stavi DONE samo ako kriterijumi zadatka 01 zaista prolaze; inače zabeleži tačnu prepreku.
5. Završi ovaj task. Celina 02 biće pokrenuta zasebnim promptom/taskom u istom projektu.

Rutinske tehničke odluke donosi samostalno u okviru specifikacije. Ne menjaj obim ili budžet bez dogovora. Ne oslanjaj se na istoriju ovog razgovora kao zamenu za zapis u projektu.
