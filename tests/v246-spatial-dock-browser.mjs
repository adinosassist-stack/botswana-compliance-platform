import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,injectPublicThebeAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const propertyStart=html.indexOf('  <section id="propertyintelligence"');
const property=html.slice(propertyStart,html.indexOf('</section>',propertyStart)+10).replace('class="view simplified-hub','class="view active simplified-hub');
let fixture=externalizeWorkspaceHeadStyles('<!doctype html>'+html.slice(html.indexOf('<html'),html.indexOf('</head>')+7)+'<body><section id="marketingGate" class="hidden" style="display:none"></section><section id="appShell" class="shell"><aside id="workspaceSidebar"><button>Home</button></aside><main id="mainContent"><div class="top"><h1 id="pageTitle">Property</h1><button id="businessAction">Business action</button></div>'+property+'</main></section></body></html>');
fixture=injectOwnerCommandCentreAssets(fixture);
const publicFixture=injectPublicThebeAssets(fs.readFileSync('public/home.html','utf8'));
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const within=(actual,expected,tolerance=1.5)=>Math.abs(actual-expected)<=tolerance;

try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://localhost/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/public-page')return route.fulfill({contentType:'text/html',body:publicFixture});
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
    if(pathname.endsWith('.js')&&!pathname.includes('thebe-live-voice')&&!pathname.includes('property-visibility'))return route.fulfill({contentType:'application/javascript',body:''});
    if(process.env.THEBE_DOCK_BASELINE&&pathname==='/assets/thebe-spatial-dock-v246.css')return route.fulfill({contentType:'text/css',body:''});
    const file='public'+pathname;return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.addInitScript(()=>{window.currentWorkspaceRole=()=> 'owner';window.apiJson=async()=>({sessionCreationAllowed:false});});
  await page.goto('http://localhost/');
  await page.waitForSelector('#thebeAiDock');

  const desktopVoice=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    const orb=dock.querySelector('.thebe-ai-orb-button').getBoundingClientRect();
    const answer=dock.querySelector('.thebe-ai-response-answer');
    answer.textContent='RevenueAndComplianceSignalWithoutNaturalBreaks'.repeat(12);
    return {orbWidth:orb.width,orbHeight:orb.height,dockClientWidth:dock.clientWidth,dockScrollWidth:dock.scrollWidth,answerClientWidth:answer.clientWidth,answerScrollWidth:answer.scrollWidth};
  });
  assert(within(desktopVoice.orbWidth,96)&&within(desktopVoice.orbHeight,96),`wide desktop voice target must be 96px: ${JSON.stringify(desktopVoice)}`);
  assert(desktopVoice.dockScrollWidth<=desktopVoice.dockClientWidth+1,'dock text must remain contained');
  assert(desktopVoice.answerScrollWidth<=desktopVoice.answerClientWidth+1,'AI answer must wrap inside the panel');

  const normalDockWidths=new Map([[1440,547.2],[1200,456],[1199,380],[1180,377.6],[1024,327.68]]);
  for(const [width,expectedDockWidth] of normalDockWidths){
    await page.setViewportSize({width,height:960});
    await page.waitForFunction(expected=>Math.abs(document.getElementById('thebeAiDock').getBoundingClientRect().width-expected)<=1.5,expectedDockWidth);
    const geometry=await page.evaluate(()=>{const d=document.getElementById('thebeAiDock').getBoundingClientRect(),m=document.getElementById('mainContent').getBoundingClientRect(),c=document.querySelector('.property-calculator-v224').getBoundingClientRect();return {dock:{left:d.left,right:d.right,width:d.width},main:{left:m.left,right:m.right},card:{width:c.width}}});
    assert(within(geometry.dock.width,expectedDockWidth),`unexpected Gemini-style dock width at ${width}: ${JSON.stringify(geometry)}`);
    assert(geometry.main.right<=geometry.dock.left+1,`assistant panel overlaps workspace at ${width}: ${JSON.stringify(geometry)}`);
    assert(geometry.card.width<=680&&geometry.card.width>0,`Property calculator remains bounded at ${width}: ${JSON.stringify(geometry)}`);
  }

  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
  const expandedDockWidths=new Map([[1440,633.6],[1200,528],[1199,430],[1024,368.64]]);
  for(const [width,expectedDockWidth] of expandedDockWidths){
    await page.setViewportSize({width,height:960});
    await page.waitForFunction(expected=>Math.abs(document.getElementById('thebeAiDock').getBoundingClientRect().width-expected)<=1.5,expectedDockWidth);
    const geometry=await page.evaluate(()=>{const d=document.getElementById('thebeAiDock').getBoundingClientRect(),m=document.getElementById('mainContent').getBoundingClientRect();return {dock:{left:d.left,width:d.width},main:{right:m.right}}});
    assert(within(geometry.dock.width,expectedDockWidth),`unexpected expanded panel width at ${width}: ${JSON.stringify(geometry)}`);
    assert(geometry.main.right<=geometry.dock.left+1,`expanded assistant overlaps workspace at ${width}: ${JSON.stringify(geometry)}`);
  }

  await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>{window.apiJson=async()=>({sessionCreationAllowed:true});navigator.mediaDevices.getUserMedia=()=>new Promise(()=>{});});
  await page.locator('.thebe-ai-orb-button').click();
  const screen=page.locator('#thebeVoiceScreen');
  assert(await screen.isVisible(),'voice activation opens the dedicated screen');
  const voiceRect=await screen.boundingBox();
  assert(voiceRect.width===1440&&voiceRect.height===960,'voice screen fills the viewport');
  await page.keyboard.press('Escape');
  assert(!(await screen.isVisible()),'Escape closes voice mode');

  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>!document.body.classList.contains('thebe-ai-dock-open')&&getComputedStyle(document.getElementById('mainContent')).visibility!=='hidden');
  assert(!(await page.locator('#thebeAiDock').isVisible()),'desktop panel collapses on mobile');
  assert(await page.locator('#thebeAiDockPill').isVisible(),'mobile launcher remains available');
  await page.locator('#thebeAiDockPill').click();
  assert(await page.locator('#thebeAiDock').isVisible(),'mobile launcher opens Thebe conversation');
  await page.evaluate(()=>window.ThebeAiDock.close());

  await page.setViewportSize({width:1440,height:960});
  await page.goto('http://localhost/public-page');
  await page.waitForSelector('#thebeAiDock');
  const publicGeometry=await page.evaluate(()=>{const m=document.querySelector('#marketingGate main'),d=document.getElementById('thebeAiDock').getBoundingClientRect();return {mainRight:m.getBoundingClientRect().right,dockLeft:d.left}});
  assert(publicGeometry.mainRight<=publicGeometry.dockLeft+1,'public assistant panel stays outside page content');
  assert.deepEqual(errors,[],'no browser errors');
  console.log('V246_SPATIAL_DOCK_BROWSER_PASS: Gemini-style desktop panel, reserved workspace lane, bounded Property, fullscreen voice and mobile transition');
}finally{await browser.close()}
