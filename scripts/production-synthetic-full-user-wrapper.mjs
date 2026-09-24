import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const NAVIGATION_TIMEOUT_MS=30000;
const WORKSPACE_TIMEOUT_MS=40000;
const VIEW_TIMEOUT_MS=5000;
const CLOSE_TIMEOUT_MS=5000;
const MIN_OWNER_VIEW_COUNT=40;
const MIN_OWNER_INVIEW_NAV_CONTROL_COUNT=25;
const MIN_SAFE_UI_ACTION_COUNT=5;
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

async function dismissFirstRunOnboardingIfNeeded(page){
  const deadline=Date.now()+3500;
  while(Date.now()<deadline){
    const modal=page.locator('#onboardModal.open').first();
    if(await modal.count()){
      const finishLater=modal.locator('[data-bw-onclick="dismissOnboarding()"]:visible, button:has-text("Finish later"):visible').first();
      assert(await finishLater.count(),'visible first-run onboarding dismissal control missing');
      await finishLater.click();
      await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      mark('workspace onboarding button','first-run onboarding closed through the real dismissal button before workspace action audit');
      return true;
    }
    const dismissed=await page.evaluate(()=>sessionStorage.getItem('bw_onboarding_dismissed')==='1');
    if(dismissed)return false;
    await page.waitForTimeout(125);
  }
  const modal=page.locator('#onboardModal.open').first();
  if(await modal.count()){
    const finishLater=modal.locator('[data-bw-onclick="dismissOnboarding()"]:visible, button:has-text("Finish later"):visible').first();
    assert(await finishLater.count(),'visible delayed first-run onboarding dismissal control missing');
    await finishLater.click();
    await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
    mark('workspace onboarding button','delayed first-run onboarding closed through the real dismissal button before workspace action audit');
    return true;
  }
  return false;
}

