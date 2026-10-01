import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,injectPublicThebeAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const property=html.slice(html.indexOf('  <section id="propertyintelligence"'),html.indexOf('</section>',html.indexOf('  <section id="propertyintelligence"'))+10).replace('class="view simplified-hub','class="view active simplified-hub');
let fixture=externalizeWorkspaceHeadStyles('<!doctype html>'+html.slice(html.indexOf('<html'),html.indexOf('</head>')+7)+'<body><section id="marketingGate" class="hidden" style="display:none"></section><section id="appShell" class="shell"><aside id="workspaceSidebar"><button>Home</button></aside><main id="mainContent"><div class="top"><h1 id="pageTitle">Property</h1><button id="businessAction">Business action</button></div>'+property+'</main></section></body></html>');
fixture=injectOwnerCommandCentreAssets(fixture);
const publicFixture=injectPublicThebeAssets(fs.readFileSync('public/home.html','utf8'));
const browser=await chromium.launch({headless:true,executablePath:[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p)),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost/**',route=>{const pathname=new URL(route.request().url()).pathname;if(pathname==='/public-page')return route.fulfill({contentType:'text/html',body:publicFixture});if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});if(pathname.endsWith('.js')&&!pathname.includes('thebe-live-voice')&&!pathname.includes('property-visibility'))return route.fulfill({contentType:'application/javascript',body:''});if(process.env.THEBE_DOCK_BASELINE&&pathname==='/assets/thebe-spatial-dock-v246.css')return route.fulfill({contentType:'text/css',body:''});const file='public'+pathname;return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''})});
 await page.addInitScript(()=>{window.currentWorkspaceRole=()=> 'owner';window.apiJson=async()=>({sessionCreationAllowed:false});});
 await page.goto('http://localhost/');await page.waitForSelector('#thebeAiDock');
 for(const width of [1440,1180,1024]){
  await page.setViewportSize({width,height:960});
  const geometry=await page.evaluate(()=>{const d=document.getElementById('thebeAiDock').getBoundingClientRect(),m=document.getElementById('mainContent').getBoundingClientRect(),c=document.querySelector('.property-calculator-v224').getBoundingClientRect();return {dock:{left:d.left,right:d.right},main:{left:m.left,right:m.right},card:{left:c.left,right:c.right,width:c.width},recovery:document.getElementById('thebeAiDock').dataset.cssRecovery}});
  assert(geometry.main.right<=geometry.dock.left,`dock overlaps business content at ${width}: ${JSON.stringify(geometry)}`);
  assert(geometry.card.width<=680&&geometry.card.width>0,`calculator must remain compact at ${width}: ${JSON.stringify(geometry)}`);
  await page.locator('#businessAction').click();
 }
 await page.evaluate(()=>{document.querySelector('.property-calculator-v224').style.setProperty('max-width','none','important');window.ThebePropertyVisibility.repair()});
 assert((await page.locator('.property-calculator-v224').boundingBox()).width<=680,'visibility recovery keeps compact geometry after a late style repair');
 await page.setViewportSize({width:1440,height:960});
 if(process.env.THEBE_SCREENSHOT_DIR){fs.mkdirSync(process.env.THEBE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.THEBE_SCREENSHOT_DIR,'dock-desktop.png')})}
 await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
 assert(await page.evaluate(()=>document.getElementById('mainContent').getBoundingClientRect().right<=document.getElementById('thebeAiDock').getBoundingClientRect().left),'expanded dock must reserve its width');
 // Business dialogs must own the interaction layer above the assistant.
 await page.evaluate(()=>{
  const modal=document.createElement('div');modal.className='modal open';modal.id='testBusinessModal';
  const action=document.createElement('button');action.textContent='Modal action';action.style.cssText='position:fixed;right:30px;top:150px;width:180px;height:50px';
  action.onclick=()=>{window.modalActionWorked=true};modal.append(action);document.body.append(modal);
 });
 await page.getByRole('button',{name:'Modal action',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.modalActionWorked),true,'dock cannot occlude dialog actions');
 await page.evaluate(()=>document.getElementById('testBusinessModal').remove());
 // Controlled status boundary: no live service or real microphone access.
 await page.evaluate(()=>{window.mediaRequests=0;window.apiJson=()=>new Promise(resolve=>window.resolveVoiceGate=resolve);navigator.mediaDevices.getUserMedia=async()=>{window.mediaRequests++;throw Error('unexpected microphone acquisition')}});
 await page.locator('.thebe-ai-orb-button').click();
 const screen=page.locator('#thebeVoiceScreen');assert(await screen.isVisible(),'voice activation opens dedicated screen');
 if(process.env.THEBE_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.THEBE_SCREENSHOT_DIR,'voice-fullscreen.png')});
 const rect=await screen.boundingBox();assert(rect.width===1440&&rect.height===960,'voice fills viewport');
 await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.getElementById('thebeVoiceScreen').contains(document.activeElement)),'focus stays inside native dialog');
 await page.keyboard.press('Escape');assert(!(await screen.isVisible()),'Escape closes voice');
 await page.evaluate(()=>window.resolveVoiceGate({sessionCreationAllowed:true}));
 await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>window.mediaRequests),0,'cancelled connection cannot acquire microphone');
 await page.evaluate(()=>{
  window.apiJson=async()=>({sessionCreationAllowed:true});
  navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.resolveMicrophone=resolve);
  window.pendingVoice=window.ThebeLiveVoice.start();
 });
 await page.waitForFunction(()=>typeof window.resolveMicrophone==='function');
 await page.evaluate(async()=>{window.ThebeLiveVoice.stop();window.stoppedTracks=0;window.resolveMicrophone({getTracks:()=>[{stop:()=>window.stoppedTracks++}]});await window.pendingVoice});
 assert.equal(await page.evaluate(()=>window.stoppedTracks),1,'microphone acquired after cancellation must be stopped');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.ThebeAiDock.close());
 await page.locator('#thebeAiDockPill').click();assert(await page.locator('#thebeAiDock').isVisible(),'mobile launcher opens compact conversation');
 await page.getByRole('button',{name:'Minimise Thebe dock'}).click();assert(!(await page.locator('#thebeAiDock').isVisible()),'mobile conversation closes');
 await page.setViewportSize({width:1440,height:960});await page.goto('http://localhost/public-page');await page.waitForSelector('#thebeAiDock');
 const publicGeometry=await page.evaluate(()=>{const m=document.querySelector('#marketingGate main'),d=document.getElementById('thebeAiDock').getBoundingClientRect();return {padding:Number.parseFloat(getComputedStyle(m).paddingRight),mainRight:m.getBoundingClientRect().right,dockLeft:d.left}});
 assert.equal(publicGeometry.padding,0,'public content must reserve the dock lane only once');
 assert(publicGeometry.mainRight<=publicGeometry.dockLeft,'public dock stays outside page content');
 assert.deepEqual(errors,[],'no browser errors');
 console.log('V246_SPATIAL_DOCK_BROWSER_PASS: compact Property, reserved dock, expansion, full-screen voice, focus, cancellation, mobile');
}finally{await browser.close()}
