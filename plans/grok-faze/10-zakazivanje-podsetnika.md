# 10. Serverski podsetnici i promene termina

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 02, 04, 05, 06 i 09.

## Posao

Cron za dospele push podsetnike ostaje potreban i kada nema periodičnog preuzimanja sportskog rasporeda. Planiraj samo prema poslednjem potvrđenom snimku. Ako je termin na izvoru pomeren posle korisnikovog poslednjeg „Osveži raspored”, aplikacija to ne zna; korisniku jasno prikaži ovu granicu pouzdanosti.

Implementiraj provereni besplatni sender i scheduler iz zadatka 02. Početni cilj je provera dospelih poslova približno svakog minuta, uz merljiv cilj da server obradi zdrav pilot posao u narednih pet minuta. To je cilj obrade, ne garancija trenutka prikaza na telefonu.

Planiranje mora polaziti od aktuelne verzije rasporeda i korisnikovih aktivnih izbora. Izbegni čitanje cele baze svih korisnika svakog minuta: napravi indeks dospelih poslova i/ili upite za pratioce timova samo za relevantne utakmice. Obuhvati klubove i ručni izbor, spoji primaoce po uid-u, pa po aktivnom uređaju. Isto ime kluba ili dve pretplate ne smeju dati dva posla.

Trajnu evidenciju notifJobs/notificationDeliveries menja samo server. Korisnik menja svoje preference i izbore; nikada proizvoljan payload ili cilj drugog korisnika. Proračun posla verifikuje fixture, dozvoljene lead vrednosti i izbor korisnika. Posle nove preference ili izbora obezbedi obradu promene i kada korisnik zatvori PWA; dokumentuj pouzdan indeks/registracioni tok, ne oslanjaj se na Firebase trigger koji nije dostupan u izabranom planu.

Identitet isporuke uključuje uid, uređaj, fixture ID, tip, scheduleRevision i leadMinutes. Za reminder scheduleRevision se menja pri promeni početka/statusa, ne zbog kozmetičkog opisa. Pre slanja ponovo proveri aktuelni termin, status, preference i registraciju. Pomeranje poništava stare poslove, otkazivanje ukida reminder, unknown time ne dobija alarm.

Obradi lease/claim i ponovni pokušaj posle prekida. Firestore i FCM nemaju zajedničku transakciju: ne obećavaj exactly-once dostavu. Trajna evidencija, stabilan notification ID i klijentska deduplikacija smanjuju duplikate; jasno dokumentovati nejasan ishod slanja.

Ograniči TTL tako da podsetnik ne bude koristan posle početka; preskoči stare zaostale poslove. Quiet hours i isključivanje su podesivi; ne šalji nagomilane stare poruke posle noći. Nevažeće registracije deaktiviraj. Koristi malu količinu podataka u poruci i povuci sveže stanje pri otvaranju.

Notifikacije o promenama mogu stići tek kada izvor i naš periodični import otkriju promenu. Ne predstavljaj ih kao trenutne objave sa stadiona. Isporuči izmerene CPU/subrequest/Firestore troškove za pilot, limite batch-a i ponašanje pri premašenoj kvoti.

## Uslov završetka

Kontrolisani reminder stiže sa zatvorenom PWA. Pomeranje pre slanja menja rok; otkazivanje sprečava stari alarm. Dva praćena kluba daju jedan posao po uređaju. Paralelni i ponovljeni worker-i ne stvaraju nekontrolisane duplikate. Testirati kasni cron, crash pre/posle FCM poziva, opoziv dozvole i korisnika koji isključi obaveštenja pre slanja. Dokazano da pilot staje u besplatne limite, ili zadatak ostaje BLOCKED uz konkretne mere.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
