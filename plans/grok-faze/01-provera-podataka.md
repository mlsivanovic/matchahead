# 01. Besplatni izvori i ugovori podataka

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** Nema; pročitaj stalni kontekst.

## Posao

Proveri stvarnu dostupnost besplatnih rasporeda za srpske fudbalske i košarkaške klubove kroz sva njihova relevantna takmičenja. Glavni plan, odeljci 5 i 7, daje kandidate i model. Ne gradi ostatak aplikacije u ovom zadatku.

- Napravi matricu klub × takmičenje × sezona, sa dokazom besplatnog pristupa, satnice, statusa i prava objave.
- Proveri bar dva kluba iz svakog sporta i razliku FK/KK. Testiraj paginaciju i granice besplatnog naloga.
- Izmeri zahteve potrebne za jedan ciklus i izračunaj dnevnu kvotu. Otvaranje aplikacije ne sme stvarati sportske API pozive.
- Definiši TypeScript modele Team, Competition, Fixture i CoverageStatus, sa stabilnim ID-jevima, UTC vremenom ili eksplicitnim nepoznatim terminom.
- Pripremi mali, jasno označen sintetički skup koji pokriva pomeranje, odlaganje, otkazivanje, nedostajući termin i istu utakmicu dva praćena kluba.

Isporuči `docs/data-feasibility.md`, ugovore i test podatke. Ako nedostaje ključ, opiši preciznu konfiguraciju i ne označavaj dostupnost aktuelne sezone kao potvrđenu.

## Uslov završetka

Svako traženo takmičenje ima status potvrđeno/nepokriveno/neprovereno i dokaz. Nema hardkodovanih pretpostavki o aktuelnim učesnicima. Model razlikuje neobjavljeni raspored od greške izvora. Korisniku je vidljivo da li je uslov „sve utakmice” ostvariv bez plaćanja.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
