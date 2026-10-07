import puppeteer from '/home/mls/GIT/matchahead/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import {writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,protocolTimeout:15000,args:['--no-sandbox']});
const steps=[];
try{
 const a=await browser.newPage(),b=await browser.newPage();
 for(const p of [a,b]){
  await p.bringToFront();
  p.setDefaultTimeout(5000);
  await p.goto('http://127.0.0.1:5180/matchahead/component-review.html',{waitUntil:'networkidle0'});
  await p.click('nav a[href="#settings"]');
 }
 async function open(p,label){await p.bringToFront();await p.evaluate(label=>[...document.querySelectorAll('.settings-row')].find(x=>x.textContent.includes(label)).click(),label);await p.waitForSelector('[data-modal-panel]');}
 async function close(p){await p.bringToFront();await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('[data-modal-panel]'));}
 await open(a,'Vremenska zona');await close(a);
 await open(b,'Nalog');
 for(let n=0;n<5;n++){
  await open(a,'Nalog');
  const state=await a.evaluate(()=>({title:document.querySelector('[data-modal-panel] h2')?.textContent,focusInside:document.querySelector('[data-modal-panel]').contains(document.activeElement)}));
  if(state.title!=='Nalog'||!state.focusInside)throw Error('Wrong panel/focus');
  await close(a);steps.push({cycle:n+1,...state,ok:true});
 }
 await close(b);
 writeFileSync(new URL('./panel-two-tabs-review.json',import.meta.url),JSON.stringify({scope:'Component fixture two-page modal focus isolation; no Firebase/Auth claims',steps},null,2));
 console.log(JSON.stringify(steps));
}finally{await browser.close();}
