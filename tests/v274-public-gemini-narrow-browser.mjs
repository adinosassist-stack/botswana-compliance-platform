import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const css=fs.readFileSync('public/assets/market-thebe-gemini-v273.css','utf8');
assert.match(css,/clamp\(360px,28vw,420px\)/,'large desktop CSS fallback must match the narrow Gemini rail');
assert.match(css,/clamp\(332px,31vw,360px\)/,'medium desktop CSS fallback must match the narrow Gemini rail');
assert.doesNotMatch(css,/clamp\(480px,38vw,680px\)/,'old oversized Gemini fallback must not return');

const fixture=`<!doctype html><html><head>
<link rel="stylesheet" href="/assets/thebe-ai-dock.css">
<link rel="stylesheet" href="/assets/thebe-spatial-dock-v246.css">
<link rel="stylesheet" href="/assets/market-thebe-gemini-v273.css">
<script src="/js/market-thebe-gemini-narrow-v274.js" defer></script>
</head><body class="thebe-ai-dock-open">
<div id="marketingGate"><main style="min-height:960px"></main></div>
<aside id="thebeAiDock" class="thebe-ai-dock" data-surface="public">
  <header class="thebe-ai-dock-head"><div class="thebe-ai-dock-title"><span class="thebe-ai-mark"></span><span class="thebe-ai-title-copy"><b>Thebe AI</b></span></div><div class="thebe-ai-head-actions"><button class="thebe-ai-icon-btn" aria-label="Close">×</button></div></header>
  <div class="thebe-ai-dock-scroll">
    <div class="thebe-ai-presence">presence</div>
    <div class="thebe-ai-context-bar">context</div>
    <div class="thebe-ai-mode-rail">mode</div>
    <div class="thebe-ai-voice-card">voice</div>
    <div class="thebe-ai-quick"><button>Suggestion</button></div>
    <div class="thebe-ai-public-actions">actions</div>
    <section class="thebe-ai-response"><div class="thebe-ai-response-answer">Ready when you are.</div></section>
  </div>
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
    const composer=dock.querySelector('.thebe-ai-compose').getBoundingClientRect();
    const close=dock.querySelector('.thebe-ai-icon-btn').getBoundingClientRect();
    const send=dock.querySelector('.thebe-ai-send').getBoundingClientRect();
    const hiddenSelectors=['.thebe-ai-presence','.thebe-ai-context-bar','.thebe-ai-mode-rail','.thebe-ai-voice-card','.thebe-ai-quick','.thebe-ai-public-actions'];
    return {
      width:rect.width,
      top:rect.top,
      right:innerWidth-rect.right,
      bottom:innerHeight-rect.bottom,
      gatePaddingRight:parseFloat(getComputedStyle(gate).paddingRight),
      dockLeft:rect.left,
      mainRight:gate.querySelector('main').getBoundingClientRect().right,
      widthInline:dock.style.getPropertyValue('width'),
      widthPriority:dock.style.getPropertyPriority('width'),
      release:dock.dataset.geminiNarrowRelease||'',
      closeWidth:close.width,
      closeHeight:close.height,
      closeRadius:getComputedStyle(dock.querySelector('.thebe-ai-icon-btn')).borderRadius,
      sendWidth:send.width,
      sendHeight:send.height,
      sendRadius:getComputedStyle(dock.querySelector('.thebe-ai-send')).borderRadius,
      composerWidth:composer.width,
      composerBottomGap:rect.bottom-composer.bottom,
      composerRadius:getComputedStyle(dock.querySelector('.thebe-ai-compose')).borderRadius,
      clutterDisplays:hiddenSelectors.map(selector=>getComputedStyle(dock.querySelector(selector)).display)
    };
  });
  assert(desktop.width>=360&&desktop.width<=420,`desktop Gemini rail must stay narrow: ${JSON.stringify(desktop)}`);
  assert(desktop.width/1440<0.30,`desktop Gemini rail must stay below 30% of a 1440px viewport: ${JSON.stringify(desktop)}`);
  assert(Math.abs(desktop.top-16)<=1&&Math.abs(desktop.right-16)<=1&&Math.abs(desktop.bottom-16)<=1,`desktop rail keeps Gemini edge spacing: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.widthPriority,'important','runtime geometry must own width with inline !important');
  assert.match(desktop.release,/gemini-parity-v275$/,'runtime must expose the Gemini parity release marker');
  assert(desktop.gatePaddingRight>=desktop.width+31,`market lane must reserve the narrow assistant width: ${JSON.stringify(desktop)}`);
  assert(desktop.mainRight<=desktop.dockLeft,'market content must not overlap the narrow Gemini rail');
  assert(Math.abs(desktop.closeWidth-36)<=1&&Math.abs(desktop.closeHeight-36)<=1,'header controls must stay compact like Gemini');
  assert.equal(desktop.closeRadius,'50%','header controls must be circular');
  assert(Math.abs(desktop.sendWidth-42)<=1&&Math.abs(desktop.sendHeight-42)<=1,'send control must stay compact and circular');
  assert.equal(desktop.sendRadius,'50%','send control must be circular');
  assert(desktop.composerWidth>desktop.width*0.82,'single composer must span most of the rail');
  assert(desktop.composerBottomGap>=17&&desktop.composerBottomGap<=19,`composer must stay anchored near the dock bottom: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.composerRadius,'28px','composer must keep Gemini-like rounded geometry');
  assert(desktop.clutterDisplays.every(value=>value==='none'),`Gemini public rail must remove suggestion/voice/action clutter: ${JSON.stringify(desktop.clutterDisplays)}`);

  await page.evaluate(()=>{document.getElementById('thebeAiDock').hidden=true});
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)===0);
  const hiddenPad=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight));
  assert.equal(hiddenPad,0,'closing/hiding Thebe must immediately return the full market lane');

  await page.evaluate(()=>{document.getElementById('thebeAiDock').hidden=false});
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)>400);
  const reopenedPad=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight));
  assert(reopenedPad>=434,'reopening Thebe must restore the narrow assistant lane');

  await page.evaluate(()=>document.getElementById('thebeAiDock').setAttribute('aria-hidden','true'));
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)===0);
  await page.evaluate(()=>document.getElementById('thebeAiDock').removeAttribute('aria-hidden'));
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)>400);

  await page.setViewportSize({width:1100,height:900});
  await page.waitForTimeout(80);
  const medium=await page.evaluate(()=>({width:document.getElementById('thebeAiDock').getBoundingClientRect().width,pad:parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)}));
  assert(medium.width>=332&&medium.width<=360,`medium desktop Gemini rail must stay narrow: ${JSON.stringify(medium)}`);
  assert(medium.pad>=medium.width+23,`medium market lane must reserve the narrow rail: ${JSON.stringify(medium)}`);

  await page.setViewportSize({width:900,height:900});
  await page.waitForTimeout(80);
  const mobile=await page.evaluate(()=>({
    flag:document.getElementById('thebeAiDock').dataset.geminiNarrowV274||'',
    inlineWidth:document.getElementById('thebeAiDock').style.getPropertyValue('width'),
    inlinePad:document.getElementById('marketingGate').style.getPropertyValue('padding-right'),
    computedPad:parseFloat(getComputedStyle(document.getElementById('marketingGate')).paddingRight)
  }));
  assert.equal(mobile.flag,'','mobile must release desktop narrow-rail ownership');
  assert.equal(mobile.inlineWidth,'','mobile must fall back to the existing responsive overlay contract');
  assert.equal(mobile.inlinePad,'','mobile must release desktop market-lane ownership');
  assert.equal(mobile.computedPad,0,'mobile must not retain a dead desktop lane');
  assert.deepEqual(errors,[],'narrow Gemini runtime contract must not raise browser errors');
  console.log('V275_PUBLIC_GEMINI_PARITY_PASS: narrow rail, compact controls, clutter-free chat, bottom composer, close/reopen lane recovery, mobile release');
}finally{
  await browser.close();
}
