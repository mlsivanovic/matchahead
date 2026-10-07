# F13: novi Calendar pregled ne prikazuje prethodni rezultat

Target/ownership: Grok sme da menja samo apps/web/src/ui/PersonalAgenda.tsx. Gemini aktivno poseduje browser skripte, izveštaj i emulator runtime; ne dirati njih niti druge product fajlove. Koordinator poseduje vizuelne fajlove i integraciju.

Reprodukcija iz koda: uspešan pojedinačni runExport zadržava calendar.message (`Dodato: 1...`) u hook-u. Sledeći openSingle/openBatch postavlja novi confirm, a njegov JSX bezuslovno prikazuje calendar.message. Zato novi pregled prikazuje prethodni uspeh pre novog pokušaja. F12 fixture/account singleNotice ne rešava ovaj zaseban prikaz u confirm-u.

Change: status u novom Calendar pregledu mora pripadati pokušaju iz tog pregleda. Pri otvaranju novog single/batch pregleda ne prikazivati stari status; tek nakon pokretanja njegovog runExport prikazati trenutni status i sačuvati poruku/neupisane ID-jeve za retry. Možeš u PersonalAgenda pratiti da li trenutni confirm ima započet pokušaj; rešiti minimalno bez promene hook-a. Dismiss/account-change/tab-dismiss resetuju taj UI marker. Sačuvati F12 status u detalju odgovarajuće utakmice nakon uspeha.

Constraints: ne menjati authorizeCalendar, eksport eligibility, IDs, unknown17h, serial stop/retry, abort/UID/epoch/stillOwned guard, backend/Firestore niti podatke. Ne menjati CalendarExport.tsx. Ne dodavati demo/test hook u proizvod. Bez Auth/emulator/browser procesa zbog Gemini vlasništva. Bez stage/commit/push.

Dependencies: F12 task_f8a94fe20028 prihvaćen i terminal oslobođen; samo PersonalAgenda product edit nije u sukobu sa Gemini read-only auditom. Koordinator osvežava production build posle prihvatanja. Gemini naknadno proverava uspešan single→novi pregled bez stale statusa.

Acceptance: pregled koji nije pokrenuo upis nema prethodnu Calendar poruku; tok tokom rada i nakon delimičnog neuspeha i dalje prikazuje svoj status i retry; novi pokušaj ima sve postojeće async guardove. Typecheck i svih152 web testova prolaze; prijaviti stvarne komande/exit code i diff. Browser dokaz ostaje pending Gemini. Pročitati/obraditi Orca inbox pre validnog worker_done sa aktivnim preamble credentialom, pa idle.
