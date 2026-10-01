# MatchAhead

Projektni folder za razvoj sa Grokom, u zasebnim taskovima.

**Trenutno stanje (doc patch 30. septembar 2026 nad `d582885`, IN_PROGRESS):** celine 01 i 01B su završene kao provere izvora. Odobren izvor za unos nije potvrđen — faza 05 je BLOCKED, javni prikaz ostaje sintetički DEMO. Celina 02/push je BLOCKED: praćeni kod je usklađen sa Durable Object skladištem (`6af69c1`, pregled `ea0a993`+`8d9a048`, 27/27 testova: 23 funkcionalna + 4 workerd) — rekonstrukcija sa 3 namerne razlike, nije deployovana; na produkciji radi verzija `2ee78270...` od 27. septembra; živa migracija redova, fizička isporuka na zatvorenoj PWA (Android dostupan, iPhone nepotvrđen) i edge `cpuTime` ostaju NOT_TESTED; kapije ostaju ugašene. Važeći ugovor: `POST /api/registrations` (`x-matchahead-enroll` + `fid`) → 201 `{registrationId, selfSendKey}`; `POST /api/probe/send` samo `registrationId` uz `Bearer <selfSendKey>`; odjava `DELETE /api/registrations/<id>`; UI ne ispisuje ID/ključ (Network zapis 201). Celina 03 je PWA osnova u `apps/web` (četiri ekrana, manifest, jedan service worker). Faza 04 je IN_PROGRESS (jezgro naloga testirano u emulatoru, ekran/adapter i integracija 04+06 su živi u `matchahead-auth-client` — finalni dokaz se čeka, bez tvrdnje o pass/merge/publish). Faza 06 je IN_PROGRESS (logika i samostalne UI komponente verifikovane nad DEMO podacima, integracija u `App.tsx` čeka koordinatora). Projekat je verziran u `mlsivanovic/matchahead` (grana `main`); poslednja potvrđena Pages objava je `be48495` ([https://mlsivanovic.github.io/matchahead/](https://mlsivanovic.github.io/matchahead/)). Firebase projekat `matchahead` postoji (Firestore `FIRESTORE_NATIVE`, multi-region `eur3`, `freeTier: true`, naplata isključena `billingEnabled: false`); Google prijava `google.com` je omogućena; Cloudflare nalog i worker `matchahead-push-probe` postoje (plan naloga nije verifikovan dokazom; budžet 0 €, naplata se ne uključuje). Detalji: `docs/infrastructure-readiness.md`, `docs/push-readiness-review.md`, `docs/orchestration-plan.md`.

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
