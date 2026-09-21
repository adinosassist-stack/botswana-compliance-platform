import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const NAVIGATION_TIMEOUT_MS=30000;
const WORKSPACE_TIMEOUT_MS=40000;
const VIEW_TIMEOUT_MS=5000;
const CLOSE_TIMEOUT_MS=5000;
const MIN_OWNER_VIEW_COUNT=40;
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));

function assert(condition,message){if(!condition)throw new Error(`Synthetic full-user proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}
function withDeadline(label,promise,ms){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} deadline ${ms}ms exceeded`)),ms)})
  ]).finally(()=>clearTimeout(timer));
}
function logicalApiPath(raw){
  try{
    const url=new URL(raw);
    if(url.origin!==ORIGIN)return '';
    if(url.pathname==='/'){
      const tunneled=url.searchParams.get('__thebe_api_path');
      return tunneled&&String(tunneled).startsWith('/api/')?String(tunneled):'';
    }
    if(url.pathname==='/__thebe_api')return '/api';
    if(url.pathname.startsWith('/__thebe_api/'))return `/api/${url.pathname.slice('/__thebe_api/'.length)}`;
    return url.pathname==='/api'||url.pathname.startsWith('/api/')?url.pathname:'';
  }catch{return ''}
}

assert(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    try{
      const response=await fetch('/api/auth/login',{
        method:'POST',credentials:'same-origin',redirect:'error',
        headers:{'accept':'application/json','content-type':'application/json'},
        body:JSON.stringify({email,password})
      });
      let body=null;try{body=await response.json()}catch{}
      return {status:response.status,ok:body?.ok===true,role:body?.user?.role||'',error:body?.error||''};
    }catch(error){return {status:0,ok:false,role:'',error:String(error?.name||error||'login_failed')}}
  },credentials);
  assert(result.status===200&&result.ok&&result.role==='owner',`owner login failed HTTP ${result.status} ${safe(result.error)}`);
}

async function waitForWorkspace(page){
  await page.waitForFunction(()=>{
    const shell=document.getElementById('appShell'),marketing=document.getElementById('marketingGate'),auth=document.getElementById('authGate');
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return !shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&
      !!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
  },null,{timeout:WORKSPACE_TIMEOUT_MS});
}

