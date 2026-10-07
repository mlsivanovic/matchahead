import puppeteer from '/home/mls/GIT/matchahead/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import {writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];const page=await browser.newPage();
const check=(name,ok)=>{results.push({name,ok});if(!ok)throw Error(name)};
try{
 await page.setViewport({width:390,height:844});await page.goto('http://127.0.0.1:5180/matchahead/modal-review.html');await page.waitForSelector('#open');
 const initial=await page.evaluate(()=>history.length);
 await page.click('#open');await page.waitForSelector('[role="dialog"]');
 check('StrictMode one history entry',await page.evaluate(()=>history.length)===initial+1);
 check('dialog initially focused',await page.evaluate(()=>document.activeElement?.getAttribute('role')==='dialog'));
 await page.keyboard.press('Tab');check('Tab into first control',await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'));
 await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');check('focus wraps to last action',await page.evaluate(()=>document.activeElement?.id==='apply'));
 await page.click('#nested');await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===2);
 await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===1);check('Back closes child only',true);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));check('Escape closes parent',true);
 check('focus restored',await page.evaluate(()=>document.activeElement?.id==='open'));
 await page.click('#open');await page.waitForSelector('#apply');await page.click('#apply');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));await page.waitForFunction(()=>!history.state?.matchaheadPanel);check('programmatic close consumes marker',true);
 await page.click('#open');await page.waitForSelector('#nested');await page.click('#nested');await page.waitForSelector('#dismiss-all');await page.click('#dismiss-all');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));await page.waitForFunction(()=>!history.state?.matchaheadPanel,{timeout:2000});check('nested programmatic dismissal consumes all markers',true);
 check('mobile no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const width of [360,430,1200]){await page.setViewport({width,height:844});await page.click('#open');await page.waitForSelector('[role="dialog"]');check(`layout ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));}
}catch(e){results.push({error:String(e)});process.exitCode=1}finally{writeFileSync('/home/mls/GIT/matchahead/docs/reviews/rework/evidence/modal-review.json',JSON.stringify(results,null,2));console.log(results);await browser.close();}
