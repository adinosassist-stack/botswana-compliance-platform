import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {injectOwnerCommandCentreAssets,externalizeWorkspaceHeadStyles} from '../cloudflare/src/production-entry.js';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const html=fs.readFileSync('public/index.html','utf8');
const propertyStart=html.indexOf('  <section id="propertyintelligence"');
const propertyEnd=html.indexOf('</section>',propertyStart)+10;
const property=html.slice(propertyStart,propertyEnd).replace('class="view simplified-hub','class="view active simplified-hub');
let fixture=externalizeWorkspaceHeadStyles('<!doctype html>'+html.slice(html.indexOf('<html'),html.indexOf('</head>')+7)+'<body><section id="marketingGate" class="hidden" style="display:none"></section><section id="appShell" class="shell"><aside id="workspaceSidebar"><button>Home</button></aside><main id="mainContent"><div class="top"><h1 id="pageTitle">Property</h1></div>'+property+'</main></section></body></html>');
fixture=injectOwnerCommandCentreAssets(fixture);
fixture=versionReleaseAssets(fixture,'a'.repeat(40),{includeWorkspaceFixes:true});

const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});

try{
  for(const workspace of [false,true]){
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let captured=null,resolveReview;
    await page.exposeFunction('reviewFiles',body=>{captured=JSON.parse(body);return new Promise(resolve=>{resolveReview=resolve})});
    await page.route('http://localhost/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/'){
        const document=workspace?fixture:fixture.replace('id="marketingGate" class="hidden" style="display:none"','id="marketingGate"').replace('id="appShell" class="shell"','id="appShell" class="shell hidden" style="display:none"');
        return route.fulfill({contentType:'text/html',body:document});
      }
      if(pathname.endsWith('.js')&&!pathname.includes('thebe-live-voice')&&!pathname.includes('thebe-dock-recovery-geometry-v269'))return route.fulfill({contentType:'application/javascript',body:''});
      const file='public'+pathname;
      return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
    });
    await page.addInitScript(()=>{
      window.currentWorkspaceRole=()=> 'owner';
      window.apiJson=async(url,opts)=>url==='/api/ai/advisor'?window.reviewFiles(opts.body):({sessionCreationAllowed:false});
    });
    await page.goto('http://localhost/');
    await page.waitForSelector('#thebeAiDock',{state:'attached'});
    if(workspace)await page.locator('#thebeAiDockPill').click();
    const dock=page.locator('#thebeAiDock'),input=page.locator('#thebeAiDockInput');
    const audio=dock.locator('.thebe-ai-audio'),send=dock.locator('.thebe-ai-send'),plus=dock.locator('.thebe-ai-attach');
    await dock.waitFor({state:'visible'});
    if(workspace){
      const presets=dock.locator('.thebe-ai-quick');
      assert.equal(await presets.isVisible(),false,'workspace dock must not show preset question tiles');
      assert(await input.isVisible(),'workspace composer remains available without presets');
    }
    assert(await audio.isVisible(),'idle voice is available');assert(await send.isHidden(),'idle send hidden');
    assert.equal(await plus.isVisible(),workspace,'files restricted to workspace');
    await input.fill('a');assert(await send.isVisible(),'one character offers send');assert(await audio.isHidden());
    await input.fill('');assert(await audio.isVisible(),'clearing restores voice');
    await page.evaluate(()=>{window.voiceStarts=[];window.ThebeLiveVoice={status:()=>({state:'idle'}),start:async options=>{window.voiceStarts.push(options)},stop:()=>{}}});
    await audio.click();await page.locator('#thebeVoiceScreen').waitFor({state:'visible'});
    await page.waitForFunction(()=>window.voiceStarts.length===1);
    assert.equal(await page.evaluate(()=>voiceStarts[0].mode),workspace?'workspace':'marketing');
    await page.locator('.thebe-voice-exit').click();
    if(workspace){
      const resize=dock.locator('.thebe-workspace-dock-resize-handle');
      await resize.waitFor({state:'visible'});
      const beforeWidth=await dock.evaluate(el=>el.getBoundingClientRect().width);
      await resize.press('ArrowLeft');
      await page.waitForFunction(previous=>document.querySelector('#thebeAiDock').getBoundingClientRect().width>previous,beforeWidth);
      const resized=await page.evaluate(()=>{
        const dock=document.querySelector('#thebeAiDock');
        const main=document.querySelector('#mainContent');
        const dockRect=dock.getBoundingClientRect();
        const mainRect=main.getBoundingClientRect();
        return {
          dockOuter:dockRect.width,
          dockLeft:dockRect.left,
          mainRight:mainRect.right,
          spatial:parseFloat(getComputedStyle(document.body).getPropertyValue('--thebe-spatial-width')),
          saved:Number(localStorage.getItem('thebe:workspace-dock:width:v1'))
        };
      });
      assert(resized.dockOuter>beforeWidth,'keyboard resize grows right-anchored workspace dock');
      assert(Number.isFinite(resized.spatial)&&resized.spatial>0,'workspace resize updates the spatial rail preference');
      assert(resized.mainRight<=resized.dockLeft,'workspace content remains outside the rendered dock footprint');
      assert.equal(resized.saved,Math.round(resized.spatial),'workspace dock width persists');
      await resize.press('Home');
      assert.equal(await page.evaluate(()=>localStorage.getItem('thebe:workspace-dock:width:v1')),null,'Home resets saved dock width');

      const file={name:'sales.txt',mimeType:'text/plain',buffer:Buffer.from('Sales total: P1200')};
      await dock.locator('input[type=file]').setInputFiles(file);
      assert(await send.isVisible(),'file-only draft offers send');assert(await audio.isHidden());
      assert(await dock.locator('.thebe-ai-attachments').isVisible());
      await dock.locator('.thebe-ai-attachments button').click();assert(await audio.isVisible(),'removing last file restores audio');
      await dock.locator('input[type=file]').setInputFiles(file);
      await send.click();await page.waitForFunction(()=>window.ThebeAiDock.state().textBusy);
      for(let i=0;i<100&&!captured;i++)await page.waitForTimeout(20);
      assert(captured,'workspace review submitted');assert.equal(Buffer.from(captured.attachments[0].data,'base64').toString(),'Sales total: P1200');
      assert(await plus.isDisabled(),'busy upload disabled');
      resolveReview({mode:'ask',summary:'Sales total is P1200.',priorities:[],references:[{ref:'FILE-1',type:'user_attachment',label:'sales.txt'}],caveats:['User-supplied file']});
      await page.waitForFunction(()=>!window.ThebeAiDock.state().textBusy);
      assert(await dock.locator('.thebe-ai-attachments').isHidden(),'successful review clears files');assert(await audio.isVisible());
      await dock.locator('input[type=file]').setInputFiles(file);
      await page.evaluate(()=>{document.querySelector('#appShell').style.display='none';document.querySelector('#marketingGate').style.display='block';document.querySelector('#marketingGate').classList.remove('hidden')});
      await page.waitForFunction(()=>!window.ThebeAiDock.state().workspaceVisible);
      assert(await dock.locator('.thebe-ai-attachments').isHidden(),'leaving workspace clears files');assert(await plus.isHidden());
      await page.evaluate(()=>{document.querySelector('#appShell').style.display='';document.querySelector('#marketingGate').style.display='none';document.querySelector('#marketingGate').classList.add('hidden')});
      await page.waitForFunction(()=>window.ThebeAiDock.state().workspaceVisible);
      if(await dock.isHidden())await page.locator('#thebeAiDockPill').click();
      await page.evaluate(()=>{window.apiJson=async()=>{throw new Error('Connection lost')}});
      await input.fill('Keep this question for retry');await send.click();
      await page.waitForFunction(()=>!window.ThebeAiDock.state().textBusy);
      assert.equal(await input.inputValue(),'Keep this question for retry','failed text requests preserve the question');
      captured=null;
      await page.evaluate(()=>{window.apiJson=async(url,opts)=>window.reviewFiles(opts.body)});
      await input.fill('Private workspace question');await send.click();
      await page.waitForFunction(()=>window.ThebeAiDock.state().textBusy);
      for(let i=0;i<100&&!captured;i++)await page.waitForTimeout(20);
      assert(captured,'text-only request started');
      await page.evaluate(()=>{document.querySelector('#appShell').style.display='none';document.querySelector('#marketingGate').style.display='block';document.querySelector('#marketingGate').classList.remove('hidden')});
      await page.waitForFunction(()=>!window.ThebeAiDock.state().workspaceVisible);
      assert.equal(await page.evaluate(()=>window.ThebeAiDock.state().textBusy),false,'leaving the workspace cancels text-only requests');
      resolveReview({summary:'Private late response must be discarded',references:[],priorities:[]});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert(!(await dock.innerText()).includes('Private late response'),'late private response cannot appear on public surface');
    }else{
      await input.fill('What does Thebe cost?');await send.click();
      assert((await dock.innerText()).match(/pricing|price|plan/i),'public question returns a useful answer');
      assert.equal(captured,null,'public never calls private advisor');
    }
    for(const width of [390,768,1100,1440]){
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(100);
      if(await dock.isHidden())await page.locator('#thebeAiDockPill').click();
      await dock.waitFor({state:'visible'});
      const geometry=await dock.locator('.thebe-ai-compose').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}});
      assert(geometry.left>=-1&&geometry.right<=geometry.width+1,'composer stays within viewport');
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('DOCK_COMPOSER_PASS public answers, audio activation, typing switch, workspace resize, file review, privacy reset and responsive containment');
}finally{await browser.close()}
