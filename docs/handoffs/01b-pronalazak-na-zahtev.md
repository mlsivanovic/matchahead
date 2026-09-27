# Predaja zadatka 01B — pronalazak utakmica na klik

Datum: 26. septembar 2026.
Status: DONE

## Ostvaren rezultat

Jedan klik ima opisan i lokalno dokazan tok: izvori po takmičenju, sve strane, validacija, deduplikacija po stabilnom ID-u, status pokrivenosti, zajednički keš i odgovor. FK i KK istog imena ostaju različiti. Promena sata čuva ID. Prazna ili nedostupna sezona ne znači da utakmica nema. Neobjavljen nokaut je posebno stanje. Satovi 00:00, 01:00 i 02:00 nisu potvrđen početak.

Potpun i dopušten automatski unos stvarnih utakmica nije potvrđen. Nijedan provereni izvor nema i pokrivenost i pravo da MatchAhead objavi tuđi raspored. Direktna pretplata koju Fixtur.es ili UEFA nude korisniku nije unos u MatchAhead.

## Izmenjene datoteke

- `docs/data-on-demand-feasibility.md`
- `docs/progress.md`
- `docs/decisions.md`
- `docs/handoffs/01b-pronalazak-na-zahtev.md`
- `docs/data-feasibility.md`
- `docs/data-alternatives.md`
- `README.md`
- `packages/domain/src/find-fixtures.ts`
- `packages/domain/src/time.ts`
- `packages/domain/src/quota.ts`
- `packages/domain/src/index.ts`
- `packages/domain/test/find-fixtures.test.ts`
- `packages/domain/package.json`
- `data/synthetic/find-fixtures-scenarios.json`
- `scripts/check-data-contracts.mjs`

## Izvršene provere i dokazi

Komanda:

`node scripts/check-data-contracts.mjs`

Rezultat: 19 testova, 19 prolaza, 0 padova. Deset starih provera ugovora i devet novih za spajanje na zahtev.

Stranice otvorene 26. septembra 2026, navedene u `docs/data-on-demand-feasibility.md`: FSS Superliga, Fixtur.es za FK Partizan i za ligu, UEFA ligaška faza Lige konferencije, ABA kalendar, zvanične stranice Evrolige, vest FK Partizan o prijateljskoj utakmici, Cloudflare limiti workera. API-Sports nije pozvan jer ključa nema. TheSportsDB nije ponovo pozivan; važi zapis zadatka 01.

Nema testa na uređaju, nema Firebase-a i nema objavljenog workera. To nije deo ove celine. Nema javnog feeda tuđih utakmica.

## Kriterijumi koji nisu ispunjeni

Nijedan kriterijum ove provere. Provera traži mapu, tok, kvotu, prava i mali lokalni dokaz, ne uključen produkcioni adapter.

Proizvodni unos „sve tada objavljene utakmice u agendu” i dalje nije ispunjen. Izvori su BLOCKED ili UNKNOWN, ne DONE pokrivenosti.

## Odluke i ugovori koje sledeći task mora sačuvati

- Identitet utakmice se ne menja kad se promeni sat. Ne uvoditi drugi ID.
- Prazan odgovor ne otkazuje utakmicu i ne briše poslednji dobar raspored.
- Neobjavljena faza nije isto što i greška izvora niti isto što i „nema utakmica”.
- 00:00, 01:00 i 02:00 bez drugog dokaza nemaju `startsAtUtc`.
- Pregledač ne zove sportski API i ne dobija tajni ključ.
- Izvor bez prava upotrebe ne ulazi u odgovor. Nedokumentovani endpoint nije plan.
- Nema periodičnog preuzimanja rasporeda i nema plaćenog plana.
- Sintetički skup ostaje označen.
- Keš je zajednički: 6 časova prikaza, 15 minuta najkraćeg osvežavanja, plus globalni dnevni plafon. Razmak od 15 minuta sam ne staje u kvotu od 100.

## Potrebni pristupi i ručni koraci

Promenljive i dalje bez vrednosti: `APISPORTS_FOOTBALL_KEY`, `APISPORTS_BASKETBALL_KEY`. Opciono i nepotrebno za ovaj zaključak: `FOOTBALL_DATA_TOKEN`.

Ni jedan ključ nije potreban da bi zaključak 01B važio. Ako se kasnije proba API-Sports, jedan besplatan nalog i mali broj poziva, van repozitorijuma. Uspešan odgovor ne daje pravo objave.

Direktna pretplata, ako je korisnik sam doda u svoj kalendar: `webcal://ics.fixtur.es/v2/fk-partizan.ics`. MatchAhead taj URL ne preuzima u svoj feed.

## Sledeći task

02 — proba push notifikacija dok je PWA zatvorena. Ne zavisi od sportskih podataka. Prvi korak je pročitati `plans/grok-faze/02-proba-push-notifikacija.md`, `docs/progress.md` i `docs/decisions.md`.

Faza 05 i dalje čeka dopušten izvor. Ovaj dokument je ne pokreće.
