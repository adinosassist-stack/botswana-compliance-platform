import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const fixture=`<!doctype html><html><head>
<link rel="stylesheet" href="/assets/thebe-ai-dock.css">
<link rel="stylesheet" href="/assets/thebe-spatial-dock-v246.css">
<link rel="stylesheet" href="/assets/market-thebe-gemini-v273.css">
<script src="/js/market-thebe-gemini-narrow-v274.js" defer></script>
</head><body class="thebe-ai-dock-open">
<div id="marketingGate"><main style="min-height:960px"></main></div>
<aside id="thebeAiDock" class="thebe-ai-dock" data-surface="public">
  <header class="thebe-ai-dock-head"><div class="thebe-ai-dock-title"><span class="thebe-ai-mark"></span><span class="thebe-ai-title-copy"><b>Thebe AI</b></span></div><div class="thebe-ai-head-actions"><button class="thebe-ai-icon-btn" aria-label="Close">×</button></div></header>
  <div class="thebe-ai-dock-scroll"><section class="thebe-ai-response"><div class="thebe-ai-response-answer">Ready when you are.</div></section></div>
  <form class="thebe-ai-compose"><textarea placeholder="Ask Thebe"></textarea><button class="thebe-ai-send" type="button">↑</button></form>
</aside>
</body></html>`;

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(()=>document.querySelector('#thebeAiDock')?.dataset.geminiNarrowV274==='1');

  const desktop=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const rect=dock.getBoundingClientRect();
    const gate=document.getElementById('marketingGate');
    return {
      width:rect.width,
      top:rect.top,
      right:innerWidth-rect.right,
      bottom:innerHeight-rect.bottom,
      gatePaddingRight:parseFloat(getComputedStyle(gate).paddingRight),
      dockLeft:rect.left,
      mainRight:gate.querySelector('main').getBoundingClientRect().right,
      widthInline:dock.style.getPropertyValue('width'),
      widthPriority:dock.style.getPropertyPriority('width')
    };
  });
  assert(desktop.width>=360&&desktop.width<=420,`desktop Gemini rail must stay narrow: ${JSON.stringify(desktop)}`);
  assert(desktop.width/1440<0.30,`desktop Gemini rail must stay below 30% of a 1440px viewport: ${JSON.stringify(desktop)}`);
  assert(Math.abs(desktop.top-16)<=1&&Math.abs(desktop.right-16)<=1&&Math.abs(desktop.bottom-16)<=1,`desktop rail keeps Gemini edge spacing: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.widthPriority,'important','runtime geometry must own width with inline !important');
  assert(desktop.gatePaddingRight>=desktop.width+31,`market lane must reserve the narrow assistant width: ${JSON.stringify(desktop)}`);
  assert(desktop.mainRight<=desktop.dockLeft,'market content must not overlap the narrow Gemini rail');

  await page.setViewportSize({width:1100,height:900});
  await page.waitForTimeout(50);
  const medium=await page.evaluate(()=>document.getElementById('thebeAiDock').getBoundingClientRect().width);
  assert(medium>=332&&medium<=360,`medium desktop Gemini rail must stay narrow: ${medium}`);

  await page.setViewportSize({width:900,height:900});
  await page.waitForTimeout(50);
  const mobile=await page.evaluate(()=>({flag:document.getElementById('thebeAiDock').dataset.geminiNarrowV274||'',inlineWidth:document.getElementById('thebeAiDock').style.getPropertyValue('width')}));
  assert.equal(mobile.flag,'','mobile must release desktop narrow-rail ownership');
  assert.equal(mobile.inlineWidth,'','mobile must fall back to the existing responsive overlay contract');
  assert.deepEqual(errors,[],'narrow Gemini runtime contract must not raise browser errors');
  console.log('V274_PUBLIC_GEMINI_NARROW_PASS: runtime-owned 360–420px desktop rail, 332–360px medium rail, mobile released to existing overlay');
}finally{
  await browser.close();
}
