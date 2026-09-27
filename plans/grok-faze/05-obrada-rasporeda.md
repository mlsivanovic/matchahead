# 05. Pravi rasporedi na korisnikov zahtev

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 01, 01B i 03; ne zavisi od završenog push-a. Ako 01B ne dokaže dopušten izvor za traženo takmičenje, funkcija za njega ostaje jasno ograničena, ne popunjava se izmišljenim podacima.

## Posao

Implementiraj „Pronađi utakmice” po sportu, klubu i sezoni, koristeći samo dopuštene i potvrđene izvore iz 01B. Dozvoljeni izbor su četiri tima iz `selectableTeams`; serverski endpoint takođe odbija druge ID-jeve. Obuhvati sva tada objavljena relevantna takmičenja, validiraj paginaciju i prikaži pokrivenost po takmičenju. Pozive sa tajnama/CORS ograničenjem vodi kroz provereni serverski sloj; sačuvaj poslednji dobar rezultat u zajedničkom kešu po klubu/sezoni. Prikaži datum tog rezultata i eksplicitno dugme „Osveži raspored”. Nema periodičnog sportskog preuzimanja na tri sata.

Trajno čuvaj prethodno validirano stanje i revizije u dozvoljenom formatu. Razlikuj pokušaj preuzimanja, uspešnu proveru izvora i stvarnu promenu sadržaja. Ne inkrementiraj reviziju događaja pri identičnom odgovoru.

Validiraj kompletan odgovor i paginaciju pre objave. Timeout, 429 ili nepotpun/prazan odgovor ne smeju obrisati prethodni raspored. Eksplicitne statuse odlaganja i otkazivanja mapirati odvojeno.

Sačuvaj interni fixture ID pri promeni vremena i naziva kluba. Kod promene provajdera koristi provereno mapiranje, a ne naivno poređenje imena i datuma.

Objavljuj ili čuvaj metapodatke o poslednjem pronalaženju i kompaktan indeks promena koji će služiti budućem notification servisu, samo ako način distribucije dopuštaju uslovi izvora. On sadrži sportske podatke, ne korisnike ili njihove uređaje.

Na stranici kluba poveži spisak takmičenja i kvalitet pokrivenosti. Sezonski prelazak ne sme promeniti identitet kluba ili stabilnu putanju njegovih podataka.

## Uslov završetka

Aplikacija na klik prikazuje proverene buduće rasporede, izvore, poslednju proveru i potpunost po takmičenju. Testovi za pomeranje, otkazivanje, duplikate, paginaciju, keš i pad provajdera prolaze. Dva uzastopna identična preuzimanja ne prave lažne promene. Ako javno objavljuje podatke, to ne briše frontend.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
