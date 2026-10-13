import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectPublicThebeAssets} from '../cloudflare/src/production-entry.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
let fixture=injectPublicThebeAssets(fs.readFileSync('public/home.html','utf8'));
fixture=fixture.replace('</head>','<link rel="stylesheet" href="/assets/market-thebe-gemini-v273.css?v=test"></head>');

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.goto('http://localhost/');
  await page.waitForSelector('#thebeAiDock');
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
    const iconRect=icon?.getBoundingClientRect();
    const marketing=document.querySelector('#marketingGate main');
    return {
      width:rect.width,
      top:rect.top,
      bottom:innerHeight-rect.bottom,
      background:getComputedStyle(dock).backgroundColor,
      quickDisplay:quick?getComputedStyle(quick).display:null,
      voiceDisplay:voice?getComputedStyle(voice).display:null,
      publicActionsDisplay:publicActions?getComputedStyle(publicActions).display:null,
      composerRadius:getComputedStyle(composer).borderRadius,
      composerBackground:getComputedStyle(composer).backgroundColor,
      sendWidth:sendRect.width,
      sendHeight:sendRect.height,
      sendRadius:getComputedStyle(send).borderRadius,
      iconWidth:iconRect?.width||0,
      iconHeight:iconRect?.height||0,
      iconRadius:icon?getComputedStyle(icon).borderRadius:null,
      marketingRight:marketing?.getBoundingClientRect().right||0,
      dockLeft:rect.left
    };
  });
  assert(Math.abs(contract.width-547.2)<=2,`Gemini reference width should be about 38vw at 1440px: ${JSON.stringify(contract)}`);
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
  if(contract.iconWidth){
    assert.equal(Math.round(contract.iconWidth),36,'header icon control stays compact');
    assert.equal(Math.round(contract.iconHeight),36,'header icon control stays square');
    assert.equal(contract.iconRadius,'50%','header icon control is circular rather than pill-shaped');
  }
  assert(contract.marketingRight<=contract.dockLeft,'market content must stop before the Gemini side panel lane');
  assert.deepEqual(errors,[],'Gemini public-panel contract must not raise browser errors');
  console.log('V273_PUBLIC_GEMINI_PANEL_PASS: 38vw side panel, full-height geometry, no pills, flat chat canvas, rounded composer, circular controls');
}finally{
  await browser.close();
}
