# 04. Google prijava i izolovani korisnici

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 03; ugovori iz 01.

## Posao

Poveži Firebase Auth Google login i Firestore Spark, bez billing-a. Implementiraj profil, favorite, vremensku zonu i osnovna podešavanja notifikacija, bez automatskog traženja push dozvole pri prijavi.

Razdvoji Firestore dokumente profila, praćenja kluba, ručnih izbora i uređaja. Rules ograničavaju pristup vlasniku i proveravaju dozvoljena polja i tipove. ID omiljenog/praćenog kluba mora biti jedan od četiri ID-ja iz `selectableTeams`, ne proizvoljan string; server i UI primenjuju isto pravilo. Protivnik u utakmici nije ograničen tim pravilom. Serverski poslovi i evidencija slanja nisu klijentski upisivi. Zajedničke tipove pripremi za zadatke 06 i 10; ne dodaj serverske tajne.

Uvedi eksplicitne razloge uključivanja utakmice: praćenje kluba i ručni izbor. Odvojiti omiljeni klub za brzo nalaženje od uključenog praćenja njegovih utakmica, ako UI nudi oba.

Implementiraj odjavu bez curenja prethodnog korisnikovog offline prikaza. Predvidi brisanje naloga i svih poddokumenata, uključujući registracije uređaja, uz oporavak posle prekida; Auth delete sam ne briše Firestore.

Osnovni pregled javnog rasporeda radi bez prijave. Calendar OAuth je poseban korak i ne pripada ovom zadatku.

## Uslov završetka

Dva emulator test korisnika ne mogu čitati ili menjati podatke jedan drugog. Nedozvoljena polja i pogrešni tipovi se odbijaju. Favoriti opstaju pri prijavi na drugom uređaju. Nakon odjave/drugog login-a nema stare privatne liste u UI-u ili privatnom lokalnom kešu.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
