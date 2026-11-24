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
const screenshotDir=process.env.THEBE_AURA_SCREENSHOT_DIR;
if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
async function capture(name){
  if(screenshotDir)await page.screenshot({path:path.join(screenshotDir,name+'.png'),animations:'disabled'});
}
page.setDefaultTimeout(7000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.route('http://aura.test/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      </head><body style="margin:0"><section id="marketingGate" style="display:none" hidden></section>
      <section id="appShell"><h1 id="pageTitle">Workspace</h1>
      <div class="view active" id="dashboard"></div></section></body></html>`});
    const file='public'+pathname;
    return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.addInitScript(()=>{
    window.currentWorkspaceRole=()=> 'owner';
    window.auraAnswerNumber=0;
    window.apiJson=async url=>url==='/api/ai/advisor'
      ?{answer:'Grounded test answer '+(++window.auraAnswerNumber),references:[]}
      :({sessionCreationAllowed:false});

  });
  await page.goto('http://aura.test/');
  await page.addScriptTag({content:"let currentUser={id:'fixture',displayName:'Tester Example'};"});
  await page.addStyleTag({path:path.resolve('public/assets/thebe-ai-dock.css')});
  await page.addScriptTag({path:path.resolve('public/js/thebe-live-voice.js')});
  await page.evaluate(()=>{
    window.auraVoice={state:'idle',muted:false,fail:false};
    window.ThebeLiveVoice={
      status:()=>({state:window.auraVoice.state}),
      start:async()=>{
        if(window.auraVoice.fail)throw new Error('Fixture network failure');
        window.auraVoice.state='connected';
        window.auraVoice.muted=false;
      },
      stop:()=>{window.auraVoice.state='idle'},
      setMuted:muted=>{window.auraVoice.muted=muted}
    };
  });
  await page.waitForFunction(()=>[...document.styleSheets].some(sheet=>sheet.href?.includes('thebe-ai-immersive-v1.css')));
  await page.evaluate(()=>window.ThebeAiDock.open());
  await page.locator('#thebeAiDock').waitFor({state:'visible'});
  await page.locator('.thebe-ai-expand').evaluate(button=>button.click());
  await page.waitForFunction(()=>{
    const d=document.getElementById('thebeAiDock');
    return d?.dataset.expanded==='true'&&getComputedStyle(d).backgroundImage==='none';
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
  assert.equal(await page.locator('#thebeAiDock').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)','Aura uses the approved flat black surface');
  assert.equal(await page.locator('.thebe-ai-expand').isVisible(),false,'redundant restore control is hidden');
  assert.equal(await page.locator('.thebe-ai-minimize svg').count(),1,'close is an encoding-independent icon');
  assert(initial.orb>=160,'fullscreen shows the large orb instead of compact pill');
  assert.equal(initial.greeting,'Hello Tester');
  assert(initial.ribbons>=4,'the orb includes luminous ribbon geometry');
  await page.locator('.thebe-ai-dock-scroll').focus();
  await capture('welcome-390');
  const voiceButton=page.getByRole('button',{name:'Start voice conversation with Thebe'});
  await voiceButton.click();
  await page.locator('body.thebe-voice-active').waitFor();
  await page.locator('#thebeVoiceScreen').waitFor({state:'hidden'});
  const mute=page.getByRole('button',{name:'Mute microphone',exact:true});
  assert.equal(await mute.locator('svg').count(),1,'mute uses a compact icon');
  await mute.click();
  assert(await page.evaluate(()=>window.auraVoice.muted));
  await page.getByRole('button',{name:'Unmute microphone',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.auraVoice.muted),false);
  await page.getByRole('button',{name:'End voice conversation'}).click();
  assert(await voiceButton.evaluate(el=>el===document.activeElement),'ending voice restores launch control focus');
  await page.evaluate(()=>{window.auraVoice.fail=true});
  await voiceButton.click();
  await page.getByText('Fixture network failure').waitFor();
  await page.evaluate(()=>{window.auraVoice.fail=false});
  await voiceButton.click();
  await page.locator('body.thebe-voice-active').waitFor();
  await page.evaluate(async()=>{
    await ThebeAiDock.ask('First question','ask');
    await ThebeAiDock.ask('Second question','ask');
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'input_audio_buffer.speech_started'}}}));
    dispatchEvent(new CustomEvent('thebe-live-audio-level',{detail:{channel:'input',level:0.8,brightness:0.75}}));
    dispatchEvent(new CustomEvent('thebe-live-audio-level',{detail:{channel:'output',level:0}}));
  });
  const conversation=await page.evaluate(()=>{
    const d=document.getElementById('thebeAiDock');
    const orb=d.querySelector('.thebe-particle-orb');
    return {
      turns:[...d.querySelectorAll('.thebe-aura-turn')].map(t=>t.textContent),
      latest:d.querySelector('#thebeAiDockResponse').textContent,
      level:parseFloat(orb.style.getPropertyValue('--thebe-audio-scale')),
      phase:orb.dataset.phase,
      tilt:parseFloat(orb.style.getPropertyValue('--thebe-aura-tilt'))
    };
  });
  assert(conversation.turns.some(x=>x.includes('First question')),'first question is retained');
  assert(conversation.turns.some(x=>x.includes('Grounded test answer 1')),'previous answer is retained');
  assert(conversation.turns.some(x=>x.includes('Second question')),'second question is retained');
  assert(conversation.latest.includes('Grounded test answer 2'),'newest answer is readable');
  assert.equal(conversation.phase,'listening');
  assert(conversation.level>1.05,'inactive output must not undo microphone response');
  assert(conversation.tilt>0,'measured spectral brightness changes ribbon angle');
  await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'response.output_audio_transcript.delta',delta:'Speaking now'}}}));
    dispatchEvent(new CustomEvent('thebe-live-audio-level',{detail:{channel:'output',level:0.9}}));
  });
  assert(await page.locator('.thebe-particle-orb').evaluate(el=>parseFloat(el.style.getPropertyValue('--thebe-audio-scale'))>1.08),'output audio also changes orb energy');
  await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'conversation.item.input_audio_transcription.delta',delta:'My live question'}}}));
  });
  await page.getByRole('log',{name:'Live voice transcription and history'}).getByText('My live question',{exact:false}).waitFor();
  assert.equal(await page.locator('#thebeAiDockTranscript').isVisible(),false,'live captions have one visible surface');
  await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'conversation.item.input_audio_transcription.completed',transcript:'My retained question'}}}));
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'response.output_audio_transcript.done',transcript:'My retained answer'}}}));
  });
  for(const [width,height] of [[320,800],[375,800],[390,844],[414,800],[430,800],[768,800],[1024,800],[1440,900],[844,390],[390,340]]){
    await page.setViewportSize({width,height});
    await capture('conversation-'+width+'x'+height);
    const geometry=await page.evaluate(()=>{
      const r=document.querySelector('#thebeAiDock .thebe-ai-compose').getBoundingClientRect();
      const d=document.querySelector('#thebeAiDock').getBoundingClientRect();
      return{left:r.left,right:r.right,bottom:r.bottom,dockRight:d.right,viewport:innerWidth,height:innerHeight};
    });
    assert(geometry.left>=0&&geometry.right<=width+1,`composer clips at ${width}: ${JSON.stringify(geometry)}`);
    assert(geometry.bottom<=geometry.height+1,`composer falls below viewport at ${width}`);
    for(const selector of ['.thebe-aura-mute','.thebe-aura-end','.thebe-ai-minimize','.thebe-ai-clear']){
      const r=await page.locator(selector).boundingBox();
      assert(r&&r.width>=44&&r.height>=44&&r.x>=0&&r.x+r.width<=width+1,`${selector} accessible at ${width}`);
    }
    assert.equal(await page.locator('.thebe-ai-compose').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    if(width===320){
      assert.equal(await page.locator('#thebeAiDockInput').getAttribute('placeholder'),'Ask…');
      assert((await page.locator('.thebe-ai-compose').boundingBox()).height<85,'empty narrow composer stays compact');
    }
    const log=page.getByRole('region',{name:'Conversation history and live transcription'});
    await log.focus();
    assert(await log.evaluate(el=>el===document.activeElement),'history is keyboard reachable');
  }
  // Simulate the visual viewport shrinking independently from the layout viewport.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:340});
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.locator('#thebeAiDockInput').focus();
  const keyboardComposer=await page.locator('.thebe-ai-compose').boundingBox();
  assert(keyboardComposer.y+keyboardComposer.height<=340,'composer clears simulated keyboard');
  await capture('keyboard-390');
  await page.evaluate(()=>{
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.thebe-aura-surface').evaluate(el=>getComputedStyle(el).transform),'none');
  assert.equal(await page.locator('.thebe-aura-surface').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('thebe-live-event',{detail:{event:{type:'response.done'}}}));
  });
  assert.equal(await page.locator('.thebe-particle-orb').evaluate(el=>el.style.getPropertyValue('--thebe-audio-scale')),'1.000','phase exit resets the audio transform');
  await page.getByRole('button',{name:'End voice conversation'}).click();
  assert.match(await page.locator('.thebe-ai-voice-chat-activity').innerText(),/My retained answer/,'voice history survives end');
  await page.evaluate(()=>window.ThebeAiDock.close());
  await page.evaluate(()=>window.ThebeAiDock.open());
  assert.match(await page.locator('.thebe-aura-history').innerText(),/First question/,'text history survives reopening');
  assert.match(await page.locator('.thebe-ai-voice-chat-activity').innerText(),/My retained question/,'voice history survives reopening');
  await page.evaluate(()=>{currentUser={id:'fixture',name:'Mothusi Banabothe'};window.ThebeAiDock.open()});
  assert.equal(await page.locator('.thebe-aura-hello').textContent(),'Hello Mothusi','profile name fallback is personalized');
  await page.evaluate(()=>{currentUser={id:'fixture',displayName:'private@example.com'};window.ThebeAiDock.open()});
  assert.equal(await page.locator('.thebe-aura-hello').textContent(),'Hello','email-only identity uses a safe greeting');
  await page.evaluate(()=>window.ThebeAiDock.clear());
  assert.equal(await page.locator('.thebe-aura-turn').count(),0,'clear deletes in-memory conversation');
  // The public desktop rail remains present, so close must exit fullscreen.
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{
    document.getElementById('appShell').style.display='none';
    const marketing=document.getElementById('marketingGate');marketing.hidden=false;marketing.style.display='block';
    document.getElementById('thebeAiDock').dataset.expanded='false';
    window.ThebeAiDock.open();
  });
  await page.locator('.thebe-ai-expand').evaluate(button=>button.click());
  await page.locator('.thebe-ai-minimize').click();
  assert.equal(await page.locator('#thebeAiDock').getAttribute('data-expanded'),'false','public desktop close returns to the compact rail');
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log('THEBE_AURA_IMMERSIVE_BROWSER_PASS: responsive orb, voice amplitude and visible conversation');
} finally {await browser.close();}
