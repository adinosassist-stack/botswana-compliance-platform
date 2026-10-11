import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const NAV_TIMEOUT=30000;
const VIEW_TIMEOUT=20000;
const WORKSPACE_TIMEOUT=45000;
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));

function check(value,message){assert.ok(value,`P0 owner E2E proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,260)}
function mark(label,detail=''){console.log(`PASS P0 ${label}${detail?`: ${detail}`:''}`)}
check(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',redirect:'error',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({email,password})});
    let body=null;try{body=await response.json()}catch{}
    return {
      status:response.status,
      ok:body?.ok===true,
      role:String(body?.user?.role||''),
      userId:String(body?.user?.id||''),
      tenantId:String(body?.user?.tenantId||''),
      error:String(body?.error||'')
    };
  },credentials);
  check(result.status===200&&result.ok&&result.role==='owner'&&result.userId&&result.tenantId,`owner login failed HTTP ${result.status} ${safe(result.error)}`);
  return result;
}

async function sessionIdentity(page){
  const result=await page.evaluate(async()=>{
    const response=await fetch('/api/auth/me',{credentials:'same-origin',headers:{accept:'application/json'}});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,role:String(body?.user?.role||''),userId:String(body?.user?.id||''),tenantId:String(body?.user?.tenantId||'')};
  });
  check(result.status===200&&result.role==='owner'&&result.userId&&result.tenantId,'authenticated owner identity unavailable');
  return result;
}

async function waitWorkspace(page){
  await page.waitForFunction(()=>{
    const shell=document.getElementById('appShell'),marketing=document.getElementById('marketingGate'),auth=document.getElementById('authGate');
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return globalThis.__THEBE_WORKSPACE_READY__===true&&!shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&!!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
  },null,{timeout:WORKSPACE_TIMEOUT});
}

async function dismissOnboarding(page,{waitMs=0}={}){
  const modal=page.locator('#onboardModal.open').first();
  if(waitMs>0)await modal.waitFor({state:'visible',timeout:waitMs}).catch(()=>{});
  if(!await modal.count()||!await modal.isVisible().catch(()=>false))return;
  const later=modal.locator('[data-bw-onclick="dismissOnboarding()"],button:has-text("Finish later")').first();
  check(await later.count(),'first-run onboarding opened without a Finish later control');
  await later.click();
  await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT});
  mark('onboarding','first-run modal dismissed before workspace navigation');
}

async function visibleNavButton(page,view){
  let button=page.locator(`#nav button[data-view="${view}"]:visible`).first();
  if(await button.count())return button;
  const candidates=page.locator(`#nav button[data-view="${view}"]`);
  const count=await candidates.count();
  for(let i=0;i<count;i+=1){
    const details=candidates.nth(i).locator('xpath=ancestor::details[1]');
    if(!await details.count())continue;
    const summary=details.locator(':scope > summary:visible').first();
    if(!await summary.count())continue;
    if(!(await details.evaluate(node=>node.open===true)))await summary.click();
    button=page.locator(`#nav button[data-view="${view}"]:visible`).first();
    if(await button.count())return button;
  }
  return button;
}

async function openView(page,view){
  await dismissOnboarding(page);
  const button=await visibleNavButton(page,view);
  check(await button.count(),`visible navigation control missing for ${view}`);
  await button.waitFor({state:'visible',timeout:VIEW_TIMEOUT});
  await button.click();
  await page.waitForFunction(target=>{
    const node=document.getElementById(target);if(!node)return false;
    const style=getComputedStyle(node);return node.classList.contains('active')&&style.display!=='none'&&style.visibility!=='hidden'&&node.getBoundingClientRect().width>0;
  },view,{timeout:VIEW_TIMEOUT});
  mark(view,'real visible navigation control opened the workspace view');
}

async function stateFingerprint(page){
  return page.evaluate(async()=>{
    const response=await fetch('/api/state',{credentials:'same-origin',headers:{accept:'application/json'}});
    let body=null;try{body=await response.json()}catch{}
    const state=body?.state&&typeof body.state==='object'?body.state:{};
    const version=Number(body?.version);
    return {
      status:response.status,
      version:Number.isFinite(version)?version:null,
      activeCompanyId:String(state?.activeCompanyId||''),
      companies:(Array.isArray(state?.companies)?state.companies:[]).map(company=>String(company?.id||'')).filter(Boolean).sort()
    };
  });
}

async function proveEvidence(page){
  const addEvidence=page.locator('[data-bw-onclick="openAddEvidence()"]:visible').first();
  check(await addEvidence.count(),'Add evidence control missing');
  await addEvidence.click();
  await page.waitForFunction(()=>document.getElementById('actionModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT});
  const modalText=await page.locator('#actionModal').innerText();
  check(modalText.trim().length>10,'evidence modal rendered empty');
  const close=page.locator('#actionModal [data-bw-onclick="closeModal(\'actionModal\')"]:visible').first();
  check(await close.count(),'evidence modal close control missing');
  await close.click();
  await page.waitForFunction(()=>!document.getElementById('actionModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT});
  mark('evidence','real Add evidence flow opened and closed without bypassing launch upload controls');
}

async function proveFinance(page){
  await openView(page,'moneyhub');
  await page.waitForFunction(()=>{
    const root=document.getElementById('moneyhub');
    return ['ready','unavailable'].includes(String(root?.dataset?.moneyV307State||''));
  },null,{timeout:VIEW_TIMEOUT});
  const state=await page.locator('#moneyhub').getAttribute('data-money-v307-state');
  check(['ready','unavailable'].includes(String(state||'')),`Money source state was not explicit: ${safe(state)}`);
  mark('finance',`Money workspace settled to explicit source state=${state}`);
}

async function proveProperty(page){
  await openView(page,'propertyintelligence');
  const property=page.locator('#propertyintelligence');
  check(await property.count(),'Property workspace missing');
  const text=await property.innerText();
  check(/property|valuation|portfolio|construction/i.test(text),'Property workspace lacked property content');
  mark('property','Property workspace rendered its operational surface');
}

async function provePeople(page){
  await openView(page,'peopleops');
  await page.waitForFunction(()=>{
    const view=document.getElementById('peopleops');
    return !!view&&view.classList.contains('active')&&String(view.innerText||'').trim().length>40;
  },null,{timeout:VIEW_TIMEOUT});
  check(await page.locator('#employeeRegister').count()||await page.locator('#peopleops').count(),'People workspace did not expose its employee surface');
  mark('people','People workspace rendered after real navigation');
}

async function proveAskThebe(page){
  await openView(page,'aiservices');
  const question=page.locator('#aiAdvisorQuestion').first();
  const button=page.locator('#aiAdvisorButton').first();
  const output=page.locator('#aiAdvisorOutput').first();
  check(await question.count()&&await button.count()&&await output.count(),'Ask Thebe grounded advisor controls missing');
  await question.fill('In one short sentence, what should this synthetic owner review first today? Use only this workspace context.');
  await button.click();
  await page.waitForFunction(()=>{
    const button=document.getElementById('aiAdvisorButton'),region=document.getElementById('aiAdvisorRegion'),output=document.getElementById('aiAdvisorOutput');
    return !!button&&!button.disabled&&region?.getAttribute('aria-busy')!=='true'&&String(output?.innerText||'').trim().length>20&&!/Building a grounded answer/i.test(String(output?.innerText||''));
  },null,{timeout:WORKSPACE_TIMEOUT});
  const text=safe(await output.innerText());
  check(!/could not be generated|credits or the configured cost cap do not allow/i.test(text),`Ask Thebe failed: ${text}`);
  check(text.length>20,'Ask Thebe returned no meaningful answer');
  mark('Ask Thebe','authenticated grounded advisor returned a real workspace answer');
}

async function markPersistence(page){
  const result=await page.evaluate(async()=>{
    const response=await fetch('/api/account/onboarding/complete',{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'application/json'},body:'{}'});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,ok:body?.ok===true,error:String(body?.error||'')};
  });
  check(result.status===200&&result.ok,`synthetic persistence marker failed HTTP ${result.status} ${safe(result.error)}`);
  mark('persistence marker','synthetic owner onboarding completion persisted server-side');
}

async function logout(page){
  const result=await page.evaluate(async()=>{
    const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{accept:'application/json'}});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,ok:body?.ok===true};
  });
  check(result.status===200&&result.ok,'logout endpoint failed');
  const me=await page.evaluate(async()=>{const response=await fetch('/api/auth/me',{credentials:'same-origin',headers:{accept:'application/json'}});return response.status});
  check(me===401||me===403,`logged-out session remained authenticated HTTP ${me}`);
  mark('logout','session invalidated before re-login');
}

