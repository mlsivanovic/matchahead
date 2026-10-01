# Orkestracioni plan i mapa razvoja (Orchestration Plan)

## Novi Run za fazu 05 — 1. oktobar 2026.

`run_6d3c53cc583e`, koordinator `term_c4f77e01-fdd4-4811-8dc7-0eae8dff2781`.
Korisnik je ovlastio tri navedena agenta, samostalne koordinatorske odluke,
nadzor, integraciju i GitHub push posle uspešne provere. Ugovor i kriterijumi:
`docs/phase-05-work-contract.md`. Sledeće sekcije o prvom talasu su istorija.

| Vlasnik | Task / aktivni Dispatch | Checkout | Stanje |
|---|---|---|---|
| Grok | `task_5005528994dd` / `ctx_4afd0410a698` | `matchahead-05-server` | Stvarni rad potvrđen transcript-om; server, domenski ugovor i izvori. |
| Muse | `task_b13ba1b5b2c8` / `ctx_9c68975dab53` | `matchahead-05-client` | Novi zadatak za jedinstvenu agendu, derbi i deadline celog odgovora; operator-launched `muse exec` u istoj nesupervisanoj procesnoj traci. |
| Gemini CLI | `task_f5915fa787be` / `ctx_f0564837be01` | `matchahead-05-review` | Novi nezavisni QA zadatak: korekcije audita i pregled koda; finalni pregled čeka integrisani HEAD. |

Sva tri checkout-a su zasebni child worktree-i iz `main` na `7e09458`;
koordinator menja globalne docs/CI i integriše commitove. Agentovi izvori,
proizvod i pregled se ne uređuju iz drugih checkouta. Push/deploy ne rade radnici.

Runtime odstupanje: `dispatch-show --preamble` za aktivne pokušaje ne sadrži
`--dispatch-capability`, a validator ga zahteva. Gemini heartbeat pokušaji
su odbijeni. Radnici ne smeju da rekonstruišu capability; isporuke i kasniji
lifecycle recovery biće zabeleženi prema stvarnom stanju, bez lažnog success-a.

Prvi Gemini zadatak `task_804dbb018b0e` / `ctx_a7b5497562f3` isporučio je
audit/probe zaključno sa `fbde696`, ali `worker_done` je odbijen. Posle dokazanog
finalnog odgovora i idle stanja koordinator je izričito izvršio `worker-stop`
(zatvoren samo njegov agent terminal), pa `worker-release`. Ovo je oporavljena
isporuka, bez prihvaćenog lifecycle uspeha. Audit još nije integrisan: preostala
nepotvrđena zakonska tvrdnja i preciznost proba vraćene su novom QA zadatku.

Zajednički HTTP ugovor `0a9ad3f` integrisan je kao `076c5fc`; 28/28 domenskih
provera i 73/73 postojećih web provera prolaze i na Node 22. `checkedAt` je
nullable prema odluci 05A. Pages workflow proverava domen i web pre builda;
javni URL schedule servera dolazi iz repository variable, bez sportskih tajni.

Prvi Muse zadatak `task_d335ec2e38f2` / `ctx_9f999b596daf` ima prihvaćen
`worker_done` za `ab54b0e` (integrisan kao `9557699`). Funkcionalna prihvatljivost
nije potvrđena: završni pregled našao je izdvojenu agendu bez glavnih filtera/
sledeće utakmice, moguće dupliranje derbija i deadline koji prestaje pre tela
odgovora. Novi Task nastavlja ove konkretne popravke. Isti operator terminal
ima novog vlasnika rada; nema retroaktivne tvrdnje o supervisanom resursu.

Koordinator je izričito prekinuo samo četiri proverena test-child procesa prvog
Muse rada, zaglavljena u mock fetch-u bez AbortSignal obrade. Identitet je
proveren preko PID-a, skripte, tačnog cwd-a i Muse pretka; agent nije prekinut.
Mock je potom ispravljen i koordinator je nezavisno potvrdio 91/91 exit 0.
Ovo ne rešava nalaz o stvarnom sporom telu odgovora; on pripada novom Tasku.

Audit/probe milestone `3f691a9` integrisan je kao squash `d885bcf`, sa ispravljenim
pravnim opsegom i jasnim granicama dokaza. Nezavisna koordinatorska živa proba:
8/8 očekivanih ponašanja PASS, exit 0. To uključuje Game Center 429, zastareli
KK Partizan i TheSportsDB truncation; ne znači osam proizvodnih izvora.
PWA pregled nad prvim klijentom PASS, lokalna account isolation regresija
6/6 PASS u zasebnim emulatorima (čisto ugašeni). Završni server/klijent/QA i
GitHub push još nisu završeni.

