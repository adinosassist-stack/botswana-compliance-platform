import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';

// Isolated DOM/HTTP boundary test: production People markup and save/decorator code.
// This does not qualify tenant authorization, plan enforcement, or the live backend.
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const people=html.match(/<section id="peopleops"[\s\S]*?<\/section>/)?.[0];
assert.ok(people,'canonical People section must exist');
const runtime=fs.readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
const start=runtime.indexOf('function setOpsLocationStatus(');
const end=runtime.indexOf('async function editOpsLocation(',start);
assert.ok(start>=0&&end>start,'canonical location save handler must exist');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let mode='network',requests=0,release=null;
  let reached;
  const pendingRequest=new Promise(resolve=>{reached=resolve});
  await page.route('http://thebe.test/**',async route=>{
   if(new URL(route.request().url()).pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0}section{padding:16px}input,button{min-height:44px}input{max-width:90%}</style>${people}`});
   assert.equal(new URL(route.request().url()).pathname,'/api/daily-reporting/locations');
   assert.equal(route.request().method(),'POST');requests++;
   assert.deepEqual(route.request().postDataJSON(),{name:'Maun Office',code:'MAU',town:'Maun'});
   if(mode==='network')return route.abort('failed');
   if(mode==='pending')await new Promise(resolve=>{release=resolve;reached()});
   const error=mode==='limit'?'location_plan_limit_reached':mode==='duplicate'?'location_code_already_used':null;
   return route.fulfill({status:error?409:200,contentType:'application/json',body:JSON.stringify(error?{error,limit:5}:{ok:true})});
  });
  await page.goto('http://thebe.test/');
  await page.evaluate(()=>{
   document.getElementById('peopleops').classList.add('active');
   document.getElementById('opsReportingSetupDetails').open=true;
   window.notifyUser=()=>{};window.renderPeopleReportingSetup=async()=>{};
   window.apiJson=async(url,options)=>{const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw {code:data.error,data};return data};
  });
  await page.addScriptTag({content:runtime.slice(start,end)});
  await page.addScriptTag({path:new URL('../public/js/locations-branches-v335.js',import.meta.url).pathname});
  const button=page.locator('[data-bw-onclick="addOpsLocation()"]');
  await page.locator('#opsLocationName').fill('Maun Office');
  await page.locator('#opsLocationCode').fill('MAU');
  await page.locator('#opsLocationTown').fill('Maun');
  for(const failure of ['network','limit','duplicate']){
   mode=failure;await button.click();
   await page.waitForFunction(()=>document.querySelector('#opsLocationStatus')?.dataset.state==='error'&&!document.querySelector('[data-bw-onclick="addOpsLocation()"]').disabled);
   assert.equal(await page.locator('#opsLocationName').inputValue(),'Maun Office');
   assert.equal(await page.locator('#opsLocationCode').inputValue(),'MAU');
   assert.equal(await page.locator('#opsLocationTown').inputValue(),'Maun');
   const message=await page.locator('#opsLocationStatus').innerText();
   if(failure==='limit')assert.match(message,/limit of 5.*Plan & billing/);
   if(failure==='duplicate')assert.match(message,/code is already in use/);
   const scroll=await page.evaluate(()=>scrollY);
   const focus=await page.evaluate(()=>document.activeElement?.id||document.activeElement?.tagName);
   await page.waitForTimeout(350); // Detect the previous delayed reveal/focus side effect.
   assert.equal(await page.evaluate(()=>document.activeElement?.id||document.activeElement?.tagName),focus);
   assert.equal(await page.evaluate(()=>scrollY),scroll);
  }
  mode='pending';const before=requests;await button.click();
  await page.waitForFunction(()=>document.querySelector('[data-bw-onclick="addOpsLocation()"]').getAttribute('aria-busy')==='true');
  await pendingRequest;
  assert.ok(release,'request must have reached the controlled HTTP boundary');
  await button.dispatchEvent('click');assert.equal(requests,before+1,'duplicate click must not POST twice');
  release();await page.waitForFunction(()=>document.querySelector('#opsLocationStatus')?.dataset.state==='success'&&!document.querySelector('[data-bw-onclick="addOpsLocation()"]').disabled);
  assert.equal(await page.locator('#opsLocationName').inputValue(),'');
  const scroll=await page.evaluate(()=>scrollY);
  const focus=await page.evaluate(()=>document.activeElement?.id||document.activeElement?.tagName);await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>document.activeElement?.id||document.activeElement?.tagName),focus);assert.equal(await page.evaluate(()=>scrollY),scroll);
  assert.equal(await button.getAttribute('aria-busy'),null);assert.deepEqual(errors,[]);
  console.log(`PASS People location browser ${viewport.width}x${viewport.height}: draft retention, plan/duplicate errors, retry, single POST, focus/scroll and busy recovery`);
  await page.close();
 }
}finally{await browser.close()}
