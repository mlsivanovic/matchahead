# Predaja zadatka 03 — instalabilna PWA i navigacija

Datum: 27. septembar 2026.
Status: DONE

## Ostvaren rezultat

PWA osnova je u `apps/web`. Četiri ekrana su Početna, Moje utakmice, Klubovi i Podešavanja. Navigacija je na dnu, stavke su visoke najmanje 48 px. Izbor kluba dolazi samo iz `selectableTeams`. DEMO raspored prikazuje protivnike van tog kataloga, uključujući gostovanje i utakmicu bez određenog protivnika.

Manifest ima stabilan `id` jednak bazi. Podrazumevana produkciona baza je `/matchahead/`. Provera je služila aplikaciju samo na `/repo/`, ne u korenu domena. Hash rute preživljavaju osvežavanje. Adresa `/repo/klubovi` prelazi na `#/klubovi`.

Jedan service worker pokriva offline omotač i ostavlja mesto za budući FCM. Plugin ga ne registruje sam. U izlazu nema drugog worker fajla. Google i OAuth odgovori se ne keširaju. Javni fajl je označen kao zastareo sintetički DEMO. Offline tekst kaže da prikaz ne donosi sveže termine.

Nova verzija čeka dugme. Dok beleška nije prazna, stranica se ne učitava ponovo. Neuspeo novi omotač se ne aktivira, pa stari keš ostaje.

Faza 02 nije završena. Nema dopuštenog izvora stvarnih utakmica. Naplata nije uključena. Git nije inicijalizovan i sajt nije objavljen.

## Izmenjene datoteke

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/public/data/demo-schedule.json`
- `apps/web/public/icons/icon-192.png`
- `apps/web/public/icons/icon-512.png`
- `apps/web/public/icons/icon-maskable-512.png`
- `apps/web/scripts/write-icons.mjs`
- `apps/web/scripts/write-demo-schedule.ts`
- `apps/web/scripts/check-pwa.mjs`
- `apps/web/src/` — ekrani, logika rasporeda, registracija workera i `src/sw.ts`
- `apps/web/test/`
- `scripts/check-pwa.mjs`
- `docs/progress.md`
- `docs/decisions.md`
- `docs/handoffs/03-pwa-osnova.md`
- `README.md`
- `.gitignore`

`apps/web/node_modules/` i izlaz builda nisu deo predaje. Tajne nisu dodate.

## Izvršene provere i dokazi

`node scripts/check-pwa.mjs`, 27. septembar 2026.

Jedinične provere: 15 testova, 15 prolaza, 0 padova. TypeScript `tsc --noEmit` bez greške.

Vite 7.3.6 i vite-plugin-pwa 1.3.0. Dva produkciona builda, baza `/repo/`, oznake `build-a` i `build-b`. React 19.3.0, TypeScript 5.9.3, workbox-precaching 7.4.1. Precache ima 13 zapisa, oko 266 KiB.

Chrome preko puppeteer-core 24.43.1 i `/usr/bin/google-chrome-stable`, headless, na `127.0.0.1` i putanji `/repo/`:

- koren domena i `/sw.js` vraćaju 404
- četiri ekrana, tastatura, pretraga „zvezda” i odbijanje upita „DEMO”
- širina 360 px i 1280 px bez horizontalnog preliva
- praćenje kluba, beleška, brisanje sesije; zona uređaja ostaje
- osvežavanje `#/podesavanja` i skretanje `/repo/klubovi`
- `Page.getInstallabilityErrors` prazan
- Chrome `--app` javlja `display-mode: standalone` i ekran to prikazuje
- iPhone user agent ističe uputstvo „Dodaj na početni ekran”
- posle jednog online učitavanja, ugašena mreža i dalje daje omotač i DEMO raspored, sa oznakom zastarelosti i rečenicom da prikaz ne donosi sveže termine
- zahtev ka `/repo/oauth/token` nije ostao ni u jednom kešu
- novi omotač čiji JavaScript dobije HTTP 500 ne aktivira se; prikaz ostaje `build-a` i DEMO tekst ostaje
- kad je novi omotač ispravan, traka „Nova verzija je spremna” ne učitava stranicu dok beleška traje; posle pražnjenja beleške prikaz postaje `build-b`, i dalje sa jednom registracijom

Otvoreni Chrome na `http://127.0.0.1:4174/repo/`, širina 360 px: početna prikazuje FK Crvenu zvezdu protiv DEMO Rival Severa, sate u Beogradu i zastareo zapis od 20. septembra 2026. u 10:00. Košarka nudi samo KK Crvenu zvezdu i KK Partizan. Praćenje KK Crvene zvezde puni Moje utakmice, uključujući protivnika koji nije u katalogu i utakmicu bez protivnika. Podešavanja nude dugme „Instaliraj”, drže podsetnik na 30 minuta bez slanja i pišu da je faza 02 BLOCKED. Brisanje sesije prazni Moje utakmice i ostavlja zonu Europe/Belgrade.

## Kriterijumi koji nisu ispunjeni

Ikona na početnom ekranu Android telefona ili iPhone-a nije pritisnuta. To je NOT_TESTED. Aplikacija nije objavljena na GitHub Pages, pa živi `github.io` nije otvoren. Samostalni prozor jeste otvoren lokalno kroz Chrome `--app`, a u običnom prozoru Chrome je ponudio instalaciju.

Push na zatvorenoj PWA i dalje nije isporučen. To nije kriterijum ove faze i faza 02 ostaje BLOCKED.

## Odluke i ugovori koje sledeći task mora sačuvati

- Odluke 01, 01B i 01C: identitet, prazan skup dozvoljenih izvora, satovi 00:00/01:00/02:00 i samo četiri kluba u `selectableTeams`. Protivnik nije ograničen.
- Odluka 02: cilj push-a je `fid`, ne registration token. Ne zovu se `getToken()` ni drugi service worker. Faza 02 nije DONE.
- Odluka 03: jedan worker, ID jednak bazi, DEMO raspored sa zabranom unosa, odjava briše samo sesiju i taj uid.
- Nema naplate. Nema faze 04 ili 05 u ovom kodu osim praznih mesta u tekstu podešavanja.

## Potrebni pristupi i ručni koraci

Nema novih tajni. Produkciona baza za budući Pages je `/matchahead/`, osim ako se repozitorijum zove drugačije. Tada se menja `MATCHAHEAD_BASE`, a `id` manifesta prati tu putanju.

Lokalno: `node scripts/check-pwa.mjs` iz korena. Razvoj: `npm run dev` u `apps/web`.

## Sledeći task

04 — Google prijava i podešavanja. Prvi korak je pročitati `plans/grok-faze/04-prijava-i-podesavanja.md`, `docs/progress.md`, `docs/decisions.md` i ovu predaju. Prijava mora da koristi postojeći worker i da odjava i dalje briše lokalni sadržaj tog uid-a. Ovaj dokument je ne pokreće.

Faza 02 i dalje čeka Firebase projekat, Cloudflare nalog, HTTPS i telefone. Faza 05 i dalje čeka dopušten izvor.
