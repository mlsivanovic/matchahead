import puppeteer from '/home/mls/GIT/matchahead/apps/web/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { writeFileSync } from 'node:fs';
const before = process.argv.includes('--before');
const browser = await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844});
 for(const hash of ['#/klubovi','#/podesavanja']) {
  await page.goto('http://127.0.0.1:5180/matchahead/'+hash,{waitUntil:'networkidle0'});
  let focused=false;
  for(let n=0;n<20&&!focused;n++){
   await page.keyboard.press('Tab');
   focused=await page.evaluate(()=>document.activeElement?.classList.contains('skip'));
  }
  if(!focused) throw Error('Keyboard did not reach skip link');
  const historyLength=await page.evaluate(()=>history.length);
  await page.keyboard.press('Enter');
  await new Promise(r=>setTimeout(r,120));
  const state=await page.evaluate(()=>({hash:location.hash,focus:document.activeElement?.id,historyLength:history.length}));
  results.push({initialHash:hash,expectedHistoryLength:historyLength,...state,ok:state.hash===hash&&state.focus==='sadrzaj'&&state.historyLength===historyLength});
 }
 const report={scope:'Real App gate keyboard activation; no authenticated tab or emulator/API integration claimed',beforeFix:before,results};
 writeFileSync(new URL(before?'./skip-link-before-fix.json':'./skip-link-review.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(!before&&results.some(r=>!r.ok))process.exitCode=1;
} finally {await browser.close();}
