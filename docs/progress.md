# Napredak projekta

Ažurirano: 1. oktobar 2026. — tekući run `run_6d3c53cc583e`. Auth klijent i lična DEMO agenda već su integrisani u `main`; lokalni pregled je prihvaćen uz ograničenja. Faza 05 je IN_PROGRESS: zajednički ugovor, domenske korekcije i prvi klijent su integrisani, serverski runtime i korekcije klijenta još se rade. Produkcioni izvori, potpuna pokrivenost i živi sportski endpoint nisu potvrđeni. Push na GitHub još nije urađen.
Verzija specifikacije: 2.0

| Zadatak | Status | Dokaz / prepreka |
|---|---|---|
| 01 | DONE | `docs/data-feasibility.md`. Zahtev „sve utakmice” nije ispunjen: TheSportsDB seče sezonu na 15 zapisa, API-Sports je bez ključa, football-data.org nema srpska takmičenja ni košarku. |
| 01B | DONE | `docs/data-on-demand-feasibility.md`. Tok jednog klika i sintetičko spajanje prolaze. Nijedan stvarni izvor nema i pokrivenost i pravo unosa. 00:00/01:00/02:00 nisu potvrđen sat. |
| 02 | BLOCKED | `docs/push-readiness-review.md` (ispravljen ugovor) + `docs/handoffs/02-push-reconciliation.md` + `docs/reviews/02-push-reconciliation.md`. Praćeni kod usklađen sa DO (`6af69c1`, 27/27: 23 funkcionalna + 4 workerd; rekonstrukcija + 3 razlike, nije deployovana — produkcija `2ee78270...` od 27. septembra). Živa migracija redova, fizička isporuka na zatvorenoj PWA (Android dostupan, iPhone nepotvrđen) i edge `cpuTime` su NOT_TESTED. Kapije ugašene. Plan Cloudflare naloga nije verifikovan dokazom. |
| 03 | DONE | `apps/web` i `docs/handoffs/03-pwa-osnova.md`. Poslednja potvrđena Pages objava `be48495` (`https://mlsivanovic.github.io/matchahead/`, HTTP 200 provereno 30. septembra 2026; samo dostupnost). Instalabilnost, samostalni prozor, offline omotač i DEMO raspored. Prikaz na fizičkom telefonu (ikona) je NOT_TESTED. Nova objava nije potvrđena. |
| 04 | IN_PROGRESS | Jezgro, React ekran, Firebase browser adapter i tok odjave/brisanja integrisani u `main`. Nezavisni lokalni pregled `docs/reviews/04-06-integrated-client.md`: 73/73 web, 6/6 emulator + 9/9 unit, browser 52/52, PWA 11/11. Koordinator je u ovom run-u ponovio 6/6 izolacionih testova. Živa Google prijava, deploy pravila i fizički uređaji ostaju NOT_TESTED. |
| 05 | IN_PROGRESS | Run `run_6d3c53cc583e`, 1. oktobar: Grok radi server/adaptere, Muse klijent/agenda tok, Gemini nezavisni source audit i QA. Produkcioni unos i kompletna pokrivenost još nisu potvrđeni; javni rasporedi ostaju DEMO. Ugovor: `docs/phase-05-work-contract.md`. |
| 06 | IN_PROGRESS | Lična DEMO agenda integrisana u `App.tsx`/ekrane zajedno sa Auth klijentom; bounded lokalni pregled je prihvaćen. Stvarni server rasporedi i jedinstvena agenda oba kluba još se dorađuju u fazi 05. Živi izvori i fizički uređaji nisu potvrđeni. |
| 07 | TODO | ICS — planirano, nije implementirano. |
| 08 | TODO | separateCalendarOAuth — planirano, nije implementirano; odvojen korak, nije deo faze 04. |
| 09 | TODO | pushdevice — planirano, nije implementirano; čeka 04 (FID) i 02. |
| 10 | TODO | serverCron — planirano, nije implementirano; čeka 06, 08 i 09. |
| 11 | TODO | E2E — planirano, nije implementirano. |
| 12 | TODO | Pilot i predaja — nije implementirano. |

## Istorija: doc patch push korekcija (30. septembar 2026., run `run_b1cd86cb71c5`, nad `d582885`)

