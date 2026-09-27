# Grok — 12 glavnih celina i dodatna provera 01B

Verzija 2.0 · 26. septembar 2026.

Novi obavezni zahtevi: instalabilna PWA, prave push notifikacije kada je zatvorena, pregled svih utakmica dodatih/praćenih kroz aplikaciju, hronološki redosled i sledeća utakmica.

## Kako koristiti paket

1. U projektu sačuvaj [stalni kontekst](00-stalni-kontekst.md). To su pravila koja važe kroz sve zadatke.
2. Prvi put daj Groku stalni kontekst i zadatak 01. Glavni plan može stajati uz projekat kao referenca.
3. Svaki sledeći put šalji jednu numerisanu celinu i uputi Grok na `docs/progress.md`. Ne traži celu aplikaciju u jednoj poruci.
4. Svaki zadatak završava konkretnim rezultatom i proverama. Tek zatim pokreni naredni zavisni zadatak.
5. Ako počinješ novi Grok razgovor, priloži stalni kontekst, tekući zadatak, progress/decisions dokumente i pristup trenutnom kodu. Raniji razgovor nije zamena za te datoteke.

## Redosled

| Korak | Samostalan zadatak / prompt |
|---|---|
| 01 | [Besplatni izvori i ugovori podataka](01-provera-podataka.md) |
| 01B | [Proveri pronalazak utakmica na klik](01b-hibridni-izvori.md) |
| 02 | [Dokaži push dok je PWA zatvorena](02-proba-push-notifikacija.md) |
| 03 | [Instalabilna PWA i navigacija](03-pwa-osnova.md) |
| 04 | [Google prijava i izolovani korisnici](04-prijava-i-podesavanja.md) |
| 05 | [Pravi rasporedi na korisnikov zahtev](05-obrada-rasporeda.md) |
| 06 | [Početna, sledeća utakmica i hronološki pregled](06-moje-utakmice.md) |
| 07 | [Klupske ICS pretplate](07-automatski-kalendar.md) |
| 08 | [Ručni izbor i evidencija Google događaja](08-rucni-google-upis.md) |
| 09 | [Push dozvole, uređaji i otvaranje utakmice](09-push-na-uredjaju.md) |
| 10 | [Serverski podsetnici i promene termina](10-zakazivanje-podsetnika.md) |
| 11 | [Otpornost, privatnost i integracioni testovi](11-provera-celog-toka.md) |
| 12 | [Pilot, objavljivanje i dokumentacija održavanja](12-pilot-i-predaja.md) |

Zadaci 01 i 02 su rane provere dva najveća rizika: besplatnih podataka i stvarnog push-a. Mogu se proveriti nezavisno, ali ovaj paket ne zahteva paralelne agente. Zadatak 03 može početi sa označenim test podacima dok se rešava izvor; to ne čini 01 završenim.

## Poruka za nastavak

> Nastavi iz trenutnog repozitorijuma. Pročitaj stalni kontekst, docs/progress.md i docs/decisions.md. Uradi samo zadatak XX iz priložene datoteke. Sačuvaj postojeće odluke koje nisu u sukobu sa njim. Proveri njegove kriterijume završetka i zabeleži stvarne rezultate. Na kraju predaj status, ograničenja i naredni korak; ne započinji sledeću celinu u ovom zadatku.

## Zašto je ovako podeljeno

Svaka celina ima mali proverljiv rezultat. Push se najpre tehnički dokazuje, zatim se integriše prijem na uređaju, pa zakazivanje. PWA osnova se proverava pre Calendar integracije. Agenda ima sopstvena pravila i testove. Kod ne zavisi od toga da Grok zapamti ceo dugačak razgovor.

Ovo su razvojne celine, ne procene „jedna celina = jedan dan”. Ako jedna naraste, podeliti je na završive podzadatke uz isti uslov završetka i ažuriran progress dokument.
