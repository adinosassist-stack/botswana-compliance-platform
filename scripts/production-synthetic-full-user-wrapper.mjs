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
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const pageErrors=[];const assetFailures=[];const apiServerFailures=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100},screen:{width:1440,height:1100}});
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

    await page.waitForFunction(()=>{
      const api=globalThis.ThebeAiDock,dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
      if(!api||!dock||!pill)return false;
      const state=typeof api.state==='function'?api.state():null;
      const style=getComputedStyle(dock),rect=dock.getBoundingClientRect();
      return state?.workspaceVisible===true&&state?.collapsed===false&&dock.hidden===false&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>250&&rect.height>250&&rect.right<=innerWidth+1;
    },null,{timeout:WORKSPACE_TIMEOUT_MS});
    const dockInitial=await page.evaluate(()=>({release:String(globalThis.ThebeAiDock?.release||''),state:globalThis.ThebeAiDock?.state?.()||null}));
    assert(/^20260920[a-z]$/.test(dockInitial.release),`unexpected Thebe dock release ${safe(dockInitial.release||'missing')}`);
    assert(dockInitial.state?.workspaceVisible===true&&dockInitial.state?.dockHidden===false,'Thebe dock was not visibly mounted after owner workspace readiness');

    await page.evaluate(()=>globalThis.ThebeAiDock.close());
    await page.waitForFunction(()=>{
      const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
      if(!dock||!pill)return false;
      const style=getComputedStyle(pill),rect=pill.getBoundingClientRect();
      return dock.hidden===true&&pill.hidden===false&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>40&&rect.height>20&&rect.right<=innerWidth+1;
    },null,{timeout:VIEW_TIMEOUT_MS});
    await page.evaluate(()=>globalThis.ThebeAiDock.open());
    await page.waitForFunction(()=>document.getElementById('thebeAiDock')?.hidden===false&&document.getElementById('thebeAiDockPill')?.hidden===true,null,{timeout:VIEW_TIMEOUT_MS});
    mark('Thebe dock authenticated visibility',`release=${dockInitial.release} visible after workspace-ready; collapse/reopen path verified`);

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
