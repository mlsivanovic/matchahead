# 03. Instalabilna PWA i navigacija

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** Model iz 01; nalaze 02 uzeti u obzir pri service worker dizajnu.

## Posao

Napravi React/TypeScript/Vite osnovu na GitHub Pages, sa manifestom, stabilnim app ID-em, ikonama, standalone prikazom i start_url/scope vrednostima usklađenim sa Pages poddirektorijumom.

Implementiraj četiri ekrana iz stalnog konteksta i navigaciju za telefon. Izbor kluba čitaj iz `selectableTeams`: za fudbal i košarku samo Crvena zvezda i Partizan. Protivnike u DEMO utakmicama ne filtriraj ovim pravilom. Koristi sintetičke podatke sa oznakom DEMO dok pravi podaci nisu povezani. PWA instalacija i offline rad su obavezni u ovoj fazi.

Service worker kešira aplikacioni omotač i poslednji dozvoljeni javni raspored. Google OAuth i API odgovore ne keširati. Lične offline podatke držati odvojeno po uid-u ili ne čuvati trajno; odjava mora ukloniti korisnikov lokalni sadržaj.

Planiraj jedan koordinisan service worker za offline i push tok; proveri da FCM i PWA plugin ne prepisuju registraciju istog scope-a. Putanje moraju raditi na /repo/; ne pretpostavljaj pristup root-u github.io domena.

Dodaj offline oznaku sa vremenom poslednjeg osvežavanja i obaveštenje kada je nova verzija spremna. Ne forsiraj reload dok korisnik upisuje događaje. Ugradi „Instaliraj” kada browser to podržava i uputstvo za iPhone gde je potreban ručni postupak.

## Uslov završetka

PWA se otvara iz instalirane ikone, navigacija i refresh rade na Pages putanji. Posle jednog online učitavanja app shell i javni raspored rade offline. Novi deploy može bezbedno zameniti stari keš. Tastatura i prikaz na širini 360 px ostaju upotrebljivi. Nema lažne tvrdnje da offline režim daje sveže termine.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