Početni koordinatorski lokalni dokazi: domenski 24/24, web 73/73 i PWA build/
browser checker PASS. Nema novih dokaza produkcionog source prava/potpunosti,
izvedenog phase-05 adaptera, nove cloud objave ili GitHub push-a u ovom checkpointu.

Datum: 30. septembar 2026.  
Orkestracioni run: `run_b1cd86cb71c5` (status: normalan, final+idle; bez lifecycle komandi, bez push/deploy akcija)  
Koordinator: `term_c83e83d8-4eef-4b6c-8602-fe2195768cce`  
Učesnici: Grok (04 Auth/Firestore jezgro), Muse (04 klijent ekran + 06 Agenda), Gemini CLI (infrastruktura i revizije)

> Checkpoint karakter: IN_PROGRESS. Koordinator još nije poslao finalne dokaze klijenta (Muse `matchahead-auth-client`), push probne isporuke (Grok `matchahead-readiness`) ni završne preglede. Ništa od toga se ovde ne izmišlja — čeka se dopunska korekcija kada rezultati stignu.

---

## 1. Prvi talas — zadaci, ishodi i commiti (First Wave, završen krug)

Talas pokrenut 30. septembra 2026. radi paralelnog rešavanja nezavisnih osnova aplikacije:

| Agent / Zaduženje | Radno stablo (Worktree) / Zadatak | Delokrug i ciljevi | Ishod i commiti |
|---|---|---|---|
| **Grok** | `matchahead-04-auth` | **Faza 04 jezgro: model naloga, Firestore pravila, emulator pomoćnici (bez React ekrana).** | Jezgro isporučeno i commitovano: `f7f3213` (schema+pravila checkpoint), `5246e6d` (brava u `accountTombstones/{uid}`), `5be2809` (bezbednosni pregled arhitekture). Status faze: **IN_PROGRESS** — ekran prijave/odjave/podešavanja/brisanja nije urađen; živa Google prijava NOT_TESTED; pravila nisu deployovana. Predaja: `docs/handoffs/04-prijava-i-podesavanja.md`. |
| **Muse (ručno, uz odobrenje korisnika)** | `matchahead-06-agenda` | **Faza 06: agenda logika + samostalne UI komponente nad DEMO podacima.** | Isporučeno i commitovano: `f9f7952` (osnova: unija, razlozi, grupe, next, bezbedan status), `d0f8469` (samostalne `PersonalAgendaHome`/`PersonalAgendaScreen`, pomoćnici, testovi), `4e80cef` (DOM verifikacioni izveštaj). Finalni pregled `docs/reviews/06-agenda-ui.md`: 13/13 browser scenarija prolazi; 2 manje mane i 3 zapažanja evidentirani. Status faze: **IN_PROGRESS** — integracija u `App.tsx`/`screens.tsx` namerno ostavljena koordinatoru; živi Auth i uređaji NOT_TESTED. |
| **Muse (ručno, uz odobrenje korisnika)** | `matchahead-auth-client` (živo stablo, samo proizvod) | **Faza 04 klijent: browser adapter i ekran na Grok jezgru.** | U radu u živom stablu (ne dirati iz drugih checkouta). Finalni dokaz koordinator još nije poslao — ovaj checkpoint ga ne izmišlja. |
| **Gemini CLI** | `matchahead-readiness` (`task_349b47cb2a62`) | **Infrastrukturna revizija + push readiness revizija (docs).** | Dokazi isporučeni i commitovani kao docs: `a667913` (infrastruktura), `66d294f` (orkestracioni plan), `db5ba30` (korekcije), `d2ea0ab` (push revizija), `36289e9` (korekcije push revizije). `worker_done` je odbijen jer izvođač nema traženu sposobnost — to NIJE prihvaćeno završavanje. Koordinator je oporavio proverene isporuke, zaustavio/oslobodio radnika i stablo ostavio settlovano. Grok in-progress push fajlovi iz živog stabla se ne preuzimaju dok koordinator ne pošalje finalni commit. |

### Runtime devijacije (zabeleženo pošteno)
- Muse je radio ručno u direktnom terminalu nakon što je korisnik odobrio zaobilaženje readiness grešaka — nije tihi agent-run, već odobreni ručni rad.
- Gemini `worker_done` je odbijen (nedostaje sposobnost); isporučene i proverene docs-commite koordinator je preuzeo, radnika zaustavio/oslobodio. Ne evidentira se kao prihvaćeno završavanje zadatka.
- Ovaj (Muse docs) checkout `matchahead-04-auth` je settlovan na jezgru/p pregledu `5be2809`, zatim cherry-pick `6af69c1`/`ea0a993`/`8d9a048` kao integracioni ulaz i doc checkpoint `b336ea5`; samo durable docs se ovde uređuju. Ovaj doc patch je novi commit samo na vlasničkim docs putevima.

## 1A. Drugi talas — push usklađivanje i pregledi (novi taskovi, run `run_b1cd86cb71c5`)

