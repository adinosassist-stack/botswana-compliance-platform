import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const propertyStart=html.indexOf('  <section id="propertyintelligence"');
const propertyEnd=html.indexOf('</section>',propertyStart)+10;
const property=html.slice(propertyStart,propertyEnd).replace('class="view simplified-hub','class="view active simplified-hub');
let fixture=externalizeWorkspaceHeadStyles('<!doctype html>'+html.slice(html.indexOf('<html'),html.indexOf('</head>')+7)+'<body><section id="marketingGate" class="hidden" style="display:none"></section><section id="appShell" class="shell"><aside id="workspaceSidebar"><button>Home</button></aside><main id="mainContent"><div class="top"><h1 id="pageTitle">Property</h1></div>'+property+'</main></section></body></html>');
fixture=injectOwnerCommandCentreAssets(fixture);

const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});

try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname.endsWith('.js')&&!pathname.includes('thebe-live-voice')&&!pathname.includes('property-visibility'))return route.fulfill({contentType:'application/javascript',body:''});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.addInitScript(()=>{window.currentWorkspaceRole=()=> 'owner';window.apiJson=async()=>({sessionCreationAllowed:false});});
  await page.goto('http://localhost/');
  await page.waitForSelector('#thebeAiDock');

  const desktop=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const composer=dock.querySelector('.thebe-ai-compose');
    const send=dock.querySelector('.thebe-ai-send');
    const orb=dock.querySelector('.thebe-ai-orb-button');
    const core=dock.querySelector('.thebe-particle-core');
    const hiddenChrome=['.thebe-ai-presence','.thebe-ai-context-bar','.thebe-ai-mode-rail','.thebe-ai-foot','.thebe-ai-response-title'].map(selector=>{const element=dock.querySelector(selector);return {selector,present:Boolean(element),display:element?getComputedStyle(element).display:null};});
    const quickButtons=[...dock.querySelectorAll('.thebe-ai-quick button')];
    const visibleQuick=quickButtons.filter(button=>{const style=getComputedStyle(button),rect=button.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;});
    const sendRect=send.getBoundingClientRect(),orbRect=orb.getBoundingClientRect(),coreRect=core.getBoundingClientRect();
    return {
      dockBackground:getComputedStyle(dock).backgroundColor,
      dockColor:getComputedStyle(dock).color,
      hiddenChrome,
      quickTotal:quickButtons.length,
      quickVisible:visibleQuick.length,
      composeBackground:getComputedStyle(composer).backgroundColor,
      composeRadius:getComputedStyle(composer).borderRadius,
      composeShadow:getComputedStyle(composer).boxShadow,
      sendWidth:sendRect.width,sendHeight:sendRect.height,sendRadius:getComputedStyle(send).borderRadius,
      orbWidth:orbRect.width,orbHeight:orbRect.height,coreWidth:coreRect.width,coreHeight:coreRect.height,
      dockWidth:dock.getBoundingClientRect().width
    };
  });

  assert.equal(desktop.dockBackground,'rgb(25, 25, 25)','dock keeps Thebe monochrome surface');
  assert.equal(desktop.dockColor,'rgb(244, 244, 244)','dock keeps high-contrast text');
  for(const item of desktop.hiddenChrome)assert(!item.present||item.display==='none',`${item.selector} must remain visually removed`);
  assert(desktop.quickTotal>=3,'Thebe retains useful shortcuts');
  assert.equal(desktop.quickVisible,3,'collapsed panel exposes three shortcuts');
  assert.equal(desktop.composeBackground,'rgb(36, 36, 36)','composer remains dominant input surface');
  assert.equal(desktop.composeRadius,'24px','composer keeps rounded geometry');
  assert.equal(desktop.composeShadow,'none','composer remains visually flat');
  assert.equal(Math.round(desktop.sendWidth),36,'send control remains compact');
  assert.equal(Math.round(desktop.sendHeight),36,'send control remains compact vertically');
  assert.equal(desktop.sendRadius,'50%','send control remains circular');
  assert.equal(Math.round(desktop.orbWidth),96,'wide desktop voice target expands to 96px in the Gemini-style panel');
  assert.equal(Math.round(desktop.orbHeight),96,'wide desktop voice target expands to 96px vertically');
  assert(desktop.coreWidth>=18&&desktop.coreWidth<=24,'voice visual core remains intentionally small');
  assert(desktop.coreHeight>=18&&desktop.coreHeight<=24,'voice visual core remains intentionally small vertically');
  assert(desktop.coreWidth<desktop.orbWidth*.3&&desktop.coreHeight<desktop.orbHeight*.3,'voice core remains subordinate to the larger target');
  assert(Math.abs(desktop.dockWidth-547.2)<=1.5,`1440px desktop panel should occupy about 38vw: ${desktop.dockWidth}`);

  await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
  const expanded=await page.evaluate(()=>{const dock=document.getElementById('thebeAiDock'),buttons=[...dock.querySelectorAll('.thebe-ai-quick button')];return {expanded:document.body.classList.contains('thebe-ai-expanded'),visible:buttons.filter(button=>getComputedStyle(button).display!=='none'&&button.getBoundingClientRect().width>0).length,width:dock.getBoundingClientRect().width,composerVisible:getComputedStyle(dock.querySelector('.thebe-ai-compose')).display!=='none'};});
  assert(expanded.expanded,'expanded state remains available');
  assert(expanded.visible>=desktop.quickVisible,'expansion never removes primary shortcuts');
  assert(expanded.composerVisible,'composer remains available when expanded');
  assert(Math.abs(expanded.width-633.6)<=1.5,`expanded 1440px panel should occupy about 44vw: ${expanded.width}`);

  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.body.classList.contains('thebe-ai-dock-open'));
  await page.locator('#thebeAiDockPill').click();
  await page.locator('#thebeAiDock').waitFor({state:'visible'});
  const mobile=await page.evaluate(()=>{const dock=document.getElementById('thebeAiDock'),compose=dock.querySelector('.thebe-ai-compose'),send=dock.querySelector('.thebe-ai-send'),rect=send.getBoundingClientRect();return {dockBackground:getComputedStyle(dock).backgroundColor,composeBackground:getComputedStyle(compose).backgroundColor,sendWidth:rect.width,sendHeight:rect.height};});
  assert.equal(mobile.dockBackground,'rgb(25, 25, 25)','mobile keeps Thebe monochrome panel');
  assert.equal(mobile.composeBackground,'rgb(36, 36, 36)','mobile keeps composer hierarchy');
  assert(mobile.sendWidth>0&&mobile.sendHeight>0,'mobile retains a visible send action');
  assert.deepEqual(errors,[],'visual contract produces no browser errors');
  console.log('V292_DOCK_VISUAL_CONTRACT_PASS: Thebe styling, larger Gemini-style desktop panel, 96px voice target, expandable shortcuts and mobile parity');
}finally{await browser.close();}
