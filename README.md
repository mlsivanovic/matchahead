# MatchAhead

Projektni folder za razvoj sa Grokom, u zasebnim taskovima.

**Trenutno stanje:** celine 01 i 01B su završene kao provere izvora. Besplatan i dopušten unos svih objavljenih utakmica nije dokazan. Celina 02 ima lokalnu push probu u `experiments/push-probe` i zapis u `docs/push-feasibility.md`. Poruka na zatvorenoj PWA na fizičkom uređaju nije proverena, pa je push faza BLOCKED za stvarnu isporuku. Celina 03 je PWA osnova u `apps/web`: četiri ekrana, manifest i jedan service worker. Prikaz koristi samo sintetičke DEMO utakmice. Izbor je ograničen na FK/KK Crvenu zvezdu i FK/KK Partizan. Projekat je verziran u git repozitorijumu `mlsivanovic/matchahead` (grana `main`) i javno objavljen na GitHub Pages: [https://mlsivanovic.github.io/matchahead/](https://mlsivanovic.github.io/matchahead/). Firebase Spark projekat `matchahead` je aktivan (Firestore u `eur3`, Google prijava omogućena), a Cloudflare Wrangler je prijavljen. Detaljna revizija pristupa je u `docs/infrastructure-readiness.md`.

## Početak

Otvori ovaj folder u okruženju u kojem Grok može čitati i menjati lokalne datoteke. Sledeći zaseban task je faza 04 (Google prijava i podešavanja). Push isporuka na zatvorenu PWA čeka proveru na fizičkom telefonu. Provera PWA osnove: `node scripts/check-pwa.mjs`.

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
