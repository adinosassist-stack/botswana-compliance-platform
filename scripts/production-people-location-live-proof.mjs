import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const NAVIGATION_TIMEOUT_MS=30000;
const WORKSPACE_TIMEOUT_MS=40000;
const VIEW_TIMEOUT_MS=10000;
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));

function assert(condition,message){if(!condition)throw new Error(`People location live proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    try{
      const response=await fetch('/api/auth/login',{
        method:'POST',
        credentials:'same-origin',
        redirect:'error',
        headers:{accept:'application/json','content-type':'application/json'},
        body:JSON.stringify({email,password})
      });
      let body=null;try{body=await response.json()}catch{}
      return {status:response.status,ok:body?.ok===true,role:body?.user?.role||'',error:body?.error||''};
    }catch(error){return {status:0,ok:false,role:'',error:String(error?.message||error)}}
  },credentials);
  assert(result.status===200&&result.ok&&result.role==='owner',`owner login failed HTTP ${result.status} ${safe(result.error)}`);
}

async function waitForWorkspace(page){
  await page.waitForFunction(()=>{
    const shell=document.getElementById('appShell');
    const marketing=document.getElementById('marketingGate');
    const auth=document.getElementById('authGate');
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return !shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&
      !!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
  },null,{timeout:WORKSPACE_TIMEOUT_MS});
}

async function dismissOnboardingIfNeeded(page){
  const modal=page.locator('#onboardModal.open').first();
  if(!(await modal.count()))return;
  const finishLater=modal.locator('[data-bw-onclick="dismissOnboarding()"]:visible, button:has-text("Finish later"):visible').first();
  assert(await finishLater.count(),'first-run onboarding dismissal control missing');
  await finishLater.click();
  await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:VIEW_TIMEOUT_MS});
}

async function runPeopleLocationProof(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    const landing=await page.goto(`${ORIGIN}/?people-location-live-proof=${Date.now()}`,{waitUntil:'domcontentloaded'});
    assert(landing?.status()===200,`public origin returned HTTP ${landing?.status()||0}`);
    await login(page,credentials);

    const app=await page.goto(`${ORIGIN}/app/?people-location-live-proof=${Date.now()}`,{waitUntil:'domcontentloaded'});
    assert(app?.status()===200,`authenticated app returned HTTP ${app?.status()||0}`);
    await waitForWorkspace(page);
    await dismissOnboardingIfNeeded(page);

    const peopleButton=page.locator('#nav button[data-view="peopleops"]:visible').first();
    assert(await peopleButton.count(),'visible People workspace button missing');
    await peopleButton.click();
    await page.waitForFunction(()=>document.getElementById('peopleops')?.classList.contains('active')&&!!document.getElementById('opsReportingSetupDetails'),null,{timeout:VIEW_TIMEOUT_MS});

    const setup=page.locator('#peopleops #opsReportingSetupDetails').first();
    assert(await setup.count(),'People reporting setup disclosure missing');
    if(!(await setup.evaluate(node=>node.open===true)))await setup.locator(':scope > summary').first().click();

    const locationName=`Synthetic Branch ${Date.now()}`;
    const locationCode=`S${String(Date.now()).slice(-7)}`;
    await page.locator('#peopleops #opsLocationName').fill(locationName);
    await page.locator('#peopleops #opsLocationCode').fill(locationCode);
    await page.locator('#peopleops #opsLocationTown').fill('Gaborone');

    const addLocation=page.locator('#peopleops [data-bw-onclick="addOpsLocation()"]:visible').first();
    assert(await addLocation.count(),'Add location control missing');
    assert(await addLocation.isEnabled(),'Add location control is disabled');
    await addLocation.click();

    await page.waitForFunction(name=>String(document.getElementById('opsLocationsList')?.innerText||'').includes(name),locationName,{timeout:WORKSPACE_TIMEOUT_MS});
    const savedRow=page.locator('#opsLocationsList .item',{hasText:locationName}).first();
    await savedRow.waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS});

    const apiState=await page.evaluate(async name=>{
      const response=await fetch('/api/daily-reporting/locations',{credentials:'same-origin',headers:{accept:'application/json'}});
      let body=null;try{body=await response.json()}catch{}
      const items=Array.isArray(body?.items)?body.items:[];
      const row=items.find(item=>String(item?.name||'')===name);
      return {status:response.status,found:!!row,active:Number(row?.active),id:String(row?.id||'')};
    },locationName);
    assert(apiState.status===200&&apiState.found&&apiState.active===1,`saved location was not returned by the live API: ${safe(JSON.stringify(apiState))}`);
    mark('People Add location live proof',`clicked visible Add location control; ${locationName} appeared in the DOM and persisted through /api/daily-reporting/locations id=${apiState.id}`);

    await context.close();
  }finally{
    await browser.close().catch(()=>{});
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
      configurable:true,
      writable:true,
      value:async credentials=>{
        await originalProof(credentials);
        await runPeopleLocationProof(credentials);
      }
    });
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  assert(intercepted,'canonical browser lifecycle did not install its proof hook');
  mark('focused People location production verification','canonical synthetic lifecycle + live People Add location save completed before cleanup');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}
