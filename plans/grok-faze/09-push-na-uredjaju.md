# 09. Push dozvole, uređaji i otvaranje utakmice

## Prompt za Grok

Pročitaj `00-stalni-kontekst.md`, `docs/progress.md` ako postoji i ovaj zadatak. Izvedi samo ovu celinu. Glavni plan koristi kao referencu za relevantne detalje, ne kao nalog da napraviš sve odjednom.

**Preduslovi:** 02, 03, 04 i 06.

## Posao

Integrisati provereni FCM prijem sa PWA service worker-om. Dozvolu tražiti tek nakon korisnikovog klika „Uključi obaveštenja” i kratkog objašnjenja. Obraditi unsupported, default, denied i granted stanja.

Registracije uređaja su privatne i vezane za uid i konkretnu instalaciju. Izabrani podržani FCM način registracije držati iza adaptera; ne tvrditi da je FID isto što i tajni OAuth token. Pratiti promenu registracije, odjavu, opoziv dozvole i uklanjanje uređaja.

Na zajedničkom uređaju prelazak na drugi nalog mora deaktivirati vezu sa prethodnim; ne slati prethodnikove privatne informacije. Ne logovati identifikatore uređaja javno.

Implementirati prijem dok je aplikacija otvorena i zatvorena bez duplog prikazivanja iste poruke. Klik fokusira postojeći prozor ili otvara tačan detalj utakmice sa Pages base putanjom. Ako je potrebna prijava, zapamti bezbedan interni nastavak. Notifikacioni URL sme biti samo dozvoljena interna putanja.

Dodati „Pošalji probno obaveštenje” kroz autorizovan i ograničen serverski tok sebi. To dokazuje prijem; ne dokazuje da je zakazivanje podsetnika završeno. Omogućiti izbor tipova i 15/30/60 minuta unapred, kao i isključivanje po uređaju.

## Uslov završetka

Stvarni uređaj prima test push sa zatvorenom PWA; klik vodi na utakmicu. Nema dva prikaza u foreground-u. Odbijena dozvola ne ruši aplikaciju. Odjava i promena naloga uklanjaju staru vezu uređaja. Android/iOS statusi testiranja su eksplicitni, bez lažnog PASS-a za nedostupne uređaje.

## Predaja

Navedi izmenjene datoteke, konkretno demonstrirano ponašanje, komande i rezultate testova, neizvršene provere i preostale prepreke. Ažuriraj `docs/progress.md`. Ne označavaj ovu celinu DONE ako kriterijumi nisu ispunjeni.