- Cherry-pickovano kao integracioni ulaz: `6af69c1` (DO rekonstrukcija), `ea0a993` + `8d9a048` (nezavisni pregled). Vlasništvo ovog patcha su samo docs putevi: `docs/push-readiness-review.md`, `docs/handoffs/02-push-reconciliation.md` (samo fizička uputstva), `README.md`, `docs/progress.md`, `docs/decisions.md`, `docs/orchestration-plan.md`, `docs/infrastructure-readiness.md`. Bez izmena Auth/PWA/product/test fajlova, bez push/main merge/cloud mutacija.
- Ispravljen HIGH legacy protokol u operatorskim instrukcijama: registracija `POST /api/registrations` (`x-matchahead-enroll` + `fid`) → 201 `{registrationId, selfSendKey}`; slanje `POST /api/probe/send` samo `registrationId` uz `Bearer <selfSendKey>`; odjava `DELETE /api/registrations/<id>`; UI ne ispisuje ID/ključ (Network zapis 201, Android remote debugging po potrebi). Stari `registrationSecret`-u-telu primeri više ne važe.
- In-memory drift narativ je istorijski (pre-`6af69c1`); DO konfiguracija vraćena + 27 testova (23+4) nezavisno ponovljeno; namespace/šema/migracija statički konzistentni, živa migracija/stvarni redovi NOT_TESTED. Faza 02 ostaje BLOCKED. Generator tajne: base64url 43 znaka + prag 32/16, datoteka 0600 van gita, bez secret stdout, bez literala u istoriji/URL/dokumentaciji. Kapije ostaju OFF. Worker Free plan neverifikovan; Google `billingEnabled: false` verifikovano; 0 € bez naplate.
- Faza 04 klijent + 06 integracija su ŽIVE u `matchahead-auth-client` — bez tvrdnje final pass/merged/published; finalni dokaz stiže kasnije. Ovaj zapis ostaje tačan IN_PROGRESS i signalizira preostali followup.
- Mapa orkestracije: push implementacija `task_ee1b012cc153`/`ctx_b986f3739b8e` accepted success `6af69c1`/released; push pregled `task_6cba3e57979c`/`ctx_a8550c09c7fa` izveštaj `ea0a993`+`8d9a048` isporučen, final idle, recovered/stopped/released (capability missing — nema prihvaćenog `worker_done`); core pregled `task_0aeedc8250b3`/`ctx_2e7ab1840ace` izveštaj `5be` isporučen/recovered/released; klijent pregled `task_c3570f8b1165`/`ctx_feb6c810b7c7` ACTIVE (review-only), Muse klijent direktno ACTIVE. Originalni Muse task je 3× pao readiness, ali je korisnik odobrio ručni rad (`f9f7952`, `d0f8469`, `4e80cef` izveštaj) — ne retry-ovati propali task. Ručni doc checkpointi: `b336ea5` i ovaj patch.

## Checkpoint prvog talasa (30. septembar 2026., run `run_b1cd86cb71c5`)

- Faza 04 jezgro: model, pravila, emulator pomoćnici — testirano (`check-auth.mjs` 4+5+6, `tsc` čist, bezbednosna matrica PASS uz ograničenja). Ekran, adapter, živa prijava i deploy pravila nisu urađeni. Commits: `f7f3213`, `5246e6d`, `5be2809`.
- Faza 06: logika + samostalne UI komponente nad DEMO podacima — 39/39 + 20/20 testova, DOM pregled 13/13 (2 mane + 3 zapažanja). Integracija u `App.tsx` čeka koordinatora. Commits: `f9f7952`, `d0f8469`, `4e80cef`.
- Infrastruktura/push docs: `a667913`, `66d294f`, `db5ba30`, `d2ea0ab`, `36289e9` (cherry-pickovano u ovaj snapshot). Naplata read-only proverena (`billingEnabled: false`); Firestore `eur3` multi-region; Pages `be48495` važi do nove potvrđene objave.
- Devijacije: Muse ručno uz odobrenje korisnika; Gemini `worker_done` odbijen (nedostaje sposobnost) — isporuke preuzete, radnik zaustavljen/oslobođen, ne evidentira se kao prihvaćen završetak. Finalni dokazi klijenta/push-a se čekaju od koordinatora.

## Poslednja rađena celina (faza 03, istorija)

