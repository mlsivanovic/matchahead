# Predaja zadatka 01 — provera podataka

Datum: 26. septembar 2026.
Status: DONE

## Ostvaren rezultat

Svako traženo takmičenje ima status POTVRĐENO, NEPOKRIVENO ili NEPROVERENO, sa izvorom i datumom. Potpun raspored nije potvrđen ni za jedan klub. Model razlikuje neobjavljen raspored od greške izvora, ne izmišlja 00:00 i ne pravi drugi identitet kad se termin promeni.

Zahtev „sve utakmice” nije ostvariv na izvorima koji su danas stvarno odgovorili. API-Sports ostaje neproveren dok korisnik ne doda jedan besplatan ključ.

## Izmenjene datoteke

- `docs/data-feasibility.md`
- `docs/progress.md`
- `docs/decisions.md`
- `docs/handoffs/01-provera-podataka.md`
- `README.md`
- `packages/domain/package.json`
- `packages/domain/tsconfig.json`
- `packages/domain/src/types.ts`
- `packages/domain/src/identity.ts`
- `packages/domain/src/time.ts`
- `packages/domain/src/normalize.ts`
- `packages/domain/src/quota.ts`
- `packages/domain/src/index.ts`
- `packages/domain/test/contracts.test.ts`
- `data/synthetic/domain-scenarios.json`
- `scripts/check-data-contracts.mjs`
- `.env.example`
- `.gitignore`

## Izvršene provere i dokazi

Komanda:

`node --experimental-strip-types --test packages/domain/test/contracts.test.ts`

Rezultat: 10 testova, 10 prolaza, 0 padova. Pokrivaju FK/KK identitet, pomeranje bez promene ID-ja, nepromenjenu reviziju pri istom sadržaju, odlaganje, otkazivanje, datum bez sata, termin bez datuma, jedan derbi za dva kluba, razliku `unpublished` i `source_error`, i dnevnu formulu kvote.

TheSportsDB ključ `123`, 26. septembar 2026, pozivi navedeni u `docs/data-feasibility.md`. Superliga seče na 15 utakmica. ABA vraća `events: null`. KLS vraća 15 utakmica drugih klubova, uključujući KK Vojvodinu, bez KK Partizana i KK Zvezde. Pretraga „Partizan” vraća albanski tim.

API-Football, API-Basketball i football-data.org nalog nisu pozvani. football-data.org pokrivenost je pročitana sa zvanične stranice istog dana.

Nema testa na uređaju i nema Firebase integracije. To nije deo ove celine.

## Kriterijumi koji nisu ispunjeni

Nijedan. Kriterijum celine je matrica, dokaz i ugovor, ne sama puna pokrivenost.

Proizvodni uslov „sve utakmice svih relevantnih takmičenja” i dalje nije ispunjen. To je zapisano kao NEPOKRIVENO ili NEPROVERENO, ne kao DONE izvora.

## Odluke i ugovori koje sledeći task mora sačuvati

- Ne uvoditi drugi ID utakmice.
- Ne pretvarati prazan feed u otkazivanje.
- Ne zvati sportski API iz browsera.
- Ne otvarati drugi nalog i ne uključivati plaćeni plan.
- Sintetički skup ostaje označen i ne ulazi u javni raspored.
- Zadatak 02 ne zavisi od ovog izvora i ne treba da ga menja.

## Potrebni pristupi i ručni koraci

Promenljive, bez vrednosti: `APISPORTS_FOOTBALL_KEY`, `APISPORTS_BASKETBALL_KEY`. Opciono i nepotrebno za srpski fudbal: `FOOTBALL_DATA_TOKEN`.

Korisnik otvara jedan nalog na dashboard.api-football.com, kopira dva ključa u lokalni `.env` ili GitHub Secrets i javlja da postoje. Sledeća provera izvora sme da potroši samo mali broj poziva za sezonu 2026. TheSportsDB `123` je javan i nedovoljan; premium ključ se ne nabavlja.

## Sledeći task

02 — proba push notifikacija dok je PWA zatvorena. Preduslov nije celina 01. Prvi korak je pročitati `plans/grok-faze/02-proba-push-notifikacija.md`, `docs/progress.md` i `docs/decisions.md`. Ovaj dokument ne pokreće taj task.
