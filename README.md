# MatchAhead

Projektni folder za razvoj sa Grokom, u zasebnim taskovima.

**Trenutno stanje (6. oktobar 2026):** React PWA, Google/Firebase klijent i lična DEMO agenda integrisani su u `main`. Lokalni Auth i agenda pregled prolaze uz ograničenja emulatora; živa Google prijava i produkciona Firestore pravila još nisu provereni. Jedan service worker obezbeđuje instalabilnost i offline omotač.

Pronalaženje stvarnih utakmica povezano je sa produkcijskim servisom. Javni rasporedi FSS Superlige, ABA lige i Evroliga PDF-a čitaju se na zahtev, uz zajednički keš i linkove ka izvorima. Pretraga je dostupna bez prijave; nalozi i lični podaci ostaju odvojeni. Servis ima 56 prolaznih testova, klijent 113. Kupovi, KLS, plej-of i evropski fudbal još nemaju povezan potvrđen izvor; FSS/ABA satnice bez dokazane zone ostaju nepotvrđene. [Odluka i dokazi aktiviranja](docs/phase-05-live-enablement.md) i [aktuelni napredak](docs/progress.md) beleže granice. Raniji [QA izveštaj](docs/reviews/05-schedule-service-and-client.md) je istorijski pregled pre aktiviranja javnog API-ja.

Push osnova ima 27 lokalnih testova, uključujući 4 workerd testa. Fizička isporuka na zatvorenoj PWA i edge CPU još nisu provereni; push kapije ostaju ugašene. Firebase naplata je isključena, Cloudflare plan nije verifikovan dokazom. Budžet ostaje 0 €. Integracija i završni pregled faze 05 push-ovani su na GitHub 6. oktobra 2026. Pages objava prati rezultat [GitHub Actions provera](https://github.com/mlsivanovic/matchahead/actions); [javna aplikacija](https://mlsivanovic.github.io/matchahead/) prikazuje pronađene stvarne rasporede uz odvojene DEMO podatke.

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