- Rezultat: React/TypeScript/Vite PWA u `apps/web`. Četiri ekrana, manifest sa stabilnim ID-jem jednakim Pages putanji, jedan service worker za omotač i budući FCM. Javni prikaz je samo sintetički DEMO. Faza 02 ostaje BLOCKED.
- Promenjene datoteke: `apps/web/`, `scripts/check-pwa.mjs`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/03-pwa-osnova.md`, `README.md`, `.gitignore`.
- Izvršene komande i rezultati: `node scripts/check-pwa.mjs` — 15 prolaza jediničnih provera, TypeScript bez greške, produkcioni build sa bazom `/repo/`, zatim Chrome. Instalabilnost bez grešaka, samostalni `--app` prozor, offline posle jednog online učitavanja, OAuth nije u kešu, neuspeo novi omotač ne aktivira se, nova verzija čeka kraj unosa. U otvorenom Chrome-u dugme „Instaliraj” se pojavilo, a širina 360 px prošla je četiri ekrana.
- Stvarni uređaji / integracije: desktop Chrome na `127.0.0.1` (putanja `/repo/`) i verifikovana javna objava na GitHub Pages (`https://mlsivanovic.github.io/matchahead/`, HTTP 200). Android i iPhone na fizičkom uređaju su NOT_TESTED.
- Neizvršene provere: ikona na početnom ekranu fizičkog telefona, živa Firebase prijava u PWA, FCM isporuka na zatvorenoj PWA.

## Prethodna rađena celina

