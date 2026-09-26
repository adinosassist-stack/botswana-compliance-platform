// Run with Playwright installed; CHROMIUM_EXECUTABLE_PATH may select an existing browser.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright') : 'playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 const root=fileURLToPath(new URL("..",import.meta.url));
 const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),"thebe-dock-"));
 const fixture=`<!doctype html><html><head><style>body{margin:0;font-family:Arial;background:#f5f7fa;color:#152338}header{height:72px;background:white;display:flex;align-items:center;padding:0 32px;border-bottom:1px solid #ddd}main{padding:50px;max-width:700px}h1{font-size:48px;font-weight:500}#appShell{display:none}#marketingGate{padding-right:var(--thebe-dock-w,380px)}@media(max-width:1023px){#marketingGate{padding-right:0}header{padding:0 16px}main{padding:24px}h1{font-size:32px}}</style></head><body><header>Thebe Desk</header><section id="marketingGate"><main><p>YOUR BUSINESS. CLEARER.</p><h1>More clarity.<br>Better decisions.</h1><p>Run your business with Thebe.</p></main></section><section id="appShell"><main><h1 id="pageTitle">Finance</h1><div class="view active" id="finance"></div></main></section></body></html>`;
 await page.route('http://dock.test/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/')return route.fulfill({contentType:'text/html',body:fixture});const local=root+'/public'+path;return fs.existsSync(local)?route.fulfill({path:local}):route.fulfill({status:404,body:''})});
 await page.goto('http://dock.test/');
 await page.addStyleTag({path:root+'/public/assets/thebe-ai-dock.css'});
 await page.evaluate(()=>{
   window.currentWorkspaceRole=()=> 'owner';
   window.apiJson=async()=>({sessionCreationAllowed:true,language:{supported:[{key:'english',label:'English'},{key:'setswana',label:'Setswana'},{key:'sekalaka',label:'Sekalaka'}]}});
 });
 await page.addScriptTag({path:root+'/public/js/thebe-live-voice.js'});
 await page.waitForSelector('#thebeAiDock');
 const dockCss=fs.readFileSync(root+'/public/assets/thebe-ai-dock.css','utf8');
 assert.match(dockCss,/V161 dock polish/);
 assert(!/gradient\\(/i.test(dockCss),'dock styling stays on the flat Thebe palette without gradients');
 const visual=await page.locator('#thebeAiDock').evaluate(el=>{
   const dockStyle=getComputedStyle(el);
   const voice=getComputedStyle(el.querySelector('.thebe-ai-voice-card'));
   const send=el.querySelector('.thebe-ai-send').getBoundingClientRect();
   const quick=el.querySelector('.thebe-ai-quick button').getBoundingClientRect();
   const composer=getComputedStyle(el.querySelector('.thebe-ai-compose textarea'));
   return {
     dockBackground:dockStyle.backgroundColor,
     voiceRadius:parseFloat(voice.borderRadius),
     composerRadius:parseFloat(composer.borderRadius),
     sendWidth:send.width,
     sendHeight:send.height,
     quickHeight:quick.height
   };
 });
 assert.equal(visual.dockBackground,'rgb(15, 17, 20)');
 assert(visual.voiceRadius>=16&&visual.composerRadius>=12,'dock cards use the refined rounded hierarchy');
 assert(visual.sendWidth>=44&&visual.sendHeight>=44&&visual.quickHeight>=52,'primary dock controls keep comfortable targets');
 assert.equal(await page.locator('.thebe-particle').count(),343);
 assert.equal(await page.locator('.thebe-ai-quick button').count(),3);
 assert.equal(await page.locator('#thebeAiDockPill').isVisible(),false);
 await page.screenshot({path:path.join(screenshots,'desktop.png')});
 const before=await page.locator('#thebeAiDock').boundingBox();
 await page.getByRole('button',{name:'Expand Thebe panel',exact:true}).click();
 const after=await page.locator('#thebeAiDock').boundingBox();assert(after.width>before.width);
 await page.getByRole('button',{name:'Restore Thebe panel width'}).click();
 await page.getByRole('button',{name:/What is Thebe Desk/}).click();
 assert.match(await page.locator('#thebeAiDockResponse').innerText(),/Thebe/);
 assert.equal(await page.locator('#thebeAiDock').getAttribute('data-conversation'),'true');
 const compactVoice=await page.locator('.thebe-ai-voice-card').evaluate(el=>({display:getComputedStyle(el).display,height:el.getBoundingClientRect().height}));
 assert.equal(compactVoice.display,'grid');
 assert(compactVoice.height<250,'conversation mode compacts the voice hero instead of leaving a tall decorative block');
 // Check real dock event wiring with an isolated transport, never call a live service.
 await page.evaluate(()=>{document.querySelector('#marketingGate').style.display='none';document.querySelector('#appShell').style.display='block';window.apiJson=()=>new Promise(resolve=>window.resolveDockRequest=resolve)});
 await page.waitForTimeout(100);
 assert.match(await page.locator('.thebe-ai-quick').innerText(),/unmatched/);
 assert.equal(await page.locator('#thebeLiveVoiceLanguage option').count(),4);
 assert(await page.locator('#thebeLiveVoiceLanguage').isVisible());
 await page.locator('#thebeAiDockInput').fill('Review my cash');await page.locator('.thebe-ai-send').click();
 await page.locator('#thebeAiDockInput').fill('Keep this draft');await page.locator('#thebeAiDockInput').press('Enter');
 assert.equal(await page.locator('#thebeAiDockInput').inputValue(),'Keep this draft');
 await page.evaluate(()=>window.resolveDockRequest({answer:'Cash records are incomplete.',actions:[{title:'Upload a statement',reason:'Verify the current balance.'}]}));
 await page.waitForTimeout(50);assert.match(await page.locator('#thebeAiDockResponse').innerText(),/Cash records are incomplete/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'input_audio_buffer.speech_started'}}})));
 assert.equal(await page.locator('.thebe-particle-orb').getAttribute('data-phase'),'listening');
 assert.equal(await page.locator('.thebe-ai-orb-button').getAttribute('aria-label'),'Stop Thebe voice');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.thebe-particle-wave g').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 for(const width of [320,390,768,1023,1024,1440]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(60);
  await page.evaluate(()=>window.ThebeAiDock.open());
  const box=await page.locator('#thebeAiDock').boundingBox();
  assert(box.x>=0&&box.x+box.width<=width+1,'dock inside viewport '+width);
  if(width<1024)assert(box.y+box.height<=740,'dock clears 104px navigation zone');
  for(const sel of ['.thebe-ai-dock-head','.thebe-ai-compose','.thebe-ai-foot']){const b=await page.locator(sel).boundingBox();assert(b.y>=box.y&&b.y+b.height<=box.y+box.height+1,sel+' remains visible '+width)}
  if(width===390)await page.screenshot({path:path.join(screenshots,'mobile.png')});
  if(width<1024){await page.locator('#thebeAiDockInput').press('Escape');assert(await page.locator('#thebeAiDockPill').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'thebeAiDockPill')}
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
   window.ThebeAiDock.open();
   const viewport=window.visualViewport;
   Object.defineProperty(viewport,'height',{configurable:true,value:380});
   viewport.dispatchEvent(new Event('resize'));
 });
 const keyboardBox=await page.locator('#thebeAiDock').boundingBox();
 assert(keyboardBox.y>=0&&keyboardBox.y+keyboardBox.height<=380,'composer clears simulated keyboard');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('thebe-live-state',{detail:{state:'idle'}})));
 assert.equal(await page.locator('.thebe-ai-orb-button').getAttribute('aria-pressed'),'false');
 await browser.close();console.log('PASS: responsive bounds, navigation clearance, expansion, context actions, chat submission, draft preservation, voice state, reduced motion, keyboard focus.');
})();