async function runFullUserJourney(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const pageErrors=[];const assetFailures=[];const apiServerFailures=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100},screen:{width:1440,height:1100}});
    await context.grantPermissions(['microphone'],{origin:ORIGIN});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.on('pageerror',error=>pageErrors.push(safe(error?.stack||error)));
    page.on('requestfailed',request=>{
      const url=request.url();
      if(url.startsWith(`${ORIGIN}/js/`)||url.startsWith(`${ORIGIN}/assets/`))assetFailures.push(`${request.method()} ${url} ${safe(request.failure()?.errorText||'failed')}`);
    });
    page.on('response',response=>{
      const path=logicalApiPath(response.url());
      if(path&&response.status()>=500)apiServerFailures.push(`${response.request().method()} ${path} HTTP ${response.status()}`);
    });

    const publicRoot=await page.goto(`${ORIGIN}/?full-user-public-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    assert(publicRoot?.status()===200,`public root returned HTTP ${publicRoot?.status()||0}`);
    const publicState=await page.evaluate(()=>({hero:(document.querySelector('.hero h1')?.textContent||'').trim(),hasWorkspace:!!document.getElementById('appShell'),hasAuthForm:!!document.getElementById('authForm')}));
    assert(/business risk/i.test(publicState.hero),'public root hero missing');
    assert(!publicState.hasWorkspace&&!publicState.hasAuthForm,'public root leaked workspace or authentication shell');
    await page.waitForFunction(()=>{
      const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
      if(!dock||!pill)return false;
      const style=getComputedStyle(dock),rect=dock.getBoundingClientRect(),pillStyle=getComputedStyle(pill);
      return !dock.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>280&&rect.height>300&&
        pill.hidden&&pillStyle.display==='none'&&dock.dataset.surface==='public';
    },null,{timeout:15000});
    const publicDock=await page.evaluate(()=>({
      release:String(globalThis.ThebeAiDock?.release||''),
      dockHidden:document.getElementById('thebeAiDock')?.hidden??true,
      pillHidden:document.getElementById('thebeAiDockPill')?.hidden??true,
      pillDisplay:getComputedStyle(document.getElementById('thebeAiDockPill')).display,
      minimizeDisplay:getComputedStyle(document.querySelector('#thebeAiDock .thebe-ai-minimize')).display,
      surface:document.getElementById('thebeAiDock')?.dataset.surface||'',
      mobile:Boolean(globalThis.ThebeAiDock?.state?.().mobile)
    }));
    assert(publicDock.surface==='public'&&!publicDock.mobile&&!publicDock.dockHidden&&publicDock.pillHidden&&publicDock.pillDisplay==='none',
      'desktop public homepage must keep the full Thebe dock visible and never render the pill');
    assert(publicDock.minimizeDisplay==='none','desktop Thebe dock must not expose the mobile minimise control');
    mark('Thebe desktop persistence',`release=${publicDock.release} full public dock fixed open; pill/minimise hidden`);
    const marketingCopy=await page.evaluate(()=>({
      quick:[...document.querySelectorAll('#thebeAiDock .thebe-ai-quick button')].map(x=>(x.textContent||'').trim()),
      sub:(document.querySelector('#thebeAiDock .thebe-ai-voice-sub')?.textContent||'').trim(),
      sharedApiRuntime:typeof globalThis.BW?.api?.createClient==='function'
    }));
    assert(marketingCopy.sharedApiRuntime,'public marketing page did not load the centralized BW API runtime required by voice');
    assert(marketingCopy.quick.some(x=>/What is Thebe Desk/i.test(x)),'public Thebe dock did not expose product explainer prompts');
    assert(/ask about Thebe Desk/i.test(marketingCopy.sub),'public Thebe dock did not advertise voice sampling');
    const syntheticAudio=await page.evaluate(async()=>{
      try{
        const AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!AudioContextCtor)return {ok:false,error:'AudioContext unavailable'};
        const context=new AudioContextCtor();
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        const destination=context.createMediaStreamDestination();
        gain.gain.value=0.015;
        oscillator.frequency.value=220;
        oscillator.connect(gain);gain.connect(destination);oscillator.start();
        const track=destination.stream.getAudioTracks()[0];
        if(!track)return {ok:false,error:'synthetic audio track unavailable'};
        globalThis.__thebeSyntheticVoiceAudio={context,oscillator,gain,destination,track};
        const mediaDevices=navigator.mediaDevices;
        if(!mediaDevices)return {ok:false,error:'mediaDevices unavailable'};
        Object.defineProperty(mediaDevices,'getUserMedia',{
          configurable:true,
          value:async()=>new MediaStream([track.clone()])
        });
        return {ok:true,trackState:track.readyState,contextState:context.state};
      }catch(error){return {ok:false,error:String(error?.message||error)}}
    });
    assert(syntheticAudio.ok,`synthetic marketing voice audio unavailable: ${safe(syntheticAudio.error)}`);
    const marketingVoiceStart=await page.evaluate(async()=>{
      try{return await globalThis.ThebeLiveVoice.start({mode:'marketing'})}
      catch(error){
        return {
          error:String(error?.message||error),
          status:Number(error?.status||0),
          code:String(error?.code||''),
          data:error?.data||error?.body||null
        };
      }
    });
    const billingInactive=marketingVoiceStart?.data?.providerCode==='billing_not_active'||marketingVoiceStart?.data?.providerType==='billing_not_active';
    if(billingInactive){
      for(let index=apiServerFailures.length-1;index>=0;index--){
        if(/^POST \/api\/agentic\/live\/marketing\/session HTTP 502$/.test(apiServerFailures[index]))apiServerFailures.splice(index,1);
      }
      mark('Thebe public voice sample','DEFERRED provider billing inactive; public marketing voice path reached OpenAI and failed with explicit billing_not_active');
      await page.waitForFunction(()=>globalThis.ThebeLiveVoice?.status?.().state==='idle',null,{timeout:20000}).catch(()=>{});
    }else{
      assert(!marketingVoiceStart?.error,
        `public marketing voice failed to start: ${safe(marketingVoiceStart?.error)} status=${marketingVoiceStart?.status||0} code=${safe(marketingVoiceStart?.code||'')} data=${safe(JSON.stringify(marketingVoiceStart?.data||null))}`);
      await page.waitForFunction(()=>globalThis.ThebeLiveVoice?.status?.().state==='connected',null,{timeout:20000});
      const marketingVoiceState=await page.evaluate(()=>globalThis.ThebeLiveVoice.status());
      assert(marketingVoiceState.mode==='marketing'&&marketingVoiceState.maxSessionSeconds<=60,'public voice sample did not use bounded marketing mode');
      await page.evaluate(()=>globalThis.ThebeLiveVoice.stop());
      await page.waitForFunction(()=>globalThis.ThebeLiveVoice?.status?.().state==='idle',null,{timeout:20000});
      mark('Thebe public voice sample','real WebRTC marketing session connected with synthetic browser audio and closed cleanly');
    }
    await page.evaluate(async()=>{
      const audio=globalThis.__thebeSyntheticVoiceAudio;
      try{audio?.oscillator?.stop()}catch{}
      try{audio?.track?.stop()}catch{}
      try{await audio?.context?.close?.()}catch{}
      delete globalThis.__thebeSyntheticVoiceAudio;
    });
    mark('full-user public boundary','plain root rendered the public-only homepage');

    const auth=await page.goto(`${ORIGIN}/auth/?mode=login&full-user-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    assert(auth?.status()===200,`auth surface returned HTTP ${auth?.status()||0}`);
    assert(await page.locator('#authForm').count(),'auth surface form missing');
    assert(!(await page.locator('#appShell').count()),'auth surface leaked workspace shell');
    await login(page,credentials);
    mark('full-user isolated auth','synthetic owner authenticated from the dedicated auth surface');

    const app=await page.goto(`${ORIGIN}/app/?full-user-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    assert(app?.status()===200,`app surface returned HTTP ${app?.status()||0}`);
    await waitForWorkspace(page);
    await page.reload({waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    await waitForWorkspace(page);
    mark('full-user workspace bootstrap','synthetic owner reached the authenticated /app/ workspace after reload');

    const delegatedRuntime=await page.evaluate(()=>({
      ready:typeof globalThis.BW?.events?.runExpression==='function',
      coreScripts:[...document.querySelectorAll('script[src]')].map(node=>new URL(node.src,location.href).pathname).filter(path=>['/js/dom-security.js','/js/event-delegation.js','/js/notifications.js','/js/dialog-service.js','/js/api-client.js','/js/state-store.js','/js/components.js'].includes(path)),
      badNestedAssets:performance.getEntriesByType('resource').map(entry=>{try{return new URL(entry.name).pathname}catch{return ''}}).filter(path=>path.startsWith('/app/js/')||path.startsWith('/app/assets/'))
    }));
    assert(delegatedRuntime.ready,'delegated data-bw action runtime did not load on /app/');
    assert(delegatedRuntime.coreScripts.length===7,`expected 7 root-level workspace core scripts, got ${delegatedRuntime.coreScripts.length}`);
    assert(delegatedRuntime.badNestedAssets.length===0,`workspace requested nested /app assets: ${safe(delegatedRuntime.badNestedAssets.join(', '))}`);
    const firstRunModal=page.locator('#onboardModal.open');
    if(await firstRunModal.count()){
      const finishLater=page.locator('#onboardModal button:has-text("Finish later"):visible').first();
      assert(await finishLater.count(),'visible Finish later control missing');
      await finishLater.click();
      await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      mark('workspace onboarding button','Finish later closed the first-run dialog through the real click path');
    }
    await page.evaluate(()=>globalThis.showView?.('dashboard',{skipDataRefresh:true}));
    await page.waitForFunction(()=>document.getElementById('dashboard')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const delegatedWorkButton=page.locator("[data-bw-onclick=\"showView('workhub')\"]:visible").first();
    assert(await delegatedWorkButton.count(),'visible delegated Home -> Work button missing');
    await delegatedWorkButton.click();
    await page.waitForFunction(()=>document.getElementById('workhub')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    mark('workspace delegated button actions','visible data-bw-onclick navigation executed through event-delegation.js on /app/');

    const delegatedPeopleButton=page.locator('#nav button[data-view="peopleops"]:visible').first();
    assert(await delegatedPeopleButton.count(),'visible delegated People button missing');
    await delegatedPeopleButton.click();
    await page.waitForFunction(()=>{
      const view=document.getElementById('peopleops');
      return view?.classList.contains('active')&&view?.dataset?.lazyHydrated==='1';
    },null,{timeout:VIEW_TIMEOUT_MS});
    const peopleContent=await page.locator('#peopleops').innerText();
    assert(/People & operations/i.test(peopleContent),`People view hydrated unexpected content: ${safe(peopleContent.slice(0,240))}`);
    assert(!/Ruleset integrity|Sources in this prototype/i.test(peopleContent),`People view leaked regulatory-source prototype copy: ${safe(peopleContent.slice(0,240))}`);
    const workspaceAssetIdentity=await page.evaluate(()=>({
      runtime:[...document.querySelectorAll('script[src]')].map(node=>new URL(node.src,location.href).pathname).find(path=>path.startsWith('/js/workspace-runtime-'))||'',
      fragments:performance.getEntriesByType('resource').map(entry=>{try{return new URL(entry.name).pathname}catch{return ''}}).filter(path=>path.startsWith('/assets/workspace-view-fragments-'))
    }));
    assert(workspaceAssetIdentity.runtime==='/js/workspace-runtime-20260921d.js',`stale workspace runtime identity: ${safe(workspaceAssetIdentity.runtime||'missing')}`);
    assert(workspaceAssetIdentity.fragments.some(path=>path.startsWith('/assets/workspace-view-fragments-20260921c-')),`rotated People fragment was not fetched: ${safe(workspaceAssetIdentity.fragments.join(', '))}`);
    mark('workspace People semantic content','real People click hydrated People & operations from the rotated fragment release with no ruleset-integrity copy leakage');

    await page.evaluate(()=>globalThis.showView?.('dashboard',{skipDataRefresh:true}));

    await page.waitForFunction(()=>{
      const api=globalThis.ThebeAiDock,dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
      if(!api||!dock||!pill)return false;
      const state=typeof api.state==='function'?api.state():null;
      const style=getComputedStyle(dock),rect=dock.getBoundingClientRect();
      return state?.workspaceVisible===true&&state?.collapsed===false&&dock.hidden===false&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>250&&rect.height>250&&rect.right<=innerWidth+1;
    },null,{timeout:WORKSPACE_TIMEOUT_MS});
    const dockInitial=await page.evaluate(()=>({release:String(globalThis.ThebeAiDock?.release||''),state:globalThis.ThebeAiDock?.state?.()||null}));
    const appHeaders=await app.allHeaders();
    const expectedDockRelease=String(appHeaders['x-thebe-ai-dock']||'');
    assert(/^\d{8}[a-z]$/.test(dockInitial.release),`unexpected Thebe dock release ${safe(dockInitial.release||'missing')}`);
    assert(expectedDockRelease&&dockInitial.release===expectedDockRelease,`Thebe dock release mismatch runtime=${safe(dockInitial.release||'missing')} server=${safe(expectedDockRelease||'missing')}`);
    assert(dockInitial.state?.workspaceVisible===true&&dockInitial.state?.dockHidden===false,'Thebe dock was not visibly mounted after owner workspace readiness');

    await page.evaluate(()=>globalThis.ThebeAiDock.close());
    await page.waitForFunction(()=>{
      const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
      if(!dock||!pill)return false;
      const dockStyle=getComputedStyle(dock),pillStyle=getComputedStyle(pill),state=globalThis.ThebeAiDock?.state?.();
      return state?.mobile===false&&state?.collapsed===false&&dock.hidden===false&&dockStyle.display!=='none'&&dockStyle.visibility!=='hidden'&&pill.hidden===true&&pillStyle.display==='none';
    },null,{timeout:VIEW_TIMEOUT_MS});
    mark('Thebe dock authenticated visibility',`release=${dockInitial.release} visible after workspace-ready; desktop close() remained a no-op and pill stayed hidden`);

    const views=await page.evaluate(()=>{
      const roleCheck=typeof globalThis.roleCanView==='function'?globalThis.roleCanView:null;
      const unique=[];
      for(const button of document.querySelectorAll('#nav button[data-view]')){
        const view=String(button.dataset.view||'').trim();
        if(!view||unique.includes(view)||button.style.display==='none')continue;
        if(roleCheck&&!roleCheck(view))continue;
        unique.push(view);
      }
      return unique;
    });
    assert(views.length>=MIN_OWNER_VIEW_COUNT,`only ${views.length} owner-visible views were discoverable; expected at least ${MIN_OWNER_VIEW_COUNT}`);

    for(const view of views){
      const result=await withDeadline(`view ${view}`,page.evaluate(async targetView=>{
        const target=document.getElementById(targetView);
        const show=globalThis.showView;
        if(!target||typeof show!=='function')return {ok:false,exists:!!target,active:false,title:''};
        const ok=show(targetView,{skipDataRefresh:true});
        await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,30)));
        return {
          ok:ok===true,
          exists:true,
          active:target.classList.contains('active'),
          title:String(document.getElementById('pageTitle')?.textContent||'').trim(),
          shellVisible:!document.getElementById('appShell')?.classList.contains('hidden')
        };
      },view),VIEW_TIMEOUT_MS);
      assert(result.ok&&result.exists&&result.active&&result.shellVisible,`view ${view} did not activate in the owner workspace`);
      assert(result.title.length>0,`view ${view} activated without a page title`);
    }

    assert(pageErrors.length===0,`page errors: ${safe(pageErrors.join(' | '))}`);
    assert(assetFailures.length===0,`critical asset failures: ${safe(assetFailures.join(' | '))}`);
    assert(apiServerFailures.length===0,`same-origin API 5xx responses: ${safe(apiServerFailures.join(' | '))}`);
    mark('full-user owner view matrix',`${views.length} role-visible views activated read-only with no page, asset, or API 5xx failures`);
    await context.close();
  }finally{
    await withDeadline('full-user browser close',browser.close().catch(()=>{}),CLOSE_TIMEOUT_MS).catch(()=>{});
  }
}

const priorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
let intercepted=false;
Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
  configurable:true,
  set(originalProof){
    assert(typeof originalProof==='function','canonical browser proof hook assignment was not a function');
    intercepted=true;
    Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
      configurable:true,writable:true,
      value:async credentials=>{
        await originalProof(credentials);
        await runFullUserJourney(credentials);
      }
    });
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  assert(intercepted,'canonical browser lifecycle did not install its proof hook');
  mark('mandatory full-user synthetic wrapper','canonical registration/reload/mobile proof + separated public/auth/app journey + exhaustive owner view matrix completed before cleanup');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}
