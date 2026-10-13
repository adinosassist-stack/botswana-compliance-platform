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
</head><body class="thebe-ai-dock-open">
<div id="marketingGate"><main style="min-height:960px"></main></div>
<aside id="thebeAiDock" class="thebe-ai-dock" data-surface="public">
  <header class="thebe-ai-dock-head">
    <div class="thebe-ai-dock-title"><span class="thebe-ai-mark"></span><span class="thebe-ai-title-copy"><b>Thebe AI</b></span></div>
    <div class="thebe-ai-head-actions"><button class="thebe-ai-icon-btn" aria-label="Close">×</button></div>
  </header>
  <div class="thebe-ai-dock-scroll">
    <section class="thebe-ai-voice-card"><button class="thebe-ai-orb-button"></button><div class="thebe-ai-voice-label">Talk to Thebe</div></section>
    <div class="thebe-ai-quick"><button>Explain this page</button><button>What needs attention?</button></div>
    <div class="thebe-ai-public-actions"><button class="thebe-ai-public-signin">Sign in</button><button class="thebe-ai-public-start">Start</button></div>
    <section class="thebe-ai-response"><div class="thebe-ai-response-title">Thebe</div><div class="thebe-ai-response-answer">Ready when you are.</div></section>
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
  await page.waitForSelector('#thebeAiDock',{state:'visible'});
  const contract=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const rect=dock.getBoundingClientRect();
    const quick=dock.querySelector('.thebe-ai-quick');
    const voice=dock.querySelector('.thebe-ai-voice-card');
    const publicActions=dock.querySelector('.thebe-ai-public-actions');
    const composer=dock.querySelector('.thebe-ai-compose');
    const send=dock.querySelector('.thebe-ai-send');
    const sendRect=send.getBoundingClientRect();
    const icon=dock.querySelector('.thebe-ai-icon-btn');
    const iconRect=icon.getBoundingClientRect();
    const marketing=document.querySelector('#marketingGate main');
    return {
      width:rect.width,
      top:rect.top,
      bottom:innerHeight-rect.bottom,
      background:getComputedStyle(dock).backgroundColor,
      quickDisplay:getComputedStyle(quick).display,
      voiceDisplay:getComputedStyle(voice).display,
      publicActionsDisplay:getComputedStyle(publicActions).display,
      composerRadius:getComputedStyle(composer).borderRadius,
      composerBackground:getComputedStyle(composer).backgroundColor,
      sendWidth:sendRect.width,
      sendHeight:sendRect.height,
      sendRadius:getComputedStyle(send).borderRadius,
      iconWidth:iconRect.width,
      iconHeight:iconRect.height,
      iconRadius:getComputedStyle(icon).borderRadius,
      marketingRight:marketing.getBoundingClientRect().right,
      dockLeft:rect.left
    };
  });
  assert(contract.width>=360&&contract.width<=420,`Gemini side rail should stay narrow at 1440px: ${JSON.stringify(contract)}`);
  assert(contract.width/1440<0.30,`Gemini side rail should remain below 30% of the desktop viewport: ${JSON.stringify(contract)}`);
  assert(Math.abs(contract.top-16)<=1&&Math.abs(contract.bottom-16)<=1,`Gemini panel should run nearly full viewport height: ${JSON.stringify(contract)}`);
  assert.equal(contract.background,'rgb(25, 25, 25)','public Thebe keeps the flat dark Thebe/Gemini surface');
  assert.equal(contract.quickDisplay,'none','Gemini reference has no public suggestion-pill row');
  assert.equal(contract.voiceDisplay,'none','Gemini reference has no large standalone public voice card');
  assert.equal(contract.publicActionsDisplay,'none','Gemini reference does not place extra CTA pills inside the assistant canvas');
  assert.equal(contract.composerRadius,'28px','composer uses the single rounded Gemini-style input surface');
  assert.equal(contract.composerBackground,'rgb(36, 36, 36)','composer remains visually distinct but flat');
  assert.equal(Math.round(contract.sendWidth),42,'send action is compact');
  assert.equal(Math.round(contract.sendHeight),42,'send action is compact vertically');
  assert.equal(contract.sendRadius,'50%','send action is circular');
  assert.equal(Math.round(contract.iconWidth),36,'header icon control stays compact');
  assert.equal(Math.round(contract.iconHeight),36,'header icon control stays square');
  assert.equal(contract.iconRadius,'50%','header icon control is circular rather than pill-shaped');
  assert(contract.marketingRight<=contract.dockLeft,'market content must stop before the Gemini side panel lane');
  assert.deepEqual(errors,[],'Gemini public-panel contract must not raise browser errors');
  console.log('V273_PUBLIC_GEMINI_PANEL_PASS: narrow side rail, full-height geometry, no pills, flat chat canvas, rounded composer, circular controls');
}finally{
  await browser.close();
}
