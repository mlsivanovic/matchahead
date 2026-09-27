# 02. Dokaži push dok je PWA zatvorena

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** Stalni kontekst; zadatak 01 nije potreban za tehničku probu.

## Posao

Napravi minimalan izolovan eksperiment sa sintetičkom porukom: HTTPS PWA → dozvola → registracija uređaja → Cloudflare Worker Free → FCM → sistemsko obaveštenje dok je PWA zatvorena. Ne gradi još kompletan sistem podsetnika.

Proveri važeći FCM SDK i način registracije uređaja prema aktuelnoj dokumentaciji; ne mešaj stare token i nove installation API-je. Zabeleži izabranu verziju i format identifikatora uređaja. [FCM web](https://firebase.google.com/docs/cloud-messaging/web/get-started).

Proveri Worker runtime, Google autorizaciju i stvarnu potrošnju CPU-a za autentikaciju, Firestore pristup i slanje. Besplatni Cron Trigger trenutno ima 10 ms CPU limita po invokaciji; izmeri i hladno pokretanje i obnovu serverskog tokena, ne samo topao slučaj. Mrežno čekanje nije CPU vreme. [Limiti](https://developers.cloudflare.com/workers/platform/limits/).

Tajne ostaju u serverskom secret store-u, sa minimalnim IAM pravima i dokumentovanom rotacijom. Ne koristiti privatni ključ ili serversko slanje iz browsera. Ako se pravi test endpoint, mora biti zaštićen i ograničen; ukloniti ga iz produkcije ili zadržati samo za autorizovano slanje sebi.

Na Androidu testirati podržani browser; na iPhone-u instalaciju na Home Screen i korisnički klik za dozvolu. WebKit podržava ovaj tok od iOS/iPadOS 16.4, ali stvarnu podršku izabranog SDK-a i uređaja proveriti. [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Nedostajući telefon ili nalog prijaviti kao neizvršenu proveru. Odbijene dozvole moraju imati normalan prikaz, bez beskonačnog traženja.

## Uslov završetka

Test poruka se zaista pojavi sa zatvorenom PWA na dostupnom test uređaju; klik otvara tačnu test putanju. Za Android i iOS postoji zapis PASS/FAIL/NOT_TESTED sa uslovima. Dokazano je da serverski tok ostaje na besplatnom planu pri izmerenoj pilot potrošnji ili je jasno dokumentovana prepreka. Isporuči `docs/push-feasibility.md` i odluku o arhitekturi; bez tog dokaza ne proglašavaj push rešenim.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
