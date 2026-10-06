/** Ručna mrežna provera objavljenog korisničkog toka. Bez mock odgovora i bez prijave. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const pageUrl = process.env.MATCHAHEAD_LIVE_URL ?? 'https://mlsivanovic.github.io/matchahead/';
const browser = await puppeteer.launch({executablePath:'/usr/bin/google-chrome-stable',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true});
  await page.goto(`${pageUrl}#/klubovi`,{waitUntil:'networkidle2'});
  await page.waitForSelector('section[aria-label="Raspored na zahtev"]');
  if (process.env.MATCHAHEAD_EXPECT_BUILD) {
    assert.equal(await page.$eval('[data-app-build]',el=>el.dataset.appBuild),process.env.MATCHAHEAD_EXPECT_BUILD);
  }
  async function choose(group,index) {
    await page.$$eval(`section[aria-label="Raspored na zahtev"] [role="group"][aria-label="${group}"] button`,(buttons,i)=>buttons[i].click(),index);
  }
  for (const [sportIndex,sport] of ['football','basketball'].entries()) {
    await choose('Sport',sportIndex);
    for (const [clubIndex,club] of ['partizan','crvena-zvezda'].entries()) {
      await choose('Klub',clubIndex);
      const pending = page.waitForResponse(r=>r.url().endsWith('/api/find-fixtures') && r.request().method()==='POST',{timeout:30000});
      pending.catch(() => undefined);
      await page.$$eval('section[aria-label="Raspored na zahtev"] button',buttons=>{
        const button=buttons.find(b=>b.textContent.trim()==='Pronađi utakmice');
        if(!button || button.disabled) throw Error('Pronalaženje nije dostupno');
        button.click();
      });
      const response = await pending;
      assert.equal(response.status(),200);
      const data = await response.json();
      assert.equal(data.kind,'verified-schedule');
      assert.equal(data.result.teamId,`${sport}:rs:${club}`);
      assert.ok(data.result.futureFixtures.length>0);
      await page.waitForFunction(count=>document.querySelectorAll('[data-schedule-kind="verified-schedule"] article').length===count,{},data.result.futureFixtures.length);
      const count=await page.$$eval('[data-schedule-kind="verified-schedule"] article',cards=>cards.length);
      assert.equal(count,data.result.futureFixtures.length);
      const titles=await page.$$eval('[data-schedule-kind="verified-schedule"] article h3',els=>els.map(el=>el.textContent));
      assert.equal(titles.some(title=>title.includes('Nepoznat tim')),false);
      assert.ok(await page.$('[data-schedule-kind="verified-schedule"] a[data-source-url]'));
      console.log(`PASS: ${sport}/${club}, ${count} stvarnih utakmica, vidljivi protivnici i izvor`);
    }
  }
  await page.screenshot({path:process.env.MATCHAHEAD_LIVE_SCREENSHOT ?? '/tmp/matchahead-live-schedule.png',fullPage:true});
  console.log('PASS: svi stvarni klikovi u javnoj aplikaciji, bez simulacije i bez prijave');
} finally { await browser.close(); }
