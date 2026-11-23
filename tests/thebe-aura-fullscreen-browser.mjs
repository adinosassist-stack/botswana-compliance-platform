import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright') : 'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/chromium']
  .filter(Boolean).find(p=>fs.existsSync(p));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.route('http://aura.test/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      </head><body style="margin:0"><section id="marketingGate" style="display:none" hidden></section>
      <section id="appShell"><h1 id="pageTitle">Workspace</h1>
      <div class="view active" id="dashboard"></div></section></body></html>`});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.addInitScript(()=>{
    window.currentWorkspaceRole=()=> 'owner';
    window.currentUser={firstName:'Tester'};
    window.auraAnswerNumber=0;
    window.apiJson=async url=>url==='/api/ai/advisor'
      ?{answer:'Grounded test answer '+(++window.auraAnswerNumber),references:[]}
      :({sessionCreationAllowed:false});
    window.ThebeLiveVoice={status:()=>({state:'idle'}),start:async()=>{},stop:()=>{},setMuted:()=>{}};
  });
  await page.goto('http://aura.test/');
  await page.addStyleTag({path:path.resolve('public/assets/thebe-ai-dock.css')});
  await page.addScriptTag({path:path.resolve('public/js/thebe-live-voice.js')});
  await page.waitForFunction(()=>[...document.styleSheets].some(sheet=>sheet.href?.includes('thebe-ai-immersive-v1.css')));
  await page.evaluate(()=>window.ThebeAiDock.open());
  await page.locator('#thebeAiDock').waitFor({state:'visible'});
  await page.locator('.thebe-ai-expand').evaluate(button=>button.click());
  await page.waitForFunction(()=>{
    const d=document.getElementById('thebeAiDock');
    return d?.dataset.expanded==='true'&&getComputedStyle(d).backgroundImage.includes('gradient(');
  });
  const initial=await page.evaluate(()=>{
    const dock=document.getElementById('thebeAiDock');
    return {
      orb:dock.querySelector('.thebe-ai-orb-button').getBoundingClientRect().width,
      greeting:dock.querySelector('.thebe-aura-hello').textContent,
      question:getComputedStyle(dock.querySelector('.thebe-aura-question')).display,
      ribbons:dock.querySelectorAll('.thebe-aura-curve').length
    };
  });
  assert(initial.orb>=180,'fullscreen shows the large orb instead of compact pill');
  assert.equal(initial.greeting,'Hello Tester');
  assert(initial.ribbons>=4,'the orb includes luminous ribbon geometry');
  await page.evaluate(async()=>{
    await ThebeAiDock.ask('ask','First question');
    await ThebeAiDock.ask('ask','Second question');
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'input_audio_buffer.speech_started'}}}));
    dispatchEvent(new CustomEvent('thebe-live-audio-level',{detail:{channel:'input',level:0.8}}));
  });
  const conversation=await page.evaluate(()=>{
    const d=document.getElementById('thebeAiDock');
    const orb=d.querySelector('.thebe-particle-orb');
    return {
      turns:[...d.querySelectorAll('.thebe-aura-turn')].map(t=>t.textContent),
      latest:d.querySelector('#thebeAiDockResponse').textContent,
      level:parseFloat(orb.style.getPropertyValue('--thebe-audio-scale')),
      phase:orb.dataset.phase
    };
  });
  assert(conversation.turns.some(x=>x.includes('First question')),'first question is retained');
  assert(conversation.turns.some(x=>x.includes('Grounded test answer 1')),'previous answer is retained');
  assert(conversation.turns.some(x=>x.includes('Second question')),'second question is retained');
  assert(conversation.latest.includes('Grounded test answer 2'),'newest answer is readable');
  assert.equal(conversation.phase,'listening');
  assert(conversation.level>1.05,'real input audio level grows the orb');
  await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'response.output_audio_transcript.delta',delta:'Speaking now'}}}));
    dispatchEvent(new CustomEvent('thebe-live-audio-level',{detail:{channel:'output',level:0.9}}));
  });
  assert(await page.locator('.thebe-particle-orb').evaluate(el=>parseFloat(el.style.getPropertyValue('--thebe-audio-scale'))>1.08),'output audio also changes orb energy');
  for(const width of [320,375,414,430,768]){
    await page.setViewportSize({width,height:800});
    const geometry=await page.evaluate(()=>{
      const r=document.querySelector('#thebeAiDock .thebe-ai-compose').getBoundingClientRect();
      const d=document.querySelector('#thebeAiDock').getBoundingClientRect();
      return{left:r.left,right:r.right,bottom:r.bottom,dockRight:d.right,viewport:innerWidth,height:innerHeight};
    });
    assert(geometry.left>=0&&geometry.right<=width+1,`composer clips at ${width}: ${JSON.stringify(geometry)}`);
    assert(geometry.bottom<=geometry.height+1,`composer falls below viewport at ${width}`);
  }
  await page.evaluate(()=>window.ThebeAiDock.clear());
  assert.equal(await page.locator('.thebe-aura-turn').count(),0,'clear deletes in-memory conversation');
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log('THEBE_AURA_IMMERSIVE_BROWSER_PASS: responsive orb, voice amplitude and visible conversation');
} finally {await browser.close();}
