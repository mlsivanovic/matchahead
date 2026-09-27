# 12. Pilot, objavljivanje i dokumentacija održavanja

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 11; svi obavezni kriterijumi su prošli.

## Posao

Pripremi pilot sa 5–10 korisnika, različitim klubovima i podržanim telefonima. Razlikuj dostupan uređaj od pretpostavljene podrške. Zabeleži stvarna kašnjenja izvora, ICS osvežavanja i push-a odvojeno.

Objavi jasnu matricu podržanih klubova/takmičenja i ograničenja. Završiti potrebna Google OAuth podešavanja/verifikaciju; test režim ili nedostatak dozvole ne sakrivati u produkcionom prikazu.

Isporuči README/setup, .env.example bez tajni, operativno uputstvo, Firebase Rules/indexes, workflow-e, PWA i Worker konfiguraciju, evidenciju arhitektonskih odluka i test izveštaj. Dokumentuj rotaciju secrets, izgubljen workflow schedule, novi izvor/sezonu, obnovu poslednjeg dobrog rasporeda, kill switch za push i rollback.

Pripremi proceduru ručnog gašenja slanja pri pogrešnim podacima, bez brisanja agende. Monitoring mora ostati u budžetu: manifest svežine, poslednji uspešan worker posao i agregatne greške, bez javnog spiska korisnika.

Ne označavati aplikaciju završenom ako PWA samo liči na mobilnu aplikaciju, push radi samo dok je otvorena, ili su svi sportski podaci i dalje demo. Objavi poznata ograničenja i koje metrike treba pratiti tokom pilota.

## Uslov završetka

Korisnik može instalirati PWA, prijaviti se, izabrati klub, videti uređenu agendu i sledeću utakmicu, uključiti pretplatu, ručno upisati događaje i primiti pravi push sa zatvorenom PWA. Izabrani izvori i izmerena pilot potrošnja podržavaju rad bez billing-a. Nema tvrdnje o potpunoj pokrivenosti ako ona nije dokazana.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
