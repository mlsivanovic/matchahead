# MatchAhead

Projektni folder za razvoj sa Grokom, u zasebnim taskovima.

**Trenutno stanje (checkpoint 30. septembar 2026, IN_PROGRESS):** celine 01 i 01B su završene kao provere izvora. Odobren izvor za unos nije potvrđen — faza 05 je BLOCKED, javni prikaz ostaje sintetički DEMO. Celina 02/push: lokalna FID proba prolazi, živa isporuka na zatvorenoj PWA nije proverena ni na jednom fizičkom uređaju (Android dostupan po korisniku, iPhone nepotvrđen). Celina 03 je PWA osnova u `apps/web` (četiri ekrana, manifest, jedan service worker). Faza 04 je IN_PROGRESS (jezgro naloga testirano u emulatoru, ekran nije urađen, pravila nisu deployovana). Faza 06 je IN_PROGRESS (logika i samostalne UI komponente verifikovane nad DEMO podacima, integracija u `App.tsx` čeka koordinatora). Projekat je verziran u `mlsivanovic/matchahead` (grana `main`); poslednja potvrđena Pages objava je `be48495` ([https://mlsivanovic.github.io/matchahead/](https://mlsivanovic.github.io/matchahead/)). Firebase projekat `matchahead` postoji (Firestore `FIRESTORE_NATIVE`, multi-region `eur3`, `freeTier: true`, naplata isključena `billingEnabled: false`); Google prijava `google.com` je omogućena; Cloudflare nalog i worker `matchahead-push-probe` postoje (plan naloga nije verifikovan). Detalji: `docs/infrastructure-readiness.md`, `docs/push-readiness-review.md`, `docs/orchestration-plan.md`.

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
