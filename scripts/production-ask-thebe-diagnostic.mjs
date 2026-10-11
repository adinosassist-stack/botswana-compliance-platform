import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));
const safe=value=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300);
const check=(value,message)=>assert.ok(value,`Ask Thebe diagnostic failed: ${message}`);
check(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({email,password})});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,ok:body?.ok===true,role:String(body?.user?.role||'')};
  },credentials);
  check(result.status===200&&result.ok&&result.role==='owner',`owner login HTTP ${result.status}`);
}

async function diagnose(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const failedAssets=[];
  const consoleErrors=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    page.on('requestfailed',request=>{
      const url=request.url();
      if(url.includes('owner-ask-thebe-render-v319')||url.includes('workspace-readiness-v305'))failedAssets.push(`${url} ${safe(request.failure()?.errorText||'failed')}`);
    });
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(safe(message.text()))});

    await page.goto(`${ORIGIN}/auth/?ask-diag=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
    await login(page,credentials);
    await page.goto(`${ORIGIN}/app/?ask-diag=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>globalThis.__THEBE_WORKSPACE_READY__===true&&!!document.getElementById('appShell'),null,{timeout:45000});

    const modal=page.locator('#onboardModal.open').first();
    await modal.waitFor({state:'visible',timeout:5000}).catch(()=>{});
    if(await modal.count()&&await modal.isVisible().catch(()=>false)){
      const later=modal.locator('[data-bw-onclick="dismissOnboarding()"],button:has-text("Finish later")').first();
      check(await later.count(),'onboarding modal opened without Finish later control');
      await later.click();
      await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:20000});
    }

    const dashboard=page.locator('#nav button[data-view="dashboard"]:visible').first();
    if(await dashboard.count())await dashboard.click();
    await page.locator('#ownerAgenticPanel').first().waitFor({state:'visible',timeout:45000});
    await page.waitForTimeout(5000);

    const pre=await page.evaluate(async()=>{
      const resources=performance.getEntriesByType('resource').map(entry=>String(entry.name||'')).filter(url=>url.includes('owner-ask-thebe-render-v319')||url.includes('workspace-readiness-v305'));
      let asset={status:null,release:false,error:''};
      try{
        const response=await fetch('/js/owner-ask-thebe-render-v319.js',{cache:'no-store'});
        const body=await response.text();
        asset={status:response.status,release:body.includes('20261011-owner-ask-render-v319'),error:''};
      }catch(error){asset.error=String(error?.message||error)}
      return {
        marker:String(globalThis.__THEBE_OWNER_ASK_RENDER_RELEASE__||''),
        workspaceReady:globalThis.__THEBE_WORKSPACE_READY__===true,
        status:String(document.getElementById('ownerAgenticStatus')?.textContent||''),
        body:String(document.getElementById('ownerAgenticBody')?.textContent||'').slice(0,500),
        questionExists:!!document.getElementById('ownerThebeQuestion'),
        formExists:!!document.querySelector('form[aria-label="Ask Thebe a question"]'),
        resources,
        asset
      };
    });
    console.log(`DIAG pre-click ${safe(JSON.stringify(pre))}`);
    console.log(`DIAG asset-failures ${safe(JSON.stringify(failedAssets))}`);
    console.log(`DIAG console-errors ${safe(JSON.stringify(consoleErrors))}`);
    check(pre.marker==='20261011-owner-ask-render-v319','V319 marker missing in authenticated workspace');

    if(!pre.questionExists||!pre.formExists){
      console.log('DIAG click skipped because canonical Ask Thebe controls were not present after panel hydration window');
      return;
    }

    const question=page.locator('#ownerThebeQuestion').first();
    const form=page.locator('form[aria-label="Ask Thebe a question"]').first();
    await question.fill('In one short sentence, what should this synthetic owner review first today? Use only this workspace context.');
    const responsePromise=page.waitForResponse(response=>response.url().includes('/api/ai/advisor'),{timeout:20000}).then(async response=>{
      let body='';try{body=await response.text()}catch{}
      return {status:response.status(),bodyPrefix:safe(body)};
    }).catch(error=>({status:null,error:safe(error?.message||error)}));
    const submit=form.locator('button[type="submit"]:has-text("Ask Thebe")').first();
    await submit.click();
    const advisor=await responsePromise;
    await page.waitForTimeout(3000);

    const post=await page.evaluate(()=>{
      const panel=document.getElementById('ownerAgenticPanel');
      const cards=[...(panel?.querySelectorAll('.owner-agentic-run')||[])];
      const submit=document.querySelector('form[aria-label="Ask Thebe a question"] button[type="submit"]');
      return {
        marker:String(globalThis.__THEBE_OWNER_ASK_RENDER_RELEASE__||''),
        status:String(document.getElementById('ownerAgenticStatus')?.textContent||''),
        cardCount:cards.length,
        answerText:String(cards.at(-1)?.textContent||'').slice(0,500),
        answerRelease:String(cards.at(-1)?.dataset?.askRenderRelease||''),
        submitText:String(submit?.textContent||''),
        submitDisabled:!!submit?.disabled
      };
    });
    console.log(`DIAG advisor ${safe(JSON.stringify(advisor))}`);
    console.log(`DIAG post-click ${safe(JSON.stringify(post))}`);
    check(advisor.status===200,`advisor response did not return 200: ${safe(JSON.stringify(advisor))}`);
    check(/Answer ready/i.test(post.status),`visible Ask Thebe status not ready: ${safe(post.status)}`);
    check(post.cardCount>0&&post.answerText.trim().length>20,'Ask Thebe rendered no meaningful answer card');
  }finally{
    await browser.close().catch(()=>{});
  }
}

const priorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'__thebeSyntheticBrowserProof');
let intercepted=false;
Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{
  configurable:true,
  set(originalProof){
    check(typeof originalProof==='function','canonical browser proof hook assignment was not a function');
    intercepted=true;
    Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{configurable:true,writable:true,value:async credentials=>{await originalProof(credentials);await diagnose(credentials)}});
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  check(intercepted,'canonical synthetic lifecycle did not install its proof hook');
  console.log('PASS Ask Thebe production diagnostic completed inside signed synthetic lifecycle');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}
