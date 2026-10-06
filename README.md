# MatchAhead

Projektni folder za razvoj sa Grokom, u zasebnim taskovima.

**Trenutno stanje (6. oktobar 2026):** React PWA, Google/Firebase klijent i lična DEMO agenda integrisani su u `main`. Lokalni Auth i agenda pregled prolaze uz ograničenja emulatora; živa Google prijava i produkciona Firestore pravila još nisu provereni. Jedan service worker obezbeđuje instalabilnost i offline omotač.

Lokalna implementacija faze 05 i Gemini završni pregled prihvaćeni su: Grokov server/SQLite Durable Object i parseri, Muse klijent i jedinstvena agenda integrisani su. Servis ima 55 prolaznih testova, klijent 113; [QA izveštaj](docs/reviews/05-schedule-service-and-client.md) navodi dodatne browser, PWA i emulator dokaze. Postoje probe ligaških HTML izvora i zvaničnog PDF-a Evrolige za 2026/27. Produkciono korišćenje izvora, puna pokrivenost svih takmičenja i živi sportski endpoint još nisu potvrđeni; javni raspored ostaje sintetički DEMO. [Ugovor faze 05](docs/phase-05-work-contract.md), [audit izvora](docs/phase-05-source-audit.md) i [aktuelni napredak](docs/progress.md) beleže dokaze i prepreke.

Push osnova ima 27 lokalnih testova, uključujući 4 workerd testa. Fizička isporuka na zatvorenoj PWA i edge CPU još nisu provereni; push kapije ostaju ugašene. Firebase naplata je isključena, Cloudflare plan nije verifikovan dokazom. Budžet ostaje 0 €. Poslednja potvrđena Pages objava je `be48495` ([aplikacija](https://mlsivanovic.github.io/matchahead/)); novija lokalna integracija još nije objavljena.

## Početak

Otvori ovaj folder u okruženju u kojem agent može čitati i menjati lokalne datoteke. Posle `npm ci --prefix apps/web`, lokalne provere su `node scripts/check-data-contracts.mjs`, `npm --prefix apps/web run check` i `node scripts/check-pwa.mjs`. Aktivna faza je 05; detalji vlasništva i pregleda su u `docs/orchestration-plan.md`.

Ako Grok nema pristup lokalnom filesystem-u, priloži datoteke koje prompt traži ili mu obezbedi pristup projektu; sama apsolutna putanja ne daje pristup fajlovima.

## Organizacija

- [Plan od 12 celina](plans/grok-faze/README.md)
- [Stalni kontekst](plans/grok-faze/00-stalni-kontekst.md)
- [Glavna specifikacija 2.0](plans/plan-za-grok-sportski-kalendar.md)
- [Stanje svih zadataka](docs/progress.md)
- [Potvrđene odluke i otvorene pretpostavke](docs/decisions.md)
- `docs/handoffs/` — predaje koje Grok piše posle svakog taska
- [Šablon za sledeći task](PROMPT-SLEDECI-TASK.md)

Svi prethodno pripremljeni planovi, pojedinačni promptovi i izvorni ZIP nalaze se u `plans/`.

## Pravilo rada

Jedan prompt/task = jedna numerisana celina. Task čita postojeće stanje, implementira ograničen posao, proverava kriterijume i ostavlja predaju u projektu. Sledeći task pokreće se zasebno i nastavlja isti kod.

Sačekaj završetak aktivnog taska pre pokretanja narednog koji menja isti projekat. DONE označava dokazan rezultat; nedostajući API ključ, netestirana integracija ili neispunjen kriterijum moraju ostati vidljivi.

Nema potrebe da svaki task dobija ceo prethodni razgovor. Stalni kontekst, njegov zadatak, progress, odluke, relevantne predaje i postojeći kod predstavljaju njegovo radno stanje.