- Rezultat: izolovana proba push-a. Serverski tok koristi Firebase Installation ID i FCM HTTP v1. Lokalni potpis staje u 10 ms u workerd-u. Poruka nije viđena na zatvorenoj PWA, pa celina nije DONE.
- Promenjene datoteke: `docs/push-feasibility.md`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/02-proba-push-notifikacija.md`, `README.md`, `.env.example`, `.gitignore`, `experiments/push-probe/`, `scripts/check-push-probe.mjs`.
- Izvršene komande i rezultati: `node scripts/check-push-probe.mjs` — 22 prolaza, izgrađen klijent, sken bez privatnog ključa. `node scripts/check-data-contracts.mjs` — 20 prolaza. `node experiments/push-probe/scripts/measure-cpu.mjs` — hladan potpis medijana 2 ms, obnova 1 ms, razmena 42 ms čekanja. `npx wrangler check startup` u `experiments/push-probe` — snop 28,35 KiB, lokalni aktivni startup 0,0 ms na jednom uzorku.
- Stvarni uređaji / integracije: nema. Desktop Chrome na localhost proverio je stranicu, odbijenu dozvolu i test putanju. To nije FCM isporuka.
- Neizvršene provere: Android, iPhone, Cloudflare edge `cpuTime`, živi OAuth, živi FCM, živi Firestore, pravi KV.

## Prethodna završena celina

- Rezultat: mapa takmičenja za četiri kluba, matrica prava i potpunosti, tok jednog klika sa zajedničkim kešom i lokalni dokaz spajanja. Unos stvarnih utakmica ostaje blokiran ili neproveren.
- Promenjene datoteke: `docs/data-on-demand-feasibility.md`, `docs/progress.md`, `docs/decisions.md`, `docs/handoffs/01b-pronalazak-na-zahtev.md`, `docs/data-feasibility.md`, `docs/data-alternatives.md`, `README.md`, `packages/domain/src/find-fixtures.ts`, `packages/domain/src/time.ts`, `packages/domain/src/quota.ts`, `packages/domain/src/index.ts`, `packages/domain/test/find-fixtures.test.ts`, `data/synthetic/find-fixtures-scenarios.json`, `scripts/check-data-contracts.mjs`.
- Izvršene komande i rezultati: `node scripts/check-data-contracts.mjs` — 19 prolaza, 0 padova, 26. septembar 2026.
- Stvarni uređaji / integracije: nema sportskog naloga, nema workera, nema Firebase-a, nema uređaja. Stranice FSS, Fixtur.es, UEFA, ABA i Evrolige su otvorene istog dana.
- Neizvršene provere: API-Football i API-Basketball sa pravim ključem; njihov broj strana; zona budućih evroligaških satova; pisana dozvola bilo kog izvora za MatchAhead ICS.

## Odluke koje sledeći zadatak mora sačuvati

- Linkovi na docs/decisions.md: odluka 01 o identitetu, UTC vremenu i zabrani plaćenog izvora; odluka 01B o kliku, kešu, praznom skupu dozvoljenih izvora i satu 00:00/01:00/02:00.
- Odluka 01C: samo četiri izbora u dva sporta, kroz jedinstven `selectableTeams` katalog. Protivnici u rasporedu ostaju neograničeni.
- Odluka 02: push cilj je FID, ne stari registration token. Worker ne šalje iz pregledača i ne uključuje naplatu. Cron podsetnika nije uključen. Faza 02 ostaje BLOCKED.
- Odluka 03: jedan service worker, ID aplikacije jednak Pages putanji, javni raspored je DEMO dok unos nije dopušten. Nova verzija se ne učitava tokom unosa.
- Verzije SDK-a i ugovora: `@matchahead/domain` 0.1.0. Klijentski FCM SDK u probi je `firebase` 12.19.0. Polje uređaja je `fid`. PWA je React 19.3.0, Vite 7.3.6 i vite-plugin-pwa 1.3.0. Produkcija ne zove `getToken()`.

## Prepreke

- Problem push-a: Firebase projekat (`matchahead`) i Cloudflare worker postoje, ali zatvorena PWA ni na jednom fizičkom uređaju nije primila poruku.
- Dokaz: `docs/push-feasibility.md`, `docs/infrastructure-readiness.md`, `docs/push-readiness-review.md`. Android je dostupan po korisniku, iPhone nije potvrđen; oba su NOT_TESTED za fizičku isporuku.
- Šta je potrebno: FCM isporuka na PWA zatvorenoj pre slanja sa odvojenog pošiljaoca (NE Force stop, NE gašenje browsera, NE „pošalji pa zatvori”); edge `cpuTime` iz `wrangler tail`; usklađivanje repo koda sa deployovanim Durable Object radnikom pre bilo kakvog novog deploya.
- Problem podataka: nema odobrenog izvora koji je istovremeno dovoljan za objavljene utakmice ovih klubova i dopušten za unos u MatchAhead. Dozvola Fixtur.es i drugih izvora za unos u MatchAhead nije potvrđena — bez pravnih zaključaka.
- Dokaz: `docs/data-on-demand-feasibility.md` i `docs/data-feasibility.md`.
- Šta je potrebno: odluka o korišćenju izvora i dokazana pokrivenost relevantnih takmičenja. Adapteri i lokalne probe mogu da se razviju nezavisno; produkciono objavljivanje ostaje iza gates. Do tada javni rasporedi ostaju DEMO.
- Šta se radi nezavisno: faza 05 server/adapteri, korekcije klijenta i jedinstvene agende, sintetički integracioni testovi i provera stvarnih odgovora izvora. Ekran/adapter 04 i integracija 04+06 već postoje; produkciona prava i pokrivenost se ne pretpostavljaju.

## Sledeći zadatak

- Završiti i integrisati serverski Cloudflare runtime i klijentske korekcije 05, zatim predati konačni HEAD Gemini-ju za nezavisnu regresiju. Objavu i status DONE vezati za stvarne dokaze. Push faza 02 ostaje BLOCKED za fizičku isporuku; faze 07–12 su planirane.

## Istorija: istraživanje izlaska iz blokade 05 — 1. oktobar 2026.

- Predlog i izvori: `docs/phase-05-source-proposal.md`. Preporuka su adapteri po takmičenju, ligaški HTML kao glavni kandidat i klupske dopune; AI eventualno pomaže pri razvoju/parserima vesti, bez AI API zavisnosti u prvoj verziji.
- Stvarna mrežna proba: ABA `/calendar/26/1/` HTTP 200; jednokratni Python HTML parser izdvojio 36 redova za PAR/CZV kroz 18 kola. FSS, oba FK i oba KK dostupni preko HTTP-a. KK Partizanova tabela Evrolige prikazuje 2025/26; KK Zvezdin kompletan budući raspored nije izdvojen. Evroliga Game Center je u web proveri vratio 403.
- Faza 05 ostaje BLOCKED: nisu potvrđeni svi izvori, potpunost svih takmičenja, zone i načini korišćenja. HTTP pristup i ekstrakcija ABA nisu dokaz produkcione dozvole niti završene integracije. Predložena izolovana proba adaptera i pojašnjenje uslova su naredni koraci, ne već prihvaćena promena odluka 01/01B.
- Promenjena je samo dokumentacija. Nema produkcionog adaptera, unosa stvarnih utakmica u javni raspored, deploya ni slanja upita izvorima. Aplikacioni testovi nisu ponavljani jer kod nije menjan; provere paginacije, kvarova i serverskog CPU vremena tek predstoje.

## Pokrenuta implementacija 05 — 1. oktobar 2026.

- Korisnik je zatražio Grok/Muse/Gemini CLI rad, nadzor do završetka, samostalne odluke i push posle provere. Novi Run `run_6d3c53cc583e`; zasebni checkouti iz `main` na `7e09458` zbog odvojenog vlasništva servera/klijenta/review-a. Detalji su u dopuni `docs/orchestration-plan.md`.
- Početni lokalni dokazi: `node scripts/check-data-contracts.mjs` 24/24; posle `npm ci --prefix apps/web`, `npm --prefix apps/web run check` 73/73; `node scripts/check-pwa.mjs` build i sve browser/PWA provere prolaze. Prvi web pokušaj je pao zbog neinstaliranog Firebase paketa; instalacija iz lockfile-a rešila je okruženje bez izmene zavisnosti.
- Muse-ov agent-first start je završio `agent_readiness` timeout pre predaje prompta; terminal je oslobođen po recovery receipt-u. Isti Task je ponovo postavljen ready i dobio operator-launched `muse exec` sa tačnim živim dispatch preamble-om. Ovo je Orca low-level, nesupervisana procesna traka sa koordinatorskim nadzorom, ne prihvaćen agent-first start.
- Provereni živi Orca preamble-i nemaju `--dispatch-capability` iako runtime to traži za lifecycle. Gemini heartbeat je zato odbijen; radnici su obavešteni da ne izmišljaju capability i da isporuče commitove i tačan status. Završetak rada će se proveriti prema stvarnim dokazima, odvojeno od prihvaćenog lifecycle settlement-a.
- Implementacija je u toku. Produkcioni izvori, integrisane faza-05 provere i GitHub push još nisu urađeni.

## Tekući integracioni checkpoint 05 — 1. oktobar 2026.

- `9557699` je prvi klijent, prihvaćen kao kod za dalju integraciju, ne kao završen korisnički tok. Muse novi Task `task_b13ba1b5b2c8` popravlja objedinjenu agendu, dupliranje derbija, trajanje timeout-a do kraja tela odgovora, odjavu i semantičku validaciju.
- Grok Task `task_5005528994dd` razvija Cloudflare Worker/Durable Object runtime i adaptere; Node/file prototip sam ne zadovoljava ugovor. Domenske korekcije već integrišu stabilne revizije, validaciju i opoziv izvora u svim klupskim keševima.
- Izvorni audit/probe su integrisani kao `d885bcf`. Koordinator je nezavisno ponovio osam mrežnih scenarija (exit 0), uključujući zvanični PDF Evrolige sa 38 kola i očekivanu blokadu Game Centera. To nije potvrda licence, punog sezonskog parsera niti Cloudflare CPU-a.
- Koordinator: prvi klijent 91/91 web (exit 0), PWA pregled svih 11 scenarija PASS, izolacija naloga 6/6 emulator PASS. Push osnova 27/27 (23 funkcionalna + 4 workerd) potvrđena bez promene produkcije. Konačna faza-05 browser/server matrica još se čeka.
- Gemini Task `task_f5915fa787be` proverava preliminarne nalaze, a konačni integrisani HEAD dobija tek kada server i korekcije klijenta budu spremni. Nema prihvaćenog finalnog QA niti GitHub push-a.

## Checkpoint klijentske integracije — 1. oktobar, 18:14 UTC

- Muse korekcija `7fa387a` integrisana selektivno kao `6871a5e`: samo devet klijentskih datoteka, bez vraćanja starije domenske kopije. Jedna stvarna agenda spaja klupske snimke, bira konzistentnu reviziju, prikazuje derbi jednom i prekida zahtev do kraja čitanja tela.
- Koordinator nezavisno potvrđuje stvarni exit 0: web 103/103, browser rasporeda 16 PASS (390/360 px, oba kluba, derbi, filteri, offline, opoziv), PWA 11 PASS. Artefakti su `/tmp/matchahead-05-unified-client-check.log`, `...-browser.log`, `...-pwa.log`.
- Predaja nije konačna faza-05 prihvatljivost. Novi Muse Task `task_0f1237e026a1` / `ctx_56818f4c2f10` popravlja nedostajuće provere imenika učesnika, sadržaja/reda next pokazivača, pozitivnih revizija i mešovitog dozvoljenog/blokiranog izvora. Prethodni Task ima prihvaćen `worker_done`; operator-launched Muse proces dokazano je završio i terminal je ponovo korišćen za novu tačnu predaju.
- Grok server i stvarni DO adapteri još su aktivni. Gemini završni QA dobija konačni HEAD posle obe dorade; mora dodatno da propusti stvarne server odgovore kroz klijentski validator i proveri očekivane klupske brojeve redova nezavisno od parsera.
- Platformski audit `0c8bf84` je integrisan kao `41e6c4b`, uz pending workerd dokaz i bez pretpostavke produkcione dozvole. GitHub push još nije izvršen.
