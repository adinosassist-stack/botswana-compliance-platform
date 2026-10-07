import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const VIEW_TIMEOUT_MS=15000;
const WORKSPACE_TIMEOUT_MS=40000;
const CLOSE_TIMEOUT_MS=5000;
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));

function check(condition,message){if(!condition)throw new Error(`Core mobile workspace proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,280)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}
function withDeadline(label,promise,ms){let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} deadline ${ms}ms exceeded`)),ms)})]).finally(()=>clearTimeout(timer))}
check(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    try{
      const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',redirect:'error',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({email,password})});
      let body=null;try{body=await response.json()}catch{}
      return {status:response.status,ok:body?.ok===true,role:body?.user?.role||'',error:body?.error||''};
    }catch(error){return {status:0,ok:false,role:'',error:String(error?.name||error||'login_failed')}}
  },credentials);
  check(result.status===200&&result.ok&&result.role==='owner',`owner login failed HTTP ${result.status} ${safe(result.error)}`);
}

async function waitForWorkspace(page){
  await page.waitForFunction(()=>{
    const shell=document.getElementById('appShell'),marketing=document.getElementById('marketingGate'),auth=document.getElementById('authGate');
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return globalThis.__THEBE_WORKSPACE_READY__===true&&!shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&!!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
  },null,{timeout:WORKSPACE_TIMEOUT_MS});
}

async function dismissOnboarding(page){
  const modal=page.locator('#onboardModal.open').first();
  if(!await modal.count())return;
  const later=modal.locator('[data-bw-onclick="dismissOnboarding()"],button:has-text("Finish later")').first();
  if(await later.count())await later.click();
  await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:5000}).catch(()=>{});
}

async function inspectView(page,viewId){
  await page.evaluate(view=>{
    if(typeof globalThis.showView!=='function')throw new Error('showView unavailable');
    globalThis.showView(view);
  },viewId);
  await page.waitForFunction(view=>{
    const node=document.getElementById(view);if(!node)return false;
    const style=getComputedStyle(node);return node.classList.contains('active')&&style.display!=='none'&&style.visibility!=='hidden'&&node.getBoundingClientRect().width>0;
  },viewId,{timeout:VIEW_TIMEOUT_MS});
  if(viewId==='moneyhub'){
    await page.waitForFunction(()=>{
      const root=document.getElementById('moneyhub'),mount=document.getElementById('moneyWorkspaceV307');
      return !!mount&&['ready','unavailable'].includes(String(root?.dataset?.moneyV307State||''));
    },null,{timeout:VIEW_TIMEOUT_MS});
  }
  return await page.evaluate(view=>{
    const node=document.getElementById(view),rect=node.getBoundingClientRect(),main=document.querySelector('main'),bar=document.getElementById('mobileBar');
    const visibleControls=[...node.querySelectorAll('button,a[href],summary,input,select,textarea')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'});
    const shortControls=visibleControls.filter(el=>el.getBoundingClientRect().height<43.5).slice(0,6).map(el=>({tag:el.tagName,id:el.id||'',label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,70),height:Math.round(el.getBoundingClientRect().height)}));
    const barRect=bar?.getBoundingClientRect();
    return {
      view,
      width:Math.round(rect.width),
      viewport:innerWidth,
      documentScrollWidth:document.documentElement.scrollWidth,
      nodeScrollWidth:node.scrollWidth,
      nodeClientWidth:node.clientWidth,
      mainScrollWidth:main?.scrollWidth||0,
      mainClientWidth:main?.clientWidth||0,
      shortControls,
      barTop:barRect?Math.round(barRect.top):null,
      nodeBottom:Math.round(rect.bottom),
      moneyRelease:view==='moneyhub'?String(globalThis.ThebeMoneyWorkspaceV307?.release||''):'',
      moneyState:view==='moneyhub'?String(document.getElementById('moneyhub')?.dataset?.moneyV307State||''):'',
      moneyInputsRelease:view==='moneyhub'?String(document.getElementById('moneyInputsV310')?.dataset?.release||''):'',
      moneyInputActions:view==='moneyhub'?document.querySelectorAll('#moneyInputsV310 [data-money-input-action]').length:0,
      moneyLanes:view==='moneyhub'?[...document.querySelectorAll('#moneyWorkspaceV307 .money-v307-lane h3')].map(node=>node.textContent):[],
      text:(node.innerText||'').slice(0,500)
    };
  },viewId);
}