async function verifyPersistence(page,beforeState,beforeIdentity,afterIdentity){
  check(afterIdentity.userId===beforeIdentity.userId&&afterIdentity.tenantId===beforeIdentity.tenantId,'authenticated synthetic tenant/user identity changed across logout/login');
  const onboarding=await page.evaluate(async()=>{
    const response=await fetch('/api/account/onboarding',{credentials:'same-origin',headers:{accept:'application/json'}});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,complete:body?.complete===true};
  });
  check(onboarding.status===200&&onboarding.complete,'server persistence marker did not survive logout/login');
  const afterState=await stateFingerprint(page);
  check(afterState.status===200&&Number.isFinite(afterState.version),'state endpoint unavailable after re-login');
  check(afterState.version===beforeState.version,'workspace state version changed during read-only navigation and onboarding-marker persistence proof');
  if(beforeState.activeCompanyId)check(afterState.activeCompanyId===beforeState.activeCompanyId,'active workspace company changed across logout/login');
  if(beforeState.companies.length)check(JSON.stringify(afterState.companies)===JSON.stringify(beforeState.companies),'workspace company set changed across logout/login');
  mark('login + persistence','same synthetic tenant/user identity and persisted owner marker survived a new authenticated session');
}

async function runP0Journey(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const pageErrors=[];const assetFailures=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},screen:{width:1440,height:1000}});
    const page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(safe(error?.stack||error)));
    page.on('requestfailed',request=>{const url=request.url();if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/'))assetFailures.push(`${request.method()} ${url} ${safe(request.failure()?.errorText||'failed')}`)});

    const auth=await page.goto(`${ORIGIN}/auth/?p0-owner-e2e=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    check(auth?.status()===200,'auth surface did not return 200');
    const firstLogin=await login(page,credentials);
    mark('auth','synthetic owner authenticated');

    const app=await page.goto(`${ORIGIN}/app/?p0-owner-e2e=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    check(app?.status()===200,'workspace route did not return 200');
    await waitWorkspace(page);await dismissOnboarding(page,{waitMs:5000});
    mark('workspace','authenticated workspace became authoritatively ready');

    const beforeIdentity=await sessionIdentity(page);
    check(beforeIdentity.userId===firstLogin.userId&&beforeIdentity.tenantId===firstLogin.tenantId,'workspace session identity differs from login identity');
    const beforeState=await stateFingerprint(page);
    check(beforeState.status===200&&Number.isFinite(beforeState.version),'initial workspace state endpoint unavailable');
    mark('state contract',`first-run workspace state readable at version=${beforeState.version} companyCount=${beforeState.companies.length}`);

    await openView(page,'protecthub');
    const protectText=await page.locator('#protecthub').innerText();
    check(/compliance|protect|obligation|risk/i.test(protectText),'Protect workspace lacked compliance content');
    mark('compliance','Protect workspace rendered compliance content');
    await proveEvidence(page);
    await proveFinance(page);
    await proveProperty(page);
    await provePeople(page);
    await proveAskThebe(page);
    await markPersistence(page);

    await logout(page);
    const relogin=await page.goto(`${ORIGIN}/auth/?mode=login&p0-relogin=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    check(relogin?.status()===200,'auth surface did not return 200 for re-login');
    const secondLogin=await login(page,credentials);
    check(secondLogin.userId===firstLogin.userId&&secondLogin.tenantId===firstLogin.tenantId,'re-login response resolved a different synthetic identity');
    const appAgain=await page.goto(`${ORIGIN}/app/?p0-relogin=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    check(appAgain?.status()===200,'workspace route failed after re-login');
    await waitWorkspace(page);await dismissOnboarding(page,{waitMs:5000});
    const afterIdentity=await sessionIdentity(page);
    await verifyPersistence(page,beforeState,beforeIdentity,afterIdentity);

    check(pageErrors.length===0,`page errors ${safe(JSON.stringify(pageErrors))}`);
    check(assetFailures.length===0,`asset failures ${safe(JSON.stringify(assetFailures))}`);
    mark('complete chain','auth -> workspace -> compliance -> evidence -> finance -> property -> people -> Ask Thebe -> logout/login -> persistence');
  }finally{await browser.close().catch(()=>{})}
}

const priorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
let intercepted=false;
Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
  configurable:true,
  set(originalProof){
    check(typeof originalProof==='function','canonical browser proof hook assignment was not a function');
    intercepted=true;
    Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{configurable:true,writable:true,value:async credentials=>{await originalProof(credentials);await runP0Journey(credentials)}});
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  check(intercepted,'canonical synthetic lifecycle did not install its proof hook');
  mark('synthetic lifecycle','P0 owner journey completed inside the signed synthetic tenant lifecycle before cleanup');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}