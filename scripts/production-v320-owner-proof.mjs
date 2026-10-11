import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));
const safe=value=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300);
const check=(value,message)=>assert.ok(value,`V320 live owner proof failed: ${message}`);
check(executablePath,'no Chromium-compatible browser found');

async function login(page,credentials){
  const result=await page.evaluate(async({email,password})=>{
    const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({email,password})});
    let body=null;try{body=await response.json()}catch{}
    return {status:response.status,ok:body?.ok===true,role:String(body?.user?.role||'')};
  },credentials);
  check(result.status===200&&result.ok&&result.role==='owner',`owner login HTTP ${result.status}`);
}

async function prove(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const pageErrors=[];
  const failedAssets=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(safe(error?.stack||error)));
    page.on('requestfailed',request=>{
      const url=request.url();
      if(url.includes('owner-ask-thebe')||url.includes('workspace-readiness-v305'))failedAssets.push(`${url} ${safe(request.failure()?.errorText||'failed')}`);
    });

    const auth=await page.goto(`${ORIGIN}/auth/?v320-owner-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
    check(auth?.status()===200,'auth route did not return 200');
    await login(page,credentials);

    const app=await page.goto(`${ORIGIN}/app/?v320-owner-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
    check(app?.status()===200,'workspace route did not return 200');
    await page.waitForFunction(()=>globalThis.__THEBE_WORKSPACE_READY__===true&&!!document.getElementById('appShell'),null,{timeout:45000});

    const onboarding=page.locator('#onboardModal.open').first();
    await onboarding.waitFor({state:'visible',timeout:5000}).catch(()=>{});
    if(await onboarding.count()&&await onboarding.isVisible().catch(()=>false)){
      const later=onboarding.locator('[data-bw-onclick="dismissOnboarding()"],button:has-text("Finish later")').first();
      check(await later.count(),'onboarding modal opened without Finish later');
      await later.click();
      await page.waitForFunction(()=>!document.getElementById('onboardModal')?.classList.contains('open'),null,{timeout:20000});
    }

    const panel=page.locator('#ownerAgenticPanel').first();
    await panel.waitFor({state:'visible',timeout:45000});

    // V320's core fix: the canonical Ask form must hydrate independently of slow governance reads.
    const form=page.locator('#ownerAskThebeStableHost form[aria-label="Ask Thebe a question"]').first();
    const question=page.locator('#ownerAskThebeStableHost #ownerThebeQuestion').first();
    await form.waitFor({state:'visible',timeout:15000});
    await question.waitFor({state:'visible',timeout:15000});

    const pre=await page.evaluate(()=>({
      workspaceReady:globalThis.__THEBE_WORKSPACE_READY__===true,
      controlRelease:String(globalThis.__THEBE_OWNER_ASK_CONTROL_RELEASE__||''),
      renderRelease:String(globalThis.__THEBE_OWNER_ASK_RENDER_RELEASE__||''),
      stableHost:!!document.getElementById('ownerAskThebeStableHost'),
      stableForm:!!document.querySelector('#ownerAskThebeStableHost form[aria-label="Ask Thebe a question"]'),
      duplicateForms:document.querySelectorAll('form[aria-label="Ask Thebe a question"]').length,
      status:String(document.getElementById('ownerAskThebeStatus')?.textContent||'').trim()
    }));
    console.log(`V320 PRE ${safe(JSON.stringify(pre))}`);
    check(pre.controlRelease==='20261011-owner-ask-control-v320',`wrong/missing V320 marker ${pre.controlRelease}`);
    check(pre.renderRelease==='20261011-owner-ask-render-v319',`wrong/missing V319 marker ${pre.renderRelease}`);
    check(pre.stableHost&&pre.stableForm,'stable Ask Thebe host/form missing');
    check(pre.duplicateForms===1,`expected one Ask Thebe form, found ${pre.duplicateForms}`);

    const responsePromise=page.waitForResponse(response=>response.url().includes('/api/ai/advisor'),{timeout:45000}).then(async response=>{
      let body='';try{body=await response.text()}catch{}
      return {status:response.status(),body:safe(body)};
    });

    await question.fill('In one short sentence, what should this synthetic owner review first today? Use only this workspace context.');
    await form.locator('button[type="submit"]:has-text("Ask Thebe")').click();
    const advisor=await responsePromise;
    console.log(`V320 ADVISOR ${safe(JSON.stringify(advisor))}`);
    check(advisor.status===200,`advisor returned HTTP ${advisor.status} ${advisor.body}`);

    await page.waitForFunction(()=>{
      const status=document.getElementById('ownerAskThebeStatus');
      const answer=document.querySelector('#ownerAskThebeStableHost .owner-agentic-run');
      return /Answer ready/i.test(String(status?.textContent||''))&&String(answer?.textContent||'').trim().length>20;
    },null,{timeout:45000});

    const post=await page.evaluate(()=>({
      status:String(document.getElementById('ownerAskThebeStatus')?.textContent||'').trim(),
      answer:String(document.querySelector('#ownerAskThebeStableHost .owner-agentic-run')?.textContent||'').trim().slice(0,600),
      answerRelease:String(document.querySelector('#ownerAskThebeStableHost .owner-agentic-run')?.dataset?.askRenderRelease||''),
      duplicateForms:document.querySelectorAll('form[aria-label="Ask Thebe a question"]').length,
      controlRelease:String(globalThis.__THEBE_OWNER_ASK_CONTROL_RELEASE__||'')
    }));
    console.log(`V320 POST ${safe(JSON.stringify(post))}`);
    check(/Answer ready/i.test(post.status),`answer status not ready: ${post.status}`);
    check(post.answer.length>20,'no meaningful visible answer');
    check(post.answerRelease==='20261011-owner-ask-render-v319',`visible answer not rendered by V319: ${post.answerRelease}`);
    check(post.duplicateForms===1,`governance refresh left duplicate Ask forms: ${post.duplicateForms}`);
    check(!/could not be generated|credits or the configured cost cap do not allow/i.test(post.answer),`Ask Thebe failed visibly: ${post.answer}`);
    check(pageErrors.length===0,`page errors ${safe(JSON.stringify(pageErrors))}`);
    check(failedAssets.length===0,`Ask/readiness asset failures ${safe(JSON.stringify(failedAssets))}`);

    console.log('PASS V320 live owner proof: stable control hydrated, advisor returned 200, visible answer rendered, one canonical form remained');
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
    Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',{configurable:true,writable:true,value:async credentials=>{await originalProof(credentials);await prove(credentials)}});
  }
});

try{
  await import('./production-synthetic-hold-wrapper.mjs');
  check(intercepted,'canonical synthetic lifecycle did not install its proof hook');
  console.log('PASS V320 production proof completed inside signed synthetic lifecycle');
}finally{
  if(priorDescriptor)Object.defineProperty(globalThis,'__thebeSyntheticBrowserProof',priorDescriptor);
  else delete globalThis.__thebeSyntheticBrowserProof;
}