async function runCoreMobileJourney(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const pageErrors=[],assetFailures=[];
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'});
    const page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(safe(error?.stack||error)));
    page.on('requestfailed',request=>{const url=request.url();if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/'))assetFailures.push(`${request.method()} ${url} ${safe(request.failure()?.errorText||'failed')}`)});
    await page.goto(ORIGIN+'/?core-mobile-proof='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
    await login(page,credentials);
    await page.goto(ORIGIN+'/app/?core-mobile-proof='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
    await waitForWorkspace(page);
    await dismissOnboarding(page);

    const results=[];
    for(const view of ['moneyhub','workhub','protecthub','accounthub'])results.push(await inspectView(page,view));
    for(const result of results){
      check(result.documentScrollWidth<=result.viewport+1,`${result.view} document horizontal overflow ${result.documentScrollWidth}>${result.viewport}`);
      check(result.nodeScrollWidth<=result.nodeClientWidth+2,`${result.view} view horizontal overflow ${result.nodeScrollWidth}>${result.nodeClientWidth}`);
      check(result.mainScrollWidth<=result.mainClientWidth+2,`${result.view} main horizontal overflow ${result.mainScrollWidth}>${result.mainClientWidth}`);
      check(result.shortControls.length===0,`${result.view} has visible touch controls below 44px ${safe(JSON.stringify(result.shortControls))}`);
      mark(`mobile ${result.view}`,`width=${result.width}px no-horizontal-overflow touch-targets>=44px`);
    }
    const money=results.find(result=>result.view==='moneyhub');
    check(money.moneyRelease==='20261007-money-workspace-v307',`Money release mismatch ${safe(money.moneyRelease)}`);
    check(['ready','unavailable'].includes(money.moneyState),`Money did not settle into an explicit source state: ${safe(money.moneyState)}`);
    check(money.moneyState==='unavailable'||money.moneyLanes.includes('Reconcile cash'),`Money deterministic surface missing: ${safe(JSON.stringify(money.moneyLanes))}`);
    check(money.moneyInputsRelease==='20261007-money-inputs-v310',`Money input release missing: ${safe(money.moneyInputsRelease)}`);
    check(money.moneyInputActions>=11,`Money record entry actions missing: ${money.moneyInputActions}`);
    check(pageErrors.length===0,`page errors ${safe(JSON.stringify(pageErrors))}`);
    check(assetFailures.length===0,`asset failures ${safe(JSON.stringify(assetFailures))}`);
    mark('authenticated core mobile workspace matrix','Money + Work + Protect + Settings at 390x844; V307 summary + V310 input actions present; no asset/page errors');
  }finally{
    await withDeadline('core mobile browser close',browser.close().catch(()=>{}),CLOSE_TIMEOUT_MS).catch(()=>{});
  }
}

const priorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
let intercepted=false;
Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
  configurable:true,
  set(originalProof){
    check(typeof originalProof==='function','canonical browser proof hook assignment was not a function');
    intercepted=true;
    Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
      configurable:true,writable:true,
      value:async credentials=>{
        await originalProof(credentials);
        await runCoreMobileJourney(credentials);
      }
    });
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  check(intercepted,'canonical browser lifecycle did not install its proof hook');
  mark('core mobile synthetic wrapper','canonical synthetic lifecycle plus authenticated core-hub mobile proof completed before cleanup');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}
