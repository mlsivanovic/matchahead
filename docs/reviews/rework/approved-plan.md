# MatchAhead: rework izgleda i mobilnog iskustva

## 1. Cilj i dogovoreni pravac

Preurediti postojeću React PWA tako da se najvažnije radnje obavljaju bez traženja opcija kroz dugačke stranice: pregled utakmica, praćenje kluba, pronalaženje rasporeda i dodavanje u Google kalendar.

Dogovoreno: **plava i neutralne boje**, **Light / Dark / Auto**, **tri glavna taba**, jedna akcija **„Prati“** za klubove. Push obaveštenja ostaju poseban zadatak.

Pregled koda i objavljene aplikacije pokazao je ponavljanje utakmica, duplirane filtere i podešavanja, velike kartice i mnogo razvojnog teksta. Rework treba da ukloni te uzroke, uz očuvanje prijave, podataka i postojećih pravila rasporeda.

Dizajn pratiti kroz Material 3 obrasce: dostupna donja navigacija, jasna hijerarhija, umerene površine i detalji na zahtev. [Android smernice](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics), [Material sistem boja](https://material-web.dev/theming/color/).

## 2. Boje, teme i zajedničke komponente

Predložena paleta:

| Namena | Light | Dark |
|---|---|---|
| Pozadina | `#F7F9FC` | `#111318` |
| Kartice i dijalozi | `#FFFFFF` | `#1B1E25` |
| Sekundarna površina | `#EDF1F7` | `#252A34` |
| Glavni tekst | `#182230` | `#E5EAF2` |
| Sekundarni tekst | `#526174` | `#ACB8C9` |
| Plavi akcenat | `#245BC4` | `#A9C7FF` |
| Tekst na akcentu | `#FFFFFF` | `#102B59` |
| Aktivna površina | `#E1EBFF` | `#243C63` |
| Ivice | `#CBD5E1` | `#414B5B` |

- Boje povezati sa semantičkim CSS tokenima; ukloniti postojeći zeleni gradijent i fiksne zelene vrednosti. Upozorenja i greške imaju zasebne tokene za obe teme i tekstualnu oznaku.
- **Auto je podrazumevan** i prati sistemsku temu preko `prefers-color-scheme`, uključujući promenu dok je aplikacija otvorena. Ručno izabrani Light ili Dark imaju prednost.
- Izbor teme čuva se na uređaju, ostaje posle odjave i primenjuje se pre prvog prikaza Reacta, bez bljeska pogrešne pozadine. Nedostupan ili neispravan zapis daje Auto.
- Uskladiti `color-scheme`, browser `theme-color`, PWA manifest i instalacione ikone. Zadržati postojeći znak aplikacije, sa plavom pozadinom i belim znakom.
- Uvesti zajedničke komponente: zaglavlje, donju navigaciju, red utakmice, filtere, red podešavanja, status i modalni panel.
- Koristiti sistemski font, osnovni tekst 16 px, razmake u koracima od 4/8 px, diskretne ivice i minimalne senke. Ikone koristiti uz kratke oznake; ikonice bez teksta imaju pristupačna imena.
- Dodirne površine najmanje 48 × 48 CSS px; to je web cilj prilagođen Android preporuci od 48 dp. [Android pristupačnost](https://developer.android.com/develop/ui/compose/accessibility/api-defaults).

## 3. Novi ekrani i tokovi

### Utakmice — novi početni ekran

- Spojiti Početnu i Utakmice. Prikazivati jednu listu, grupisanu po danima; najbliži potvrđeni meč označiti kao „Sledeća“, bez ponavljanja u posebnoj kartici.
- Podrazumevano prikazati predstojeće utakmice. Zadržati sport „Sve / Fudbal / Košarka“ i period „Danas / 7 dana / Sve“, sa podrazumevanim periodom Sve.
- Klub, takmičenje i prikaz „Predstojeće / Promene / Arhiva“ smestiti u panel „Filteri“. Aktivni filteri imaju broj i akciju „Poništi“.
- Zaglavlje sa filterima ostaje dostupno tokom skrolovanja. Liste prikazivati po 20 utakmica, sa kontrolama stranice uz filtere; bez beskonačnog učitavanja.
- Kompaktan red sadrži timove, datum/vreme, takmičenje i relevantan status. Izvor, mesto, kolo, sezona i razlog praćenja otvaraju se u detalju.
- Nepotvrđeno vreme, odlaganje i otkazivanje ostaju vidljivi u osnovnoj listi. Ne prikazivati nepouzdano „Uživo“ niti izmišljati termin.

**Google kalendar**

- Ukloniti zasebnu ponovljenu listu za izvoz. Akcija „Izaberi“ uključuje checkbox kontrole u postojećoj listi.
- Tokom izbora, traka iznad donje navigacije prikazuje broj i dugme „Dodaj u kalendar“. „Izaberi sve“ obuhvata sve podobne rezultate aktivnih filtera, preko svih stranica.
- Promena filtera poništava izbor; promena stranice ga zadržava. Izbor se ponovo proverava prema aktuelnim podacima pre upisa.
- Pre upisa otvoriti kratak pregled sa brojem događaja i opcionom beleškom. Navesti jednokratni upis i posebno upozoriti na utakmice koje koriste 17:00 zbog nepoznate satnice.
- Iz detalja omogućiti dodavanje pojedinačne utakmice kroz isti tok. Zadržati odvojenu Google dozvolu, zaštitu od duplikata i ponovni pokušaj posle delimičnog neuspeha.

### Klubovi

- Prikazati sva četiri podržana kluba kao kratke redove, grupisane po sportu. Ukloniti pretragu i duplirane izbore sporta/kluba.
- Svaki red ima „Prati / Pratim“ i otvaranje rasporeda kluba. Praćenje ne pokreće mrežni zahtev samo od sebe.
- Na rasporedu kluba prikazati jednu primarnu akciju: „Pronađi utakmice“ bez sačuvanog rasporeda, odnosno „Osveži“ kada postoji.
- Zadržati postojeća ograničenja osvežavanja; kratko prikazati kada je novi pokušaj moguć.
- Pokriće takmičenja, izvore i vreme poslednje provere premestiti u „O rasporedu“. Problemi koji utiču na pouzdanost ostaju vidljivi iznad liste.
- Ukloniti omiljene iz interfejsa. Postojeće vrednosti sačuvati, bez pretvaranja u praćenja ili promene agende.

### Podešavanja i prijava

- Podešavanja postaju kratak indeks: **Izgled, Vremenska zona, Obaveštenja, Nalog, Instalacija i pomoć, O aplikaciji**. Svaka stavka otvara zaseban kratak prikaz.
- Izgled otvara izbor Light / Dark / Auto; isti izbor dostupan je i na ekranu prijave.
- Prikazivati jednu vremensku zonu: zonu naloga kada postoji, sa postojećim rezervnim podešavanjem uređaja.
- Obaveštenja prikazuju „Još nisu dostupna“. Ukloniti neaktivne prekidače i duplirane podsetnike; sačuvati postojeće vrednosti za buduću implementaciju.
- Nalog sadrži adresu, odjavu i jasno potvrđeno brisanje. Tehničke detalje o internim bravama zameniti objašnjenjem posledica razumljivim korisniku.
- Instalacionu pomoć prikazivati prema uređaju. Verziju i čišćenje lokalne beleške smestiti u O aplikaciji.
- Prijava sadrži naziv, jednu kratku rečenicu i dugme „Nastavi sa Google“. Ograničenje pilot pristupa prikazati jednom.
- Iz korisničkog interfejsa ukloniti faze razvoja, interne statuse, API termine i ponovljena objašnjenja. Prazna stanja imaju jednu rečenicu i jednu korisnu akciju.

## 4. Tehnička izvedba i kompatibilnost

- Zadržati React, Firebase, servis rasporeda i postojeći način objave. Backend API i Firestore šeme ne menjaju se.
- Dodati `ThemePreference = 'light' | 'dark' | 'auto'` u podešavanja uređaja i zajednički kontroler teme.
- Navigacija ima **Utakmice / Klubovi / Podešavanja**. Stare početne rute i postojeći linkovi za utakmice otvaraju objedinjeni ekran.
- Podprikaze i modalne panele povezati sa browser istorijom: Android Back prvo zatvara panel ili vraća prethodni prikaz. Povratak vraća filtere i poziciju liste.
- Na telefonu koristiti modalni panel odozdo; od širine 840 px centrirani dijalog. Panel ima ograničenu visinu, dostupnu primarnu akciju, upravljanje fokusom i zatvaranje preko Back/Escape.
- Sačuvati filtere i položaj glavnih lista tokom prelaska između tabova. Privatni izbori i beleška brišu se pri odjavi ili zameni naloga.
- Koristiti safe-area razmake i prilagodljiv viewport; donja navigacija, akcije i tastatura ne smeju prekrivati sadržaj.
- Sačuvati postojeću zaštitu od zastarelih odgovora, opozvanih izvora i promene naloga. Zahtevi za raspored ostaju pokrenuti korisničkom radnjom.
- Redosled rada: teme i komponente → navigacija → utakmice i kalendar → klubovi → podešavanja i tekst → provere i priprema izdanja.

## 5. Provere i kriterijumi prihvatanja

- Proveriti sve ekrane u obe teme, Auto promenu sistema, ponovno otvaranje, odjavu i prvo učitavanje bez bljeska.
- Testirati širine 360, 390 i 430 px, landscape i desktop; uvećan tekst, tastaturu, fokus i Android Back.
- Na širini 390 px prvi meč treba da bude vidljiv bez skrolovanja kada postoje podaci. Glavna navigacija, filteri i akcija kalendara dostupni su nezavisno od dužine liste.
- Nijedna utakmica se ne ponavlja zbog početnog pregleda ili izvoza. Proveriti liste sa 0, 1, 20 i više od 100 utakmica.
- Proveriti praćenje oba učesnika derbija, ručni izbor, uklanjanje jednog razloga praćenja, nepoznat termin, otkazivanje, blokiran izvor i offline prikaz.
- Proveriti pojedinačni i grupni izvoz, izbor preko više stranica, odbijenu dozvolu, duplikate i delimičan neuspeh; koristiti presretnute Calendar odgovore bez stvarnih upisa.
- Proveriti da stari linkovi rade, a postojeća praćenja, omiljeni i podešavanja ostaju sačuvani.
- Pokrenuti postojeće domenske, web, build i PWA provere; prilagoditi browser provere novim tokovima. Završiti ručnom proverom instalirane PWA na Android telefonu.
- Kriterijum završetka: nema horizontalnog skrola, prekrivenih kontrola, nečitljivih kontrasta, dupliranih podešavanja ili razvojnog teksta. Ciljati kontrast najmanje 4,5:1 za običan tekst.

**Pretpostavke:** aplikacija ostaje PWA na srpskoj latinici; katalog ostaje ograničen na postojeća četiri kluba. Novi sportski izvori, native Android aplikacija, push i automatska sinhronizacija Google kalendara nisu deo ovog reworka.