Stanje radnika provereno `worker-list` (30. septembar 2026.):

| Zadatak / Kontekst | Ishod |
|---|---|
| Push implementacija `task_ee1b012cc153` / `ctx_b986f3739b8e` | **Accepted success `6af69c1`** (DO rekonstrukcija + 3 razlike, 27 testova), terminal released. |
| Push pregled `task_6cba3e57979c` / `ctx_a8550c09c7fa` | Izveštaj `ea0a993`+`8d9a048` isporučen, final idle; recovered/stopped/released jer izvođač nema traženu sposobnost — **nema prihvaćenog `worker_done`**, ne evidentira se kao prihvaćeno završavanje. |
| Core pregled `task_0aeedc8250b3` / `ctx_2e7ab1840ace` | Izveštaj `5be2809` isporučen, recovered/released. |
| Klijent pregled `task_c3570f8b1165` / `ctx_feb6c810b7c7` | **ACTIVE, review-only**; Muse klijent direktno ACTIVE u `matchahead-auth-client` (faza 04 klijent + 06 integracija žive). Finalni dokaz se čeka — bez tvrdnje final pass/merged/published. |
| Originalni Muse task `task_2192e0e9d10c` | **3× pao readiness**; korisnik je odobrio ručni rad (`f9f7952`, `d0f8469`, `4e80cef` izveštaj) — **ne retry-ovati propali task**. |
| Ručni doc checkpointi | `b336ea5` (prvi talas IN_PROGRESS) i ovaj doc patch (push korekcije, samo vlasnički docs putevi). |

Ako finalni dokaz klijenta stigne pre kraja, ugrađuje se stvarni podatak; inače zapis ostaje tačan IN_PROGRESS i signalizira preostali followup.

---

## Istorija prvog talasa: Integracija i nezavisna provera (Next Wave)

Nakon završetka rada Groka i Muse-a:
1. **Spajanje i integracija:**
   - Usklađivanje Grokovog modela korisnika sa Muse-ovom funkcijom agende (ulazi: `followedTeamIds: readonly string[]`, `manualFixtureIds: readonly string[]`).
   - Povezivanje ekrana „Moje utakmice” i „Podešavanja” unutar PWA shell-a (`apps/web`).
2. **Nezavisna bezbednosna i PWA revizija:**
   - Provera Firestore pravila: onemogućeno curenje privatnih podataka, sprečena zloupotreba kvota, validirana polja profila i kataloga timova (`selectableTeams`).
   - Provera PWA invarijanti: jedan registrovani service worker (bez paralelnih registracija), offline omotač ne kešira privatne Google/Firestore odgovore, manifest ID ostaje stabilan.

---

## Istorija prvog talasa: tadašnji roadmap

| Faza | Naziv | Tehnički status i preduslovi | Može se raditi na DEMO / emulatorima? | Zahteva žive resurse / fizički uređaj? |
|---|---|---|---|---|
| **04** | Google prijava i podešavanja | U toku (Grok) | **DA** (Firebase Auth & Firestore emulatori) | Za live: deploy pravila i provera Google Sign-In na `github.io` |
| **06** | Moje utakmice (Agenda) | U toku (Muse) | **DA** (čista TypeScript logika, DEMO raspored) | Ne |
| **Integracija** | Povezivanje 04 + 06 u PWA | Planirano nakon prvog talasa | **DA** (Vite build, lokalni testovi) | Ne |
| **05** | Pronalazak na zahtev (data05) | **IZRIČITO BLOKIRANO** — odobren izvor nedostaje; javni rasporedi ostaju DEMO | Samo mock/sintetički adapteri | Za live: odobren izvor sa pokrivenošću i pravom unosa |
| **07** | ICS (automatski kalendar) | Planirano, nije implementirano | **DA** (generisanje standardnog RFC 5545 ICS fajla iz agende) | Za live distribuciju: javni HTTPS hosting bezbedan od curenja ličnih podataka |
| **08** | separateCalendarOAuth (ručni Google upis, odvojen OAuth korak) | Planirano, nije implementirano; nije deo faze 04 | Delimično (mock OAuth tokena i Calendar API tela) | Za live: Google Calendar OAuth saglasnost i nalog sa pravima upisa |
| **09** | pushdevice (push na uređaju) | Planirano, nije implementirano; čeka fazu 04 (FID) i 02 | Delimično (lokalni workerd potpis prolazi) | **DA** (dostupni Android prvi kandidat, iPhone nepotvrđen, VAPID ključ, zatvorena PWA pre slanja) |
| **10** | serverCron (zakazivanje podsetnika) | Planirano, nije implementirano; čeka faze 06, 08 i 09 | **DA** (logika izračunavanja termina 15/30/60 min, mock crona) | Za live: Cloudflare Workers Cron Trigger i dokumentovana CPU granica (10 ms; plan naloga nije verifikovan) |
| **11** | E2E (provera celog toka) | Planirano, nije implementirano; čeka sve prethodne celine | Delimično | **DA** (krajnji E2E test na mobilnom uređaju) |
| **12** | Pilot i predaja | Završna faza, nije implementirano | Ne | **DA** (stvarni korisnici na telefonima tokom takmičarskih kola) |

