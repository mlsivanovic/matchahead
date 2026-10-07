import puppeteer from '/home/mls/GIT/matchahead/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import {writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.setViewport({width:390,height:844});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await page.goto('http://127.0.0.1:5180/matchahead/');await page.waitForSelector('.theme-picker');
 results.push({name:'default Auto light',ok:await page.evaluate(()=>document.documentElement.dataset.theme==='light'&&document.querySelector('.theme-picker button[aria-pressed="true"]')?.textContent==='Auto')});
 await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');results.push({name:'Auto live system dark',ok:true});
 await page.screenshot({path:'/home/mls/GIT/matchahead/docs/reviews/rework/evidence/login-dark-390.png'});
 await page.evaluate(()=>[...document.querySelectorAll('.theme-picker button')].find(x=>x.textContent==='Light').click());
 results.push({name:'manual Light overrides dark',ok:await page.evaluate(()=>document.documentElement.dataset.theme==='light')});
 await page.screenshot({path:'/home/mls/GIT/matchahead/docs/reviews/rework/evidence/login-light-390.png'});
 await page.reload();await page.waitForSelector('.theme-picker');results.push({name:'Light persists reload',ok:await page.evaluate(()=>document.documentElement.dataset.theme==='light')});
 await page.evaluate(()=>{const raw=JSON.parse(localStorage.getItem('matchahead.device.prefs'));raw.theme='auto';localStorage.setItem('matchahead.device.prefs',JSON.stringify(raw));});await page.reload();await page.waitForSelector('.theme-picker');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test denied','QuotaExceededError')}});
 await page.evaluate(()=>[...document.querySelectorAll('.theme-picker button')].find(x=>x.textContent==='Dark').click());
 await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await new Promise(r=>setTimeout(r,150));
 results.push({name:'manual Dark stays on denied persistence + system change',ok:await page.evaluate(()=>document.documentElement.dataset.theme==='dark')});
 results.push({name:'no horizontal scroll login 390',ok:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)});results.push({name:'page errors',errors,ok:errors.length===0});
}finally{console.log(results);writeFileSync('/home/mls/GIT/matchahead/docs/reviews/rework/evidence/theme-review.json',JSON.stringify(results,null,2));await browser.close()}
