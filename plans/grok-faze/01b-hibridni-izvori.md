# 01B. Pronalazak utakmica na klik — zaseban Grok task

Pročitaj `README.md`, `plans/grok-faze/00-stalni-kontekst.md`, `docs/data-feasibility.md`, `docs/data-alternatives.md`, `docs/decisions.md`, `docs/progress.md` i postojeći domen. Korisnik je pojasnio: **nema potrebe za stalnim sportskim osvežavanjem**; po izboru sporta/kluba/sezone klikne „Pronađi utakmice” i očekuje sve tada objavljene buduće utakmice tog kluba. Kasnije sam bira „Osveži raspored”. Radi samo 01B; ne pokreći 02, 05 niti plaćene servise.

## Proveri izvodljivost tog jednog klika

1. Za najmanje FK Partizan, FK Crvena zvezda, KK Partizan i KK Crvena zvezda napravi mapu takmičenja za sezonu 2026/27, sa statusom objave rasporeda. Razdvoji „sve objavljene utakmice” od još neizvučenih faza. Proveri zvanične izvore i direktne kalendarske pretplate, uključujući Fixtur.es za fudbal. Ne izjednačavaj javnu stranicu sa dozvoljenim API-jem ili pravom javnog JSON/ICS-a. Ne koristi nedokumentovane privatne endpointove kao produkcioni plan.
2. Predloži realan tok za `findFixtures(sport, teamId, season)`: izvori po takmičenju → sve stranice odgovora → validacija → deduplikacija → status pokrivenosti → zajednički keš → odgovor. Izračunaj najgori broj zahteva i vreme jednog klika, kao i ponovljenih klikova više korisnika u besplatnoj kvoti. Tajni ključevi ne idu u PWA. Navedi koji besplatni server/proxy bi bio potreban za CORS/tajne i kako bi se kontrolisala zloupotreba. Ako konkretan izvor nema pravo upotrebe, označi ga blokiranim umesto da ga uključiš.
3. Proveri datume i satnice na nekoliko konkretnih primera, uključujući 00:00/01:00/02:00. Satnica bez dokaza ostaje nepotvrđena. AI analiza sme biti predlog sa URL-om izvora, nikad jedina potvrda; bez održivog besplatnog AI API-ja ostaje opciona. Ne podrazumevaj ručni nedeljni pregled kao proizvodni tok.

## Mali lokalni dokaz, bez javnog feeda

Napravi malu funkciju/prototip nad jasno sintetičkim odgovorima više takmičenja koja vraća sortirane buduće utakmice, sledeću utakmicu, duplikate uklonjene po stabilnom ID-u i per-takmičenje status pokrivenosti. Pokaži da FK/KK istog imena ostaju različiti; promena termina čuva ID; prazna ili nedostupna sezona ne znači „nema utakmica”; neobjavljena nokaut faza je posebno stanje. Dodaj smisleno ograničenje osvežavanja/keširanja u dizajn. Ne objavljuj stvarne tuđe podatke.

## Isporuka

Napiši `docs/data-on-demand-feasibility.md`: tabela izvor × takmičenje × sezona × pristup × potpunost × pravo upotrebe, plus korisnički tok za „Pronađi”, „Dodaj sve u Calendar”, „Prati kroz ICS” i „Osveži raspored”. Navedi tačno šta se može dokazano automatizovati za 0 €, a šta ostaje UNKNOWN/BLOCKED. Uključi praktičan plan faze 05 i posledice retkog osvežavanja po Calendar/push. Ažuriraj `docs/progress.md` i `docs/decisions.md` samo dokazima i napiši `docs/handoffs/01b-pronalazak-na-zahtev.md`. Završi ovaj task bez preuzimanja naredne celine.
