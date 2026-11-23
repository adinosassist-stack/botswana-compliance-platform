#!/usr/bin/env node
/**
 * Synthetic, browser-rendered mobile geometry test for owner onboarding #2781.
 * Uses a fabricated Owner, fabricated tenant state and a local DOM fixture.
 * Never requests production, signs in, writes a record, or simulates a real Android device.
 * At 2x the effective CSS width is halved as a browser-zoom layout stress approximation;
 * this is NOT a substitute for actual 200% Chrome zoom or physical-device acceptance.
 */
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const SOURCE=fs.readFileSync(new URL('../public/js/owner-onboarding-journey-v1.js',import.meta.url),'utf8');
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
assert.ok(executablePath,'No installed Chromium-compatible browser for synthetic onboarding acceptance');
const widths=[320,375,414,430,768];
const fixtureHTML=[
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>',
  '*{box-sizing:border-box}html,body{margin:0;width:100%;}',
  'body{font:16px/1.45 system-ui,sans-serif;color:#1c2836;background:#f5f8fc;}',
  '[hidden]{display:none!important}.workspace{width:100%;max-width:980px;margin:auto;padding:16px 14px 148px;}',
  '.card{padding:16px;background:#fff;border:1px solid #d5dde8;border-radius:16px;}',
  '.row{display:flex;flex-wrap:wrap;gap:10px}.between{justify-content:space-between;}',
  '.muted{color:#495d73}.small{font-size:14px}.section-eyebrow{font-size:13px;font-weight:700;}',
  'h2{font-size:22px;line-height:1.2;margin:8px 0;}h3{font-size:18px;}',
  '.btn{min-height:44px;max-width:100%;padding:10px 12px;font:inherit;',
  'border-radius:10px;border:1px solid #cad6e4;background:#fff;color:#1b3e69;white-space:normal;}',
  '.bottom-nav{position:fixed;z-index:20;bottom:0;left:0;right:0;width:100%;max-width:100%;height:64px;',
  'background:#fff;border-top:1px solid #d5dde8;display:flex;justify-content:space-around;align-items:center;}',
  '.dock{position:fixed;z-index:21;right:12px;bottom:82px;width:48px;height:48px;',
  'border:0;border-radius:50%;background:#23344c;color:#fff;}',
  '</style></head><body>',
  '<main class="workspace" id="syntheticWorkspace">',
  '<div id="welcomeSetupBanner" hidden></div>',
  '</main><nav class="bottom-nav" aria-label="Synthetic bottom navigation">',
  '</nav>',
  '<button class="dock" type="button" aria-label="Synthetic AI Dock">AI</button>',
  '</body></html>'
].join('');

const syntheticUser={role:'owner',id:'synthetic-owner',tenantId:'synthetic-tenant',
  onboardingComplete:true,emailVerified:false};
const syntheticData={state:{activeCompanyId:'synthetic-company',companies:[{
  id:'synthetic-company',profile:{entityType:'company',industry:'Services',employees:2,
    firstProtectionCheckStatus:'complete',firstProtectionCheckAt:'2026-11-20T10:00:00Z'}
}]}};
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
const evidenceDir='artifacts/onboarding-2781-synthetic';
fs.mkdirSync(evidenceDir,{recursive:true});
const report={kind:'synthetic-owner-onboarding-mobile-matrix',realAndroidTested:false,
  actualBrowserZoomTested:false,productionSessionUsed:false,customerWrites:0,results:[]};

