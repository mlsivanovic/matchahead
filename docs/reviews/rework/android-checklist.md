# Fizički Android — preostala lična provera

Status: **NIJE IZVRŠENO**. Korisnik je 7. oktobra rekao da će lično proveriti kasnije. Chromium viewport, CDP standalone ili screenshot nisu stvaran telefon.

Lokalni prikaz iz završnog izveštaja služi pregledu na računaru. Običan LAN HTTP nije dovoljan dokaz instalacije PWA. Za proveru ove lokalne verzije na telefonu potreban je pouzdan HTTPS pristup ili localhost preko USB reverse, kada korisnik bude spreman; ovaj zadatak ne objavljuje aplikaciju. Objavljeni GitHub Pages trenutno nije nova lokalna verzija.

Zabeležiti model telefona, Android/Chrome verziju, verziju aplikacije i način instalacije. Proveriti:

- Instalacija, otvaranje sa početnog ekrana i ponovno otvaranje offline.
- Light/Dark/Auto, promena sistema tokom rada, ponovni ulazak i odjava bez bljeska.
- Tri taba; filteri i položaj liste posle povratka; Back prvo zatvara detalj/panel.
- Portrait/landscape i uvećan tekst bez horizontalnog skrola ili prekrivenih kontrola.
- Tastatura u belešci: primarna akcija i zatvaranje ostaju dostupni; sadržaj se može skrolovati.
- Donja navigacija i Calendar traka iznad sistemske safe area; prvi meč na standardnom tekstu vidljiv bez skrola.
- Praćenje i raspored na zahtev, jasno offline/prazno/greška stanje.

Calendar regresije lokalnog browser testiranja koriste presretanje odgovora. Lična provera nije zahtev za stvarne Calendar upise; ne stvarati događaje radi ovog testa.

Rezultat i slike dopisati u `docs/reviews/matchahead-rework-final.md`. Do tada plan nije potpuno validiran.
