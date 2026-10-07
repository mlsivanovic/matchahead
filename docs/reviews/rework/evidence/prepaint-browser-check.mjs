import puppeteer from '/home/mls/GIT/matchahead/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import {writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {for(const [name,stored,system,expected] of [['default-dark',null,'dark','dark'],['saved-light','{"theme":"light"}','dark','light'],['saved-dark','{"theme":"dark"}','light','dark'],['invalid-auto','broken','dark','dark'],['denied-auto','DENIED','dark','dark']]) {
const page=await browser.newPage();await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:system}]);
await page.evaluateOnNewDocument((stored)=>{if(stored==='DENIED'){Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError')}})}else if(stored) localStorage.setItem('matchahead.device.prefs',stored);},stored);
await page.setRequestInterception(true);page.on('request',req=>{if(req.url().includes('/src/main.tsx'))req.abort();else req.continue()});
await page.goto('http://127.0.0.1:5180/matchahead/',{waitUntil:'domcontentloaded'});
const observed=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,bg:getComputedStyle(document.documentElement).backgroundColor,colorScheme:document.documentElement.style.colorScheme,meta:document.querySelector('meta[name="theme-color"]').content,rendered:!!document.querySelector('h1')}));
const bg=expected==='dark'?'rgb(17, 19, 24)':'rgb(247, 249, 252)';const ok=observed.theme===expected&&observed.bg===bg&&observed.colorScheme===expected&&!observed.rendered;results.push({name,ok,observed});await page.close();}}
finally{await browser.close()}
writeFileSync('docs/reviews/rework/evidence/prepaint-review.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(x=>!x.ok))process.exitCode=1;