async function start(width,{role='owner',error=false,height=844}={}){
  const context=await browser.newContext({viewport:{width,height},screen:{width,height},isMobile:true,
    hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const outgoing=[];
  page.on('request',req=>outgoing.push(req.url()));
  await page.setContent(fixtureHTML);
  await page.evaluate(({user,data,fail,role})=>{
    window.__fixture={user:{...user,role},data,fail,reads:[]};
    window.BW={api:{createClient:()=>({request:async (path,opts)=>{
      window.__fixture.reads.push({path,method:opts?.method});
      if(window.__fixture.fail)throw Object.assign(new Error('synthetic network failure'),{status:503});
      if(path==='/api/auth/me')return {user:window.__fixture.user};
      if(path==='/api/state')return window.__fixture.data;
      throw new Error('Unexpected API path: '+path);
    }})}};
    window.whenThebeWorkspaceReady=callback=>queueMicrotask(callback);
  },{user:syntheticUser,data:syntheticData,role,fail:error});
  await page.addScriptTag({content:SOURCE});
  await page.waitForFunction(()=>window.__fixture.reads.length>0);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
  return {context,page,outgoing};
}

async function metrics(page,selector){
  return await page.locator(selector).evaluate(element=>{
    const box=element.getBoundingClientRect(),style=getComputedStyle(element);
    return {width:box.width,height:box.height,left:box.left,right:box.right,
      top:box.top,bottom:box.bottom,visible:style.display!=='none'&&style.visibility!=='hidden',
      viewport:document.documentElement.clientWidth,
      pageWidth:document.scrollingElement.scrollWidth};
  });
}
async function hitTest(page,selector){
  await page.locator(selector).scrollIntoViewIfNeeded();
  const hit=await page.locator(selector).evaluate(element=>{
    const r=element.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
    const at=document.elementFromPoint(x,y);
    return {hit:at===element||element.contains(at),x,y,viewportWidth:innerWidth,viewportHeight:innerHeight};
  });
  assert.equal(hit.hit,true,selector+' center is obstructed by another control');
}
async function verifyNoLeak(page,outgoing){
  assert.deepEqual(outgoing,[],'Synthetic onboarding must not send any network request');
  const reads=await page.evaluate(()=>window.__fixture.reads);
  assert.ok(reads.length>0);
  for(const x of reads){
    assert.ok(['/api/auth/me','/api/state'].includes(x.path),'Unexpected synthetic API call');
    assert.equal(x.method,'GET','Synthetic guide must not issue writes');
  }
}
async function ownerMatrix(width,{approxZoom=false}={}){
  const effectiveWidth=approxZoom?Math.floor(width/2):width;
  const {context,page,outgoing}=await start(effectiveWidth);
  try{
    // The 2x reflow approximation isolates onboarding; mock fixed navigation is
    // already hit-tested at actual 320–768px sizes and is not production nav CSS.
    if(approxZoom)await page.evaluate(()=>document.querySelector('.bottom-nav')?.remove());
    await page.waitForFunction(()=>document.querySelector('#ownerJourneySummary')?.textContent?.startsWith('4 of 4'));
    const panel=page.locator('#ownerJourney');
    const guide=page.locator('#ownerFirstDocumentGuide');
    assert.equal(await panel.isVisible(),true);
    assert.equal(await guide.isVisible(),true);
    assert.equal(await page.locator('[data-onboarding-milestone]').count(),4);
    const overflow=await page.evaluate(()=>document.scrollingElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1){
      const offenders=await page.evaluate(()=>[...document.querySelectorAll('*')].map(el=>{
        const box=el.getBoundingClientRect();
        return {tag:el.tagName,id:el.id,cls:typeof el.className==='string'?el.className.slice(0,50):'',right:Math.round(box.right),width:Math.round(box.width),text:(el.textContent||'').trim().slice(0,65)};
      }).filter(v=>v.right>document.documentElement.clientWidth+1).slice(0,14));
      console.error(JSON.stringify({effectiveWidth,overflow,offenders}));
    }
    assert.ok(overflow<=1,'Horizontal overflow at CSS '+effectiveWidth+'px: '+overflow);
    for(const selector of ['#ownerJourneyRefresh','#ownerGuideQuotation','#ownerGuideInvoice']){
      const m=await metrics(page,selector);
      assert.ok(m.width>=44&&m.height>=44,selector+' below 44px touch target');
      assert.ok(m.left>=-1&&m.right<=m.viewport+1,selector+' clipped at '+effectiveWidth+'px');
      if(!approxZoom)await hitTest(page,selector);
    }
    await page.locator('#ownerGuideQuotation').focus();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerGuideQuotation');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerGuideInvoice');
    await page.locator('#ownerGuideQuotation').click();
    assert.equal(await page.locator('#ownerFirstDocumentSteps li').count(),3);
    assert.equal(await page.locator('#ownerGuideQuotation').getAttribute('aria-pressed'),'true');
    await page.locator('#ownerGuideInvoice').click();
    assert.equal(await page.locator('#ownerFirstDocumentSteps li').count(),3);
    assert.equal(await page.locator('#ownerGuideInvoice').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('#ownerFirstDocumentStatus').innerText(),/no draft was saved/i);
    const filename='owner-'+width+(approxZoom?'-zoom2-approx':'')+'.png';
    await page.screenshot({path:path.join(evidenceDir,filename),fullPage:true});
    await verifyNoLeak(page,outgoing);
    report.results.push({scenario:'owner',width,effectiveCssWidth:effectiveWidth,
      zoomLayoutApproximation:approxZoom,overflowPx:overflow,status:'pass',screenshot:filename});
  }finally{await context.close()}
}
async function failureAndRoleScenarios(){
  const {context,page,outgoing}=await start(375);
  try{
    await page.waitForFunction(()=>document.querySelector('#ownerJourneySummary')?.textContent?.startsWith('4 of 4'));
    // Removing the original anchor after successful boot must not destroy the rendered panel.
    await page.evaluate(()=>document.querySelector('#welcomeSetupBanner').remove());
    assert.equal(await page.locator('#ownerJourney').isVisible(),true);
    await page.evaluate(()=>{window.__fixture.fail=true});
    await page.locator('#ownerJourneyRefresh').click();
    await page.waitForFunction(()=>document.querySelector('#ownerJourneySummary')?.textContent?.includes('could not be verified'));
    assert.equal(await page.locator('#ownerFirstDocumentGuide').isVisible(),false);
    for(const id of ['ownerJourneyAccount','ownerJourneyBusiness','ownerJourneyWorkspace','ownerJourneyFirst']){
      assert.equal(await page.locator('#'+id).innerText(),'Not verified');
    }
    await page.evaluate(()=>{window.__fixture.fail=false;window.__fixture.user.role='manager'});
    await page.locator('#ownerJourneyRefresh').click();
    await page.waitForFunction(()=>document.querySelector('#ownerJourney')?.hidden===true);
    assert.equal(await page.locator('#ownerFirstDocumentGuide').isVisible(),false);
    await verifyNoLeak(page,outgoing);
    report.results.push({scenario:'network-error-recovery-and-role-revocation',width:375,status:'pass'});
  }finally{await context.close()}
  for(const role of ['manager','viewer']){
    const {context,page,outgoing}=await start(375,{role});
    try{
      assert.equal(await page.locator('#ownerJourney').isVisible(),false,
        'Non-owner must never see owner milestones');
      assert.equal(await page.locator('#ownerFirstDocumentGuide').isVisible(),false);
      await verifyNoLeak(page,outgoing);
      report.results.push({scenario:'non-owner-'+role,width:375,status:'pass'});
    }finally{await context.close()}
  }
}
try{
  for(const width of widths)await ownerMatrix(width);
  // CSS-width approximation only; NOT an assertion about actual browser 200% zoom.
  for(const width of [320,375,430])await ownerMatrix(width,{approxZoom:true});
  await failureAndRoleScenarios();
  console.log(JSON.stringify(report));
  console.log('SYNTHETIC_OWNER_ONBOARDING_MOBILE_MATRIX_PASS');
}finally{await browser.close()}
