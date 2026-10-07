# Preostali zahtevi pregleda — nije odobren završetak

Koordinator, 7. oktobar, Run run_61a465d30bfe, Gemini Task task_0bf6be9ad03a.

Prihvaćeni su stvarno izvršeni međurezultati. Broj prolaznih provera sam po sebi ne dokazuje pokriće plana. Ovaj dokument objedinjuje već poslate smernice; ne proširuje specifikaciju.

1. **Calendar vlasništvo i Back.** Zadržati stvarni presretnuti POST. Pri odjavi čekati da originalni tab A prikaže kapiju pre puštanja odgovora. Obraditi odgovor već prekinutog zahteva bez unhandled rejection. Za tvrdnju da nema nastavka serije koristiti najmanje dva odabrana događaja; jedan događaj dokazuje samo njegovu obradu. Posebno pokrenuti upis, sačekati POST, izvršiti browser Back, potvrditi da confirm nestaje a detalj ostaje, pustiti odgovor i proveriti da nema potvrde starog pokušaja ili nastavka serije. Calendar odgovori ostaju isključivo presretnuti.

2. **Povratak skrola.** Na punoj listi sa aktivnim sportskim filterom i poznatom stranom skrolovati na pozitivnu poznatu poziciju. Preći stvarnom navigacijom na Klubove i nazad. Proveriti očuvan query/stranu i apsolutnu razliku scrollY do 2 px; zapisati stvarne vrednosti. Ne testirati praznu listu na scrollY=0.

3. **Tastatura/beleška.** Otvoriti detalj i njegov Calendar pregled, fokusirati i uneti belešku, smanjiti viewport na390x480. Meriti gornji aktivni panel. `ok` mora da uključuje i primary i close: min48x48, granice unutar vidljivog viewporta i `elementFromPoint` hit. `rPrimary.height >= 44` nije dokaz vidljivosti i ne sme ostati nepovezan sa rezultatom. Potvrditi fokus beleške, mogućnost skrola sadržaja, sačuvati sliku. Jasno označiti simulaciju viewporta, bez tvrdnje o fizičkoj tastaturi. Escape prvo zatvara confirm; proveriti jedan preostali detalj, zatim drugim Escape zatvoriti detalj.

4. **Dodir i skrol akcija.** Ispravljene label kontrole i35 targeta prihvatljive su za agenda scope. Proveriti i vidljive Klubovi/Podešavanja/modal/raspored primarne kontrole, sa nepraznim brojačima. Calendar traka mora biti iznad navigacije (`bar.bottom <= nav.top`) a dugme dostupno preko hit-test-a. Toolbar filter/paginacija ostaju u viewportu tokom skrolovanja.

5. **Izveštaj i pogođene regresije.** Ispraviti blanket tvrdnje u gemini-integrated.md, razdvojiti izvršeno od inspekcije i simulacije. Tačni Calendar batch retry i409/GET brojevi promenjeni su u check-schedule-ui.mjs: potrebno je stvarno izvršavanje i log za ovu verziju; bez nepotrebnog ponavljanja Auth/PWA. Physical Android ostaje NOT_TESTED. Čitati/obraditi ceo Orca inbox pre worker_done, kako nalaže live preamble.

Product fajlovi ostaju read-only za Gemini. Novi stvarni nalaz ide koordinatoru sa reprodukcijom, očekivanjem i dokazom; ispravka dobija vlasnika.
