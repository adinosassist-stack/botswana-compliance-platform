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

const isLightMonochrome=value=>{
  const channels=value.match(/\d+/g)?.slice(0,3).map(Number)||[];
  return channels.length===3&&Math.max(...channels)-Math.min(...channels)<=2&&Math.min(...channels)>=235;
};

const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});

try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
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
    const particleOrb=dock.querySelector('.thebe-particle-orb');
    const hiddenChrome=['.thebe-ai-presence','.thebe-ai-context-bar','.thebe-ai-mode-rail','.thebe-ai-foot','.thebe-ai-response-title'].map(selector=>{
      const element=dock.querySelector(selector);
      return {selector,present:Boolean(element),display:element?getComputedStyle(element).display:null};
    });
    const quickButtons=[...dock.querySelectorAll('.thebe-ai-quick button')];
    const visibleQuick=quickButtons.filter(button=>{
      const style=getComputedStyle(button),rect=button.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
    });
    const dockStyle=getComputedStyle(dock),composeStyle=getComputedStyle(composer),sendStyle=getComputedStyle(send),coreStyle=getComputedStyle(core);
    const orbRect=orb.getBoundingClientRect(),coreRect=core.getBoundingClientRect();
    return {
      dockBackground:dockStyle.backgroundColor,
      dockColor:dockStyle.color,
      hiddenChrome,
      quickTotal:quickButtons.length,
      quickVisible:visibleQuick.length,
      quickRadius:visibleQuick[0]?getComputedStyle(visibleQuick[0]).borderRadius:null,
      composeBackground:composeStyle.backgroundColor,
      composeRadius:composeStyle.borderRadius,
      composeShadow:composeStyle.boxShadow,
      sendWidth:send.getBoundingClientRect().width,
      sendHeight:send.getBoundingClientRect().height,
      sendBackground:sendStyle.backgroundColor,
      sendColor:sendStyle.color,
      orbWidth:orbRect.width,
      orbHeight:orbRect.height,
      coreWidth:coreRect.width,
      coreHeight:coreRect.height,
      coreBackground:coreStyle.backgroundColor,
      particleAfterDisplay:particleOrb?getComputedStyle(particleOrb,'::after').display:null
    };
  });

  assert.equal(desktop.dockBackground,'rgb(25, 25, 25)','V292 keeps the dock monochrome #191919');
  assert.equal(desktop.dockColor,'rgb(244, 244, 244)','V292 keeps high-contrast dock text');
  for(const item of desktop.hiddenChrome)assert(!item.present||item.display==='none',`${item.selector} must stay visually removed in V292`);
  assert(desktop.quickTotal>=3,'V292 retains at least three useful shortcuts');
  assert.equal(desktop.quickVisible,3,'collapsed V292 dock exposes exactly three shortcuts');
  assert.equal(desktop.quickRadius,'999px','V292 shortcuts stay compact pill controls');
  assert.equal(desktop.composeBackground,'rgb(36, 36, 36)','composer remains the dominant dark input surface');
  assert.equal(desktop.composeRadius,'24px','composer keeps GPT-style rounded geometry');
  assert.equal(desktop.composeShadow,'none','composer stays visually flat');
  assert.equal(Math.round(desktop.sendWidth),36,'send control remains compact');
  assert.equal(Math.round(desktop.sendHeight),36,'send control remains compact vertically');
  assert(isLightMonochrome(desktop.sendBackground),`send control remains the primary light monochrome action: ${desktop.sendBackground}`);
  assert.equal(desktop.sendColor,'rgb(23, 23, 23)','send icon remains dark on the light action');
  assert.equal(Math.round(desktop.orbWidth),68,'voice recovery target remains 68px');
  assert.equal(Math.round(desktop.orbHeight),68,'voice recovery target remains 68px vertically');
  assert(desktop.coreWidth>=18&&desktop.coreWidth<=24,`voice visual core stays intentionally small: ${desktop.coreWidth}px`);
  assert(desktop.coreHeight>=18&&desktop.coreHeight<=24,`voice visual core stays intentionally small vertically: ${desktop.coreHeight}px`);
  assert(desktop.coreWidth<desktop.orbWidth*.4&&desktop.coreHeight<desktop.orbHeight*.4,'voice visual remains much smaller than its recovery target');
  assert(isLightMonochrome(desktop.coreBackground),`voice core remains light monochrome: ${desktop.coreBackground}`);
  assert.equal(desktop.particleAfterDisplay,'none','decorative secondary voice ring stays removed');

  await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
  const expanded=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const buttons=[...dock.querySelectorAll('.thebe-ai-quick button')];
    return {
      expanded:document.body.classList.contains('thebe-ai-expanded'),
      total:buttons.length,
      visible:buttons.filter(button=>getComputedStyle(button).display!=='none'&&button.getBoundingClientRect().width>0).length,
      composerVisible:getComputedStyle(dock.querySelector('.thebe-ai-compose')).display!=='none'
    };
  });
  assert(expanded.expanded,'expanded state remains available');
  assert(expanded.visible>=desktop.quickVisible,'expansion never removes the primary shortcuts');
  if(expanded.total>3)assert(expanded.visible>3,'expanded state reveals the secondary shortcuts');
  assert(expanded.composerVisible,'composer remains available when expanded');

  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.body.classList.contains('thebe-ai-dock-open'));
  await page.locator('#thebeAiDockPill').click();
  await page.locator('#thebeAiDock').waitFor({state:'visible'});
  const mobile=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const compose=dock.querySelector('.thebe-ai-compose');
    const send=dock.querySelector('.thebe-ai-send');
    return {
      dockBackground:getComputedStyle(dock).backgroundColor,
      composeBackground:getComputedStyle(compose).backgroundColor,
      sendBackground:getComputedStyle(send).backgroundColor,
      hiddenChrome:['.thebe-ai-presence','.thebe-ai-context-bar','.thebe-ai-mode-rail','.thebe-ai-foot','.thebe-ai-response-title'].every(selector=>{const element=dock.querySelector(selector);return !element||getComputedStyle(element).display==='none';})
    };
  });
  assert.equal(mobile.dockBackground,'rgb(25, 25, 25)','mobile keeps V292 monochrome dock');
  assert.equal(mobile.composeBackground,'rgb(36, 36, 36)','mobile keeps the same composer hierarchy');
  assert(isLightMonochrome(mobile.sendBackground),`mobile keeps the same primary light monochrome action: ${mobile.sendBackground}`);
  assert(mobile.hiddenChrome,'mobile also keeps legacy dock chrome hidden');
  assert.deepEqual(errors,[],'V292 visual contract produces no browser errors');
  console.log('V292_DOCK_VISUAL_CONTRACT_PASS: monochrome shell, hidden legacy chrome, three collapsed shortcuts, GPT-style composer, minimal voice visual inside preserved 68px recovery target, mobile parity');
}finally{
  await browser.close();
}
