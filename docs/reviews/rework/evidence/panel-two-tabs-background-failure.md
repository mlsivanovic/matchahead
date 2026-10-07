# Dva taba — izolacija browser timeouta

Koordinator je 7. oktobra izvršio komponentni fixture scenario bez Firebase/Calendar poziva. Chromium/Puppeteer protocolTimeout 15000; kreirane dve stranice, zatim page.click na prvoj dok je druga bila u prvom planu.

Stvarni neuspeh: `ProtocolError: Runtime.callFunctionOn timed out.` Stack uključuje `CdpElementHandle.evaluate`. Provera nije prihvaćena kao prolazak niti je timeout produžen.

Uz `bringToFront()` pre interakcije i pre zatvaranja panela, isti scenario prolazi 5/5 ciklusa; `panel-two-tabs-review.json` i `panel-two-tabs-check.mjs`. Ovo izoluje testnu interakciju/renderovanje taba, bez tvrdnje o Auth propagaciji odjave. Privremeni component-review app fajlovi potom uklonjeni.