---

## Istorija prvog talasa: Šta je izvodljivo u DEMO/emulator režimu vs. Stvarni svet

### A. Potpuno izvodljivo na sintetičkim podacima i emulatorima (0 € budžet)
- Razvoj i testiranje Firestore šeme i pravila (kroz `firebase emulators:exec`).
- Logika deduplikacije utakmica, vremenskih zona, DST pomeranja i statusa odloženih mečeva.
- Korisnički interfejs: navigacija, izbor klubova iz fiksnog kataloga, prikaz bedževa i statusa.
- Service Worker keširanje statičkih resursa i rukovanje ažuriranjima.
- Generisanje ICS tekstualnog formata.

### B. Zahteva stvarne spoljne servise ili fizičke uređaje
- **Stvarni sportski podaci:** Postojeće revizije navode da nema potvrđene dozvole za besplatne API-je. Aplikacija se mora osloniti na DEMO raspored dok se ne potvrdi izvor sa dozvolom.
- **Google Sign-In u produkciji:** Zahteva raspoređivanje konfiguracije i test na javnom domenu (`https://mlsivanovic.github.io/matchahead/`).
- **PWA Push na zatvorenoj aplikaciji:** Prijem obaveštenja na PWA zatvorenoj pre slanja sa odvojenog pošiljaoca (NE Force stop, NE gašenje browsera, NE „pošalji pa zatvori”) mora se empirijski dokazati na fizičkom uređaju. Android je dostupan po korisniku; iPhone nije potvrđen; nijedan fizički push test nije izvršen.

## Checkpoint nadzora faze 05 — 1. oktobar, 18:00 UTC

- Koordinator je ponovio domensku proveru integrisanog `main`: 34/34 PASS. Prvi klijent: 91/91 web PASS i 11 PWA scenarija PASS. To nije finalni dokaz klijentske dorade niti servera.
- Muse radi novi Task `task_b13ba1b5b2c8` / `ctx_9c68975dab53`, nakon prihvaćenog prvog commita. Obavezne dorade su jedna agenda/derbi, rok do kraja tela odgovora, abort/odjava, semantička validacija i opoziv izvora u svim lokalnim snimcima. Grok Task ostaje aktivan; Gemini završni QA čeka konačni HEAD.
- Koordinator je dodatno rutirao: očuvanje prethodnog datuma pri date-only pomeranju, stabilan ID nezavisan od kola, tačan očekivani broj kola/klupskih redova, odbijanje skraćenog odgovora, ograničavanje sporog tela i sertifikatskog zahteva koji bi blokirali DO red.
- Nova primarna platform dokumentacija razlikuje 30 s CPU u DO od 10 ms običnog Free ingress Worker-a. Odluka 05B uklanja preuranjenu tehničku zabranu parsera; stvarni workerd i edge dokazi se i dalje traže.
- Audit korekcija `88a4683` integrisana kao `ebb72ab`: CZV lokalni sat nije UTC, hero sat je uočeni konflikt, kolo nije deo kanonskog ID-ja, uklonjena nepodržana sudska tvrdnja.
- Konačni QA, servis deploy i GitHub push nisu urađeni. Stare roadmap tabele u ovom dokumentu su istorija prvog talasa; aktuelno stanje je `docs/progress.md`.

## Aktivna završna dorada klijenta

Prvi korektivni Task `task_b13ba1b5b2c8` / `ctx_9c68975dab53` prihvaćen je sa `7fa387a`; koordinator je preuzеo samo vlasničke klijentske datoteke kao `6871a5e`, sačuvao noviji domen i nezavisno ponovio 103 web / 16 browser / 11 PWA prolaza. `7fa387a` je uključio lokalno donete domenske promene uprkos vlasništvu, pa njegov kompletan cherry-pick nije urađen.

Dalji vlasnik popravke validatora je Muse novi Task `task_0f1237e026a1` / Dispatch `ctx_56818f4c2f10` u istom worktree-u i terminalu, nakon dokazanog izlaska prethodnog `muse exec`. Proces je opet operator-launched sa tačnim preamble-om, nesupervisan; cleanup procesa ostaje obaveza koordinatora. Popravke: imenici učesnika, next sadržaj/red, pozitivne revizije, dozvoljeni delimični odgovor uz nepovezani blokirani izvor. Grok i Gemini Task-ovi ostaju aktivni, finalni HEAD još nije izdat.