async function runFullUserJourney(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const pageErrors=[];const assetFailures=[];const apiServerFailures=[];const safeUiMutationRequests=[];
  let safeUiActionProbeActive=false;
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
    page.on('request',request=>{
      if(!safeUiActionProbeActive)return;
      const path=logicalApiPath(request.url()),method=request.method().toUpperCase();
      if(path&&!['GET','HEAD','OPTIONS'].includes(method))safeUiMutationRequests.push(method+' '+path);
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
    await dismissFirstRunOnboardingIfNeeded(page);

    // Wide-mobile / landscape regression: the bottom dock is enabled up to 1000px,
    // so prove its opaque shield and drawer at a viewport that used to miss the <=760px hardening.
    await page.setViewportSize({width:844,height:390});
    await page.waitForFunction(()=>{
      const bar=document.getElementById('mobileBar'),shield=document.querySelector('.mobile-nav-occlusion');
      if(!bar||!shield)return false;
      const barStyle=getComputedStyle(bar),shieldStyle=getComputedStyle(shield);
      return barStyle.display!=='none'&&shieldStyle.display!=='none'&&shield.getBoundingClientRect().height>=80;
    },null,{timeout:VIEW_TIMEOUT_MS});
    const wideMobileOcclusion=await page.evaluate(()=>{
      const bar=document.getElementById('mobileBar'),shield=document.querySelector('.mobile-nav-occlusion'),main=document.querySelector('main');
      const barStyle=getComputedStyle(bar),shieldStyle=getComputedStyle(shield),mainRect=main.getBoundingClientRect(),shieldRect=shield.getBoundingClientRect();
      const opaque=value=>!/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(String(value||''))&&String(value||'')!=='transparent';
      return {
        barDisplay:barStyle.display,
        barOpaque:opaque(barStyle.backgroundColor),
        shieldDisplay:shieldStyle.display,
        shieldOpaque:opaque(shieldStyle.backgroundColor),
        shieldHeight:Math.round(shieldRect.height),
        mainBottom:Math.round(mainRect.bottom),
        shieldTop:Math.round(shieldRect.top),
        mainOverflowY:getComputedStyle(main).overflowY
      };
    });
    assert(wideMobileOcclusion.barDisplay!=='none'&&wideMobileOcclusion.barOpaque,'wide-mobile bottom navigation is missing or translucent');
    assert(wideMobileOcclusion.shieldDisplay!=='none'&&wideMobileOcclusion.shieldOpaque&&wideMobileOcclusion.shieldHeight>=80,'wide-mobile bottom navigation lacks an opaque occlusion shield');
    assert(wideMobileOcclusion.mainOverflowY==='auto'&&wideMobileOcclusion.mainBottom<=wideMobileOcclusion.shieldTop+1,`wide-mobile workspace still extends beneath bottom navigation: ${safe(JSON.stringify(wideMobileOcclusion))}`);
    await page.locator('#mobileMenuButton').click();
    await page.waitForFunction(()=>document.body.classList.contains('mobile-nav-open'),null,{timeout:VIEW_TIMEOUT_MS});
    const wideMobileDrawer=await page.evaluate(()=>({
      mainVisibility:getComputedStyle(document.getElementById('mainContent')).visibility,
      backdropVisibility:getComputedStyle(document.querySelector('.mobile-nav-backdrop')).visibility,
      backdropOpacity:Number.parseFloat(getComputedStyle(document.querySelector('.mobile-nav-backdrop')).opacity)||0,
      barVisibility:getComputedStyle(document.getElementById('mobileBar')).visibility,
      shieldDisplay:getComputedStyle(document.querySelector('.mobile-nav-occlusion')).display,
      sidebarTransform:getComputedStyle(document.getElementById('workspaceSidebar')).transform
    }));
    assert(wideMobileDrawer.mainVisibility==='hidden','wide-mobile drawer leaves workspace text visible underneath');
    assert(wideMobileDrawer.backdropVisibility==='visible'&&wideMobileDrawer.backdropOpacity>=.99,'wide-mobile drawer backdrop is not fully visible');
    assert(wideMobileDrawer.barVisibility==='hidden'&&wideMobileDrawer.shieldDisplay==='none','bottom dock/shield did not leave the way for the full mobile drawer');
    assert(wideMobileDrawer.sidebarTransform==='none'||/matrix\\(1, 0, 0, 1, 0, 0\\)/.test(wideMobileDrawer.sidebarTransform),'wide-mobile sidebar did not slide fully into view');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.body.classList.contains('mobile-nav-open'),null,{timeout:VIEW_TIMEOUT_MS});
    await page.setViewportSize({width:1440,height:1100});
    mark('wide-mobile navigation occlusion','844px landscape breakpoint keeps workspace text out from under the bottom dock and full drawer');

    await page.evaluate(()=>globalThis.showView?.('dashboard',{skipDataRefresh:true}));
    await dismissFirstRunOnboardingIfNeeded(page);
    await page.waitForFunction(()=>document.getElementById('dashboard')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const delegatedWorkButton=page.locator("[data-bw-onclick=\"showView('workhub')\"]:visible").first();
    assert(await delegatedWorkButton.count(),'visible delegated Home -> Work button missing');
    await delegatedWorkButton.click();
    await page.waitForFunction(()=>document.getElementById('workhub')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    mark('workspace delegated button actions','visible data-bw-onclick navigation executed through event-delegation.js on /app/');

    const delegatedPeopleButton=page.locator('#nav button[data-view="peopleops"]:visible').first();
    assert(await delegatedPeopleButton.count(),'visible delegated People button missing');
    const peoplePreClick=await page.evaluate(()=>{
      const view=document.getElementById('peopleops');
      return {lazy:view?.dataset?.lazyView||'',hydrated:view?.dataset?.lazyHydrated||'',text:String(view?.innerText||'').slice(0,500)};
    });
    assert(!peoplePreClick.lazy,'People must be resident before click and must not depend on a lazy fragment');
    assert(/People & operations/i.test(peoplePreClick.text),`resident People markup missing before click: ${safe(peoplePreClick.text)}`);
    await delegatedPeopleButton.click();
    await page.waitForFunction(()=>document.getElementById('peopleops')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const peopleState=await page.evaluate(()=>{
      const view=document.getElementById('peopleops');
      return {active:!!view?.classList.contains('active'),lazy:view?.dataset?.lazyView||'',error:view?.dataset?.lazyError||'',text:String(view?.innerText||'').slice(0,700)};
    });
    assert(peopleState.active&&!peopleState.lazy&&!peopleState.error,`resident People navigation failed: ${safe(JSON.stringify(peopleState))}`);
    assert(/People & operations/i.test(peopleState.text),`People view showed unexpected content: ${safe(peopleState.text)}`);
    assert(!/Ruleset integrity|Sources in this prototype/i.test(peopleState.text),`People view leaked regulatory-source prototype copy: ${safe(peopleState.text)}`);
    const workspaceRuntimeProof=await page.evaluate(()=>({
      peopleLazy:document.getElementById('peopleops')?.dataset?.lazyView||'',
      deepLazy:document.getElementById('employees')?.dataset?.lazyView||'',
      showViewReady:typeof globalThis.showView==='function',
      hydrateReady:typeof globalThis.hydrateLazyWorkspaceView==='function'
    }));
    assert(!workspaceRuntimeProof.peopleLazy,'People unexpectedly became lazy in delivered /app/ HTML');
    assert(workspaceRuntimeProof.deepLazy==='1','deep workspace tools must remain lazy after primary hubs are made resident');
    assert(workspaceRuntimeProof.showViewReady,'live showView function missing from workspace runtime');
    assert(workspaceRuntimeProof.hydrateReady,'live lazy hydration function missing from workspace runtime');

    const peopleToolsGroup=page.locator('#nav details.nav-access-group').filter({hasText:'Operations & people'}).first();
    assert(await peopleToolsGroup.count(),'Operations & people navigation group missing');
    const peopleToolsSummary=peopleToolsGroup.locator('summary').first();
    assert(await peopleToolsSummary.count(),'Operations & people navigation summary missing');
    if(!(await peopleToolsGroup.evaluate(node=>node.open===true)))await peopleToolsSummary.click();
    await page.waitForFunction(()=>document.querySelector('#nav button[data-view="employees"]')?.offsetParent!==null,null,{timeout:VIEW_TIMEOUT_MS});
    const delegatedEmployeesButton=page.locator('#nav button[data-view="employees"]:visible').first();
    assert(await delegatedEmployeesButton.count(),'visible delegated Employees button missing after opening Operations & people');
    await delegatedEmployeesButton.click();
    await page.waitForFunction(()=>document.getElementById('employees')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    await page.waitForFunction(()=>{
      const view=document.getElementById('employees');
      return view?.dataset?.lazyHydrated==='1'||view?.dataset?.lazyError==='1';
    },null,{timeout:WORKSPACE_TIMEOUT_MS});
    const employeeLazyState=await page.evaluate(()=>{
      const view=document.getElementById('employees');
      return {
        active:!!view?.classList.contains('active'),
        hydrated:view?.dataset?.lazyHydrated==='1',
        error:view?.dataset?.lazyError==='1',
        stillLazy:view?.dataset?.lazyView||'',
        text:String(view?.innerText||'').slice(0,900)
      };
    });
    assert(employeeLazyState.active&&employeeLazyState.hydrated&&!employeeLazyState.error&&!employeeLazyState.stillLazy,`functional lazy workspace hydration failed: ${safe(JSON.stringify(employeeLazyState))}`);
    assert(/Employee records|Employee register|Employees|Staff register|staff/i.test(employeeLazyState.text),`Employees lazy view hydrated unexpected content: ${safe(employeeLazyState.text)}`);
    mark('workspace lazy runtime functional proof','real Employees click hydrated a deep lazy view through the self-contained versioned runtime');

    await delegatedPeopleButton.click();
    await page.waitForFunction(()=>document.getElementById('peopleops')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    mark('workspace People resident content','real People click opened resident People & operations immediately with no Ruleset/source leakage and no fragment dependency');

    // Mutating proof is safe here because the canonical lifecycle owns this isolated synthetic tenant and purges it after the browser returns.
    await delegatedEmployeesButton.click();
    await page.waitForFunction(()=>document.getElementById('employees')?.classList.contains('active')&&document.getElementById('eName'),null,{timeout:VIEW_TIMEOUT_MS});
    const syntheticEmployeeName=`Synthetic Reporter ${Date.now()}`;
    await page.locator('#eName').fill(syntheticEmployeeName);
    await page.locator('#eRole').fill('Synthetic Operations Tester');
    await page.locator('#eStart').fill(new Date().toISOString().slice(0,10));
    await page.locator('#eContract').selectOption('true');
    await page.locator('#eAsset').selectOption('true');
    const addEmployee=page.locator('#employees [data-bw-onclick="addEmployeeRecord()"]:visible').first();
    assert(await addEmployee.count(),'authoritative Add employee control missing');
    await addEmployee.click();
    await page.locator('#employeeRegister .item',{hasText:syntheticEmployeeName}).first().waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    mark('authoritative employee register','employee created through visible workspace form and reloaded from /api/employees');

    // Reporting setup is owned by resident People & Operations. Return there after
    // creating the employee instead of relying on the old Daily Reports DOM location.
    await delegatedPeopleButton.click();
    await page.waitForFunction(()=>document.getElementById('peopleops')?.classList.contains('active')&&document.getElementById('opsReportingSetupDetails'),null,{timeout:VIEW_TIMEOUT_MS});
    const setup=page.locator('#peopleops #opsReportingSetupDetails').first();assert(await setup.count(),'People reporting setup disclosure missing');
    if(!(await setup.evaluate(node=>node.open===true)))await setup.locator(':scope > summary').first().click();
    let locationName=`Synthetic Branch ${Date.now()}`;const locationCode=`S${String(Date.now()).slice(-7)}`;
    await page.locator('#peopleops #opsLocationName').fill(locationName);await page.locator('#peopleops #opsLocationCode').fill(locationCode);await page.locator('#peopleops #opsLocationTown').fill('Gaborone');
    const addLocation=page.locator('#peopleops [data-bw-onclick="addOpsLocation()"]:visible').first();assert(await addLocation.count(),'Add location control missing');
    await addLocation.click();
    await page.waitForFunction(name=>String(document.getElementById('opsLocationsList')?.innerText||'').includes(name),locationName,{timeout:WORKSPACE_TIMEOUT_MS});
    const editedLocationName=`${locationName} Updated`;
    const locationRow=page.locator('#opsLocationsList .item',{hasText:locationName}).first();
    await locationRow.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    const editLocation=locationRow.locator('button[data-bw-onclick^="editOpsLocation("]').first();
    await editLocation.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    assert(await editLocation.isEnabled(),'visible Edit location control is disabled');
    await editLocation.click();
    let editDialog=page.locator('.bw-dialog-service:visible').first();
    await editDialog.waitFor({state:'visible',timeout:VIEW_TIMEOUT_MS});
    await editDialog.locator('input').fill(editedLocationName);
    await editDialog.getByRole('button',{name:'Next'}).click();
    editDialog=page.locator('.bw-dialog-service:visible').first();
    await editDialog.waitFor({state:'visible',timeout:VIEW_TIMEOUT_MS});
    await editDialog.getByRole('button',{name:'Next'}).click();
    editDialog=page.locator('.bw-dialog-service:visible').first();
    await editDialog.waitFor({state:'visible',timeout:VIEW_TIMEOUT_MS});
    await editDialog.getByRole('button',{name:'Save location'}).click();
    locationName=editedLocationName;
    await page.waitForFunction(name=>String(document.getElementById('opsLocationsList')?.innerText||'').includes(name),locationName,{timeout:15000});
    mark('operating location edit lifecycle','location created and renamed through the visible reporting setup controls');
    const analyticsProbe=await page.evaluate(async()=>{
      try{
        const date=document.getElementById('opsReportDate')?.value||new Date().toISOString().slice(0,10);
        const value=await globalThis.reportingAnalyticsJson('/api/daily-reporting/dashboard?date='+encodeURIComponent(date));
        return {ok:!!value&&typeof value==='object',coverage:value?.coverage??null,error:''};
      }catch(error){return {ok:false,coverage:null,error:String(error?.message||error||'')}}
    });
    assert(analyticsProbe.ok&&!/timed out/i.test(analyticsProbe.error),`reporting analytics slow-path failed: ${safe(JSON.stringify(analyticsProbe))}`);
    mark('reporting analytics bounded slow path','daily reporting dashboard completed through the longer bounded analytics transport');
    await page.waitForFunction(name=>[...document.querySelectorAll('#opsReporterEmployee option')].some(option=>String(option.textContent||'').includes(name)),syntheticEmployeeName,{timeout:WORKSPACE_TIMEOUT_MS});
    const employeeValue=await page.locator('#opsReporterEmployee option').evaluateAll((options,name)=>options.find(option=>String(option.textContent||'').includes(name))?.value||'',syntheticEmployeeName);
    const locationValue=await page.locator('#opsReporterLocation option').evaluateAll((options,name)=>options.find(option=>String(option.textContent||'').includes(name))?.value||'',locationName);
    assert(employeeValue&&locationValue,'reporting selectors did not receive authoritative employee/location records');
    await page.locator('#opsReporterEmployee').selectOption(employeeValue);await page.locator('#opsReporterLocation').selectOption(locationValue);
    const createLink=page.locator('#peopleops [data-bw-onclick="createOpsReporterLink()"]:visible').first();assert(await createLink.count()&&!(await createLink.isDisabled()),'Create reporting link control remained unavailable after valid setup');
    await createLink.click();
    await page.waitForFunction(()=>String(document.getElementById('opsNewReporterLink')?.value||'').includes('#report='),null,{timeout:15000});
    let reporterLink=await page.locator('#opsNewReporterLink').inputValue();
    const reporterPage=await context.newPage();
    const reporterResponse=await reporterPage.goto(reporterLink,{waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    assert(reporterResponse?.status()===200,`restricted reporter portal HTTP ${reporterResponse?.status()||0}`);
    assert(new URL(reporterPage.url()).pathname==='/report/','issued employee reporting link did not use the dedicated public report route');
    await reporterPage.locator('#reporterPortal').waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    await reporterPage.locator('#reporterEmployeeName',{hasText:syntheticEmployeeName}).waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    await reporterPage.locator('#reporterLocationName',{hasText:locationName}).waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    const reporterText=await reporterPage.locator('#reporterPortal').innerText();
    assert(reporterText.includes(syntheticEmployeeName)&&reporterText.includes(locationName),'restricted reporter portal did not bind the employee and location from the issued link');
    assert(!(await reporterPage.locator('#authForm,#authGate,#appShell').count()),'public employee reporter leaked a sign-in or workspace surface');
    await reporterPage.close();

    const mobileReporterContext=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true});
    const mobileReporterPage=await mobileReporterContext.newPage();
    const mobileReporterResponse=await mobileReporterPage.goto(reporterLink,{waitUntil:'domcontentloaded',timeout:NAVIGATION_TIMEOUT_MS});
    assert(mobileReporterResponse?.status()===200,`mobile reporter portal HTTP ${mobileReporterResponse?.status()||0}`);
    assert(new URL(mobileReporterPage.url()).pathname==='/report/','mobile employee report link left the dedicated public report route');
    await mobileReporterPage.locator('#reporterPortal').waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    await mobileReporterPage.locator('#reporterEmployeeName',{hasText:syntheticEmployeeName}).waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    assert(!(await mobileReporterPage.locator('#authForm,#authGate,#appShell').count()),'mobile employee report link required or exposed workspace sign-in');
    await mobileReporterContext.close();
    mark('employee reporting access lifecycle','employee -> location -> passwordless desktop/mobile reporter portal verified in the disposable production tenant');

    // Prove employee-row access opens reporting status and can issue a fresh viewable private link.
    await delegatedEmployeesButton.click();
    await page.waitForFunction(()=>document.getElementById('employees')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const employeeAccessRow=page.locator('#employeeRegister .item',{hasText:syntheticEmployeeName}).first();
    await employeeAccessRow.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    const employeeAccessButton=employeeAccessRow.locator('button[aria-label^="Open reporting access for "][data-bw-onclick^="openEmployeeReportingAccess("]:visible').first();
    assert(await employeeAccessButton.count(),'clickable employee row reporting-access control missing');
    await employeeAccessButton.click();
    const employeeAccessPanel=page.locator(`[id="employeeReportingAccess_${employeeValue}"]`).first();
    await employeeAccessPanel.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    await page.waitForFunction(id=>/Employee reporting access/i.test(String(document.getElementById(`employeeReportingAccess_${id}`)?.innerText||'')),employeeValue,{timeout:WORKSPACE_TIMEOUT_MS});
    assert(/Employee reporting access/i.test(await employeeAccessPanel.innerText()),'employee click did not reveal reporting access');
    const employeeLocationSelect=page.locator(`[id="employeeReportingLocation_${employeeValue}"]`).first();
    assert(await employeeLocationSelect.count(),'employee reporting-access location selector missing');
    await employeeLocationSelect.selectOption(locationValue);
    const createEmployeeLink=employeeAccessPanel.locator('button[data-bw-onclick^="createEmployeeReportingLinkFromCard("]:visible').first();
    assert(await createEmployeeLink.count(),'employee-row create/rotate reporting link control missing');
    await createEmployeeLink.click();
    await page.waitForFunction(id=>String(document.getElementById(`employeeReporterLink_${id}`)?.value||'').includes('#report='),employeeValue,{timeout:WORKSPACE_TIMEOUT_MS});
    reporterLink=await page.locator(`[id="employeeReporterLink_${employeeValue}"]`).inputValue();
    mark('employee row reporting access','clicking the employee opened reporting access and produced a fresh viewable private reporting link');

    // Prove employee removal through the visible UI and fail closed on the bearer reporting link.
    await delegatedEmployeesButton.click();
    await page.waitForFunction(()=>document.getElementById('employees')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const syntheticEmployeeRow=page.locator('#employeeRegister .item',{hasText:syntheticEmployeeName}).first();
    await syntheticEmployeeRow.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    const removeEmployee=syntheticEmployeeRow.locator('button[data-bw-onclick^="removeEmployeeRecord("]:visible').first();
    assert(await removeEmployee.count(),'visible Remove employee control missing for the synthetic employee');
    await removeEmployee.click();
    const removalDialog=page.locator('.bw-dialog-service:visible').first();
    await removalDialog.waitFor({state:'visible',timeout:VIEW_TIMEOUT_MS});
    const confirmRemoval=removalDialog.getByRole('button',{name:'Remove employee'}).first();
    assert(await confirmRemoval.count(),'Remove employee confirmation control missing');
    await confirmRemoval.click();
    await page.waitForFunction(name=>![...document.querySelectorAll('#employeeRegister .item')].some(item=>String(item.textContent||'').includes(name)),syntheticEmployeeName,{timeout:WORKSPACE_TIMEOUT_MS});
    const reporterToken=new URLSearchParams(new URL(reporterLink).hash.slice(1)).get('report')||'';
    assert(reporterToken.length>=32,'issued reporting link token could not be recovered for revocation proof');
    const revokedAccess=await page.evaluate(async token=>{
      const response=await fetch('/public/daily-reporting/access',{method:'POST',credentials:'same-origin',headers:{'accept':'application/json','content-type':'application/json'},body:JSON.stringify({token})});
      let body=null;try{body=await response.json()}catch{}
      return {status:response.status,error:String(body?.error||'')};
    },reporterToken);
    assert(revokedAccess.status===404&&revokedAccess.error==='reporting_link_invalid_or_expired',
      `removed employee reporting link remained usable: HTTP ${revokedAccess.status} ${safe(revokedAccess.error)}`);
    mark('employee removal and reporting revocation','visible Remove employee flow removed the employee from the active register and invalidated the previously issued reporting link');

    // Prove the last active location can be removed without erasing historical location/reporting facts.
    await delegatedPeopleButton.click();
    await page.waitForFunction(()=>document.getElementById('peopleops')?.classList.contains('active'),null,{timeout:VIEW_TIMEOUT_MS});
    const peopleReportingSetup=page.locator('#opsReportingSetupDetails').first();
    assert(await peopleReportingSetup.count(),'People reporting setup disclosure missing before location removal');
    if(!(await peopleReportingSetup.evaluate(node=>node.open===true)))await peopleReportingSetup.locator(':scope > summary').first().click();
    const syntheticLocationRow=page.locator('#opsLocationsList .item',{hasText:locationName}).first();
    await syntheticLocationRow.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});
    const removeLocation=syntheticLocationRow.locator('button[data-bw-onclick^="removeOpsLocation("]:visible').first();
    assert(await removeLocation.count(),'visible Remove location control missing for the synthetic location');
    await removeLocation.click();
    const locationRemovalDialog=page.locator('.bw-dialog-service:visible').first();
    await locationRemovalDialog.waitFor({state:'visible',timeout:VIEW_TIMEOUT_MS});
    const confirmLocationRemoval=locationRemovalDialog.getByRole('button',{name:'Remove location'}).first();
    assert(await confirmLocationRemoval.count(),'Remove location confirmation control missing');
    await confirmLocationRemoval.click();
    await page.waitForFunction(name=>{
      const row=[...document.querySelectorAll('#opsLocationsList .item')].find(item=>String(item.textContent||'').includes(name));
      return !!row&&/Removed/.test(String(row.textContent||''))&&!!row.querySelector('button[data-bw-onclick^="reactivateOpsLocation("]');
    },locationName,{timeout:WORKSPACE_TIMEOUT_MS});
    await page.waitForFunction(id=>![...document.querySelectorAll('#opsReporterLocation option')].some(option=>option.value===id),locationValue,{timeout:WORKSPACE_TIMEOUT_MS});
    const archivedLocation=await page.evaluate(async id=>{
      const response=await fetch('/api/daily-reporting/locations',{credentials:'same-origin',headers:{accept:'application/json'}});
      let body=null;try{body=await response.json()}catch{}
      const items=Array.isArray(body?.items)?body.items:[];
      const item=items.find(row=>String(row.id)===String(id));
      return {status:response.status,found:!!item,active:Number(item?.active),activeCount:items.filter(row=>Number(row?.active)===1).length,names:items.map(row=>String(row?.name||''))};
    },locationValue);
    assert(archivedLocation.status===200&&archivedLocation.found&&archivedLocation.active===0&&archivedLocation.activeCount===0,
      'last location removal did not retain exactly an inactive historical row: '+safe(JSON.stringify(archivedLocation)));
    mark('location removal lifecycle','visible Remove location flow removed the last active location, retained it as history and did not recreate Head Office');

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
      const button=page.locator(`#nav button[data-view="${view}"]`).first();
      assert(await button.count(),`navigation button missing for owner view ${view}`);
      const details=button.locator('xpath=ancestor::details[1]');
      if(await details.count()&&!(await details.evaluate(node=>node.open===true))){
        const summary=details.locator(':scope > summary').first();
        assert(await summary.count(),`collapsed navigation group for ${view} has no summary control`);
        await summary.click();
        await page.waitForFunction(targetView=>{
          const button=document.querySelector(`#nav button[data-view="${targetView}"]`);
          return !!button&&button.offsetParent!==null;
        },view,{timeout:VIEW_TIMEOUT_MS});
      }
      const before=await page.evaluate(targetView=>{
        const target=document.getElementById(targetView);
        return {
          exists:!!target,
          lazy:target?.dataset?.lazyView==='1'||target?.dataset?.lazyHydrated==='1'
        };
      },view);
      assert(before.exists,`workspace target missing for owner view ${view}`);
      await button.click();
      await page.waitForFunction(targetView=>document.getElementById(targetView)?.classList.contains('active'),view,{timeout:VIEW_TIMEOUT_MS});
      if(before.lazy){
        await page.waitForFunction(targetView=>{
          const target=document.getElementById(targetView);
          return target?.dataset?.lazyHydrated==='1'||target?.dataset?.lazyError==='1';
        },view,{timeout:WORKSPACE_TIMEOUT_MS});
      }else{
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,30))));
      }
      const result=await page.evaluate(targetView=>{
        const target=document.getElementById(targetView);
        return {
          exists:!!target,
          active:!!target?.classList.contains('active'),
          title:String(document.getElementById('pageTitle')?.textContent||'').trim(),
          shellVisible:!document.getElementById('appShell')?.classList.contains('hidden'),
          lazyHydrated:target?.dataset?.lazyHydrated==='1',
          lazyError:target?.dataset?.lazyError==='1',
          stillLazy:target?.dataset?.lazyView||'',
          contentLength:String(target?.textContent||'').trim().length
        };
      },view);
      assert(result.exists&&result.active&&result.shellVisible,`real navigation click did not activate owner view ${view}: ${safe(JSON.stringify(result))}`);
      assert(result.title.length>0,`view ${view} activated without a page title`);
      if(before.lazy){
        assert(result.lazyHydrated&&!result.lazyError&&!result.stillLazy,`lazy view ${view} did not complete hydration after its real navigation click: ${safe(JSON.stringify(result))}`);
        assert(result.contentLength>0,`lazy view ${view} hydrated with empty content after its real navigation click`);
      }
    }

    const openOwnerViewThroughNav=async view=>{
      const button=page.locator('#nav button[data-view="'+view+'"]').first();
      assert(await button.count(),'safe UI action source navigation missing for '+view);
      const details=button.locator('xpath=ancestor::details[1]');
      if(await details.count()&&!(await details.evaluate(node=>node.open===true))){
        const summary=details.locator(':scope > summary').first();
        assert(await summary.count(),'safe UI action source group for '+view+' has no summary');
        await summary.click();
      }
      await button.click();
      await page.waitForFunction(targetView=>document.getElementById(targetView)?.classList.contains('active'),view,{timeout:VIEW_TIMEOUT_MS});
      await page.waitForFunction(targetView=>{
        const target=document.getElementById(targetView);
        return !!target&&(target.dataset.lazyView!=='1'||target.dataset.lazyHydrated==='1'||target.dataset.lazyError==='1');
      },view,{timeout:WORKSPACE_TIMEOUT_MS});
      const state=await page.evaluate(targetView=>{
        const target=document.getElementById(targetView);
        return {active:!!target?.classList.contains('active'),lazyError:target?.dataset?.lazyError||''};
      },view);
      assert(state.active&&!state.lazyError,'safe UI action source view failed to open: '+view+' '+safe(JSON.stringify(state)));
    };

    let safeUiActionClicks=0;
    safeUiActionProbeActive=true;
    try{
      await openOwnerViewThroughNav('dashboard');

      const quickNav=page.locator('#quickNav:visible').first();
      assert(await quickNav.count(),'safe UI action missing: command palette trigger');
      await quickNav.click();
      await page.waitForFunction(()=>document.getElementById('commandShade')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      const commandClose=page.locator('#commandShade [data-bw-onclick="closeCommandPalette()"]:visible').first();
      assert(await commandClose.count(),'safe UI action missing: command palette close');
      await commandClose.click();
      await page.waitForFunction(()=>!document.getElementById('commandShade')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      safeUiActionClicks++;

      const addEvidence=page.locator('[data-bw-onclick="openAddEvidence()"]:visible').first();
      assert(await addEvidence.count(),'safe UI action missing: Add evidence');
      await addEvidence.click();
      await page.waitForFunction(()=>document.getElementById('actionModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      const actionClose=page.locator("#actionModal [data-bw-onclick=\"closeModal('actionModal')\"]:visible").first();
      assert(await actionClose.count(),'safe UI action missing: Add evidence modal close');
      await actionClose.click();
      await page.waitForFunction(()=>!document.getElementById('actionModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      safeUiActionClicks++;

      const quickbar=page.locator('#workspaceQuickbar').first();
      assert(await quickbar.count(),'safe UI action missing: Common work disclosure');
      if(!(await quickbar.evaluate(node=>node.open===true))){
        const quickbarSummary=quickbar.locator(':scope > summary').first();
        assert(await quickbarSummary.count(),'safe UI action missing: Common work summary');
        await quickbarSummary.click();
      }

      const scanOpen=page.locator("#workspaceQuickbar [data-bw-onclick=\"openModal('scanModal')\"]:visible").first();
      assert(await scanOpen.count(),'safe UI action missing: compliance scan modal trigger');
      await scanOpen.click();
      await page.waitForFunction(()=>document.getElementById('scanModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      const scanClose=page.locator("#scanModal [data-bw-onclick=\"closeModal('scanModal')\"]:visible").first();
      assert(await scanClose.count(),'safe UI action missing: compliance scan modal close');
      await scanClose.click();
      await page.waitForFunction(()=>!document.getElementById('scanModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      safeUiActionClicks++;

      const onboardingOpen=page.locator('#workspaceQuickbar [data-bw-onclick="openOnboarding()"]:visible').first();
      assert(await onboardingOpen.count(),'safe UI action missing: Guided setup');
      await onboardingOpen.click();
      await page.waitForFunction(()=>document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      const onboardingClose=page.locator('#onboardModal [data-bw-onclick="dismissOnboarding()"]:visible').first();
      assert(await onboardingClose.count(),'safe UI action missing: Guided setup close');
      await onboardingClose.click();
      await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
      safeUiActionClicks++;

      await openOwnerViewThroughNav('licenceos');
      const licenceOpen=page.locator('#licenceos [data-bw-onclick="openLicenceEntry()"]:visible').first();
      assert(await licenceOpen.count(),'safe UI action missing: Add licence disclosure');
      await licenceOpen.click();
      await page.waitForFunction(()=>document.getElementById('licenceEntryDetails')?.open===true,null,{timeout:VIEW_TIMEOUT_MS});
      const licenceSummary=page.locator('#licenceEntryDetails > summary:visible').first();
      assert(await licenceSummary.count(),'safe UI action missing: Add licence disclosure summary');
      await licenceSummary.click();
      await page.waitForFunction(()=>document.getElementById('licenceEntryDetails')?.open===false,null,{timeout:VIEW_TIMEOUT_MS});
      safeUiActionClicks++;
    }finally{
      safeUiActionProbeActive=false;
    }
    assert(safeUiActionClicks>=MIN_SAFE_UI_ACTION_COUNT,
      'only '+safeUiActionClicks+' safe non-mutating UI actions were exercised; expected at least '+MIN_SAFE_UI_ACTION_COUNT);
    assert(safeUiMutationRequests.length===0,
      'safe UI action probes issued mutation requests: '+safe(safeUiMutationRequests.join(' | ')));
    mark('full-user safe UI action matrix',safeUiActionClicks+' real non-navigation controls opened and closed their intended UI state without issuing same-origin mutation requests');

    let inViewNavigationClicks=0;
    for(const sourceView of views){
      const sourceNav=page.locator(`#nav button[data-view="${sourceView}"]`).first();
      assert(await sourceNav.count(),`source navigation button missing for in-view audit ${sourceView}`);
      const sourceDetails=sourceNav.locator('xpath=ancestor::details[1]');
      if(await sourceDetails.count()&&!(await sourceDetails.evaluate(node=>node.open===true))){
        const summary=sourceDetails.locator(':scope > summary').first();
        assert(await summary.count(),`collapsed source group for ${sourceView} has no summary control`);
        await summary.click();
      }
      await sourceNav.click();
      await page.waitForFunction(view=>document.getElementById(view)?.classList.contains('active'),sourceView,{timeout:VIEW_TIMEOUT_MS});

      const controls=await page.locator(`#${sourceView} button[data-bw-onclick]`).evaluateAll((buttons,allowedViews)=>buttons.map((button,index)=>{
        const expression=String(button.getAttribute('data-bw-onclick')||'').trim();
        const match=expression.match(/^showView\((['"])([A-Za-z0-9_-]+)\1\)$/);
        const targetView=match?.[2]||'';
        const style=getComputedStyle(button);
        const visible=button.offsetParent!==null&&style.display!=='none'&&style.visibility!=='hidden';
        if(!visible||button.disabled||!targetView||!allowedViews.includes(targetView))return null;
        const ordinal=buttons.slice(0,index).filter(other=>String(other.getAttribute('data-bw-onclick')||'').trim()===expression).length;
        return {ordinal,targetView,expression,label:String(button.textContent||'').replace(/\s+/g,' ').trim().slice(0,120)};
      }).filter(Boolean),views);

      for(const control of controls){
        if(!(await page.evaluate(view=>document.getElementById(view)?.classList.contains('active'),sourceView))){
          if(await sourceDetails.count()&&!(await sourceDetails.evaluate(node=>node.open===true))){
            const summary=sourceDetails.locator(':scope > summary').first();
            assert(await summary.count(),`collapsed source group for ${sourceView} lost its summary control`);
            await summary.click();
          }
          await sourceNav.click();
          await page.waitForFunction(view=>document.getElementById(view)?.classList.contains('active'),sourceView,{timeout:VIEW_TIMEOUT_MS});
        }
        const escapedExpression=control.expression.replaceAll('\\','\\\\').replaceAll('"','\\"');
        const controlButtons=page.locator(`#${sourceView} button[data-bw-onclick="${escapedExpression}"]`);
        assert(await controlButtons.count()>control.ordinal,`in-view navigation control disappeared before click: ${sourceView} -> ${control.targetView} ${safe(control.label)}`);
        const controlButton=controlButtons.nth(control.ordinal);
        if(!(await controlButton.isVisible())){
          const controlDisclosure=controlButton.locator('xpath=ancestor::details[1]');
          if(await controlDisclosure.count()&&!(await controlDisclosure.evaluate(node=>node.open===true))){
            const disclosureSummary=controlDisclosure.locator(':scope > summary').first();
            assert(await disclosureSummary.count(),`hidden in-view navigation control has no disclosure summary: ${sourceView} -> ${control.targetView} ${safe(control.label)}`);
            await disclosureSummary.click();
          }
        }
        assert(await controlButton.isVisible(),`in-view navigation control became hidden before click: ${sourceView} -> ${control.targetView} ${safe(control.label)}`);
        await controlButton.click();
        await page.waitForFunction(view=>document.getElementById(view)?.classList.contains('active'),control.targetView,{timeout:VIEW_TIMEOUT_MS});
        const targetState=await page.evaluate(view=>{
          const target=document.getElementById(view);
          return {
            active:!!target?.classList.contains('active'),
            lazyError:target?.dataset?.lazyError||'',
            title:String(document.getElementById('pageTitle')?.textContent||'').trim(),
            shellVisible:!document.getElementById('appShell')?.classList.contains('hidden')
          };
        },control.targetView);
        assert(targetState.active&&targetState.shellVisible&&!targetState.lazyError,
          `in-view navigation control failed: ${sourceView} -> ${control.targetView} ${safe(JSON.stringify(targetState))}`);
        assert(targetState.title.length>0,`in-view navigation control reached ${control.targetView} without a page title`);
        inViewNavigationClicks++;
      }
    }
    assert(inViewNavigationClicks>=MIN_OWNER_INVIEW_NAV_CONTROL_COUNT,
      `only ${inViewNavigationClicks} visible owner in-view navigation controls were exercised; expected at least ${MIN_OWNER_INVIEW_NAV_CONTROL_COUNT}`);

    assert(pageErrors.length===0,`page errors: ${safe(pageErrors.join(' | '))}`);
    assert(assetFailures.length===0,`critical asset failures: ${safe(assetFailures.join(' | '))}`);
    assert(apiServerFailures.length===0,`same-origin API 5xx responses: ${safe(apiServerFailures.join(' | '))}`);
    mark('full-user owner navigation click matrix',`${views.length} role-visible navigation buttons were clicked through the live DOM; every lazy view completed hydration with non-empty content and no page, asset, or API 5xx failures`);
    mark('full-user in-view navigation control matrix',`${inViewNavigationClicks} visible non-destructive workspace navigation controls were clicked from their real source views and activated their intended destinations`);
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
