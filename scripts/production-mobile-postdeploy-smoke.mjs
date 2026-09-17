import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ORIGIN=String(process.env.ORIGIN||'https://thebedesk.com').replace(/\/$/,'');
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
assert.ok(executablePath,'no Chromium-compatible browser found');

const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    screen:{width:390,height:844},
    isMobile:true,
    hasTouch:true,
    deviceScaleFactor:2,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
  });
  const page=await context.newPage();
  const pageErrors=[];const criticalFailures=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  page.on('requestfailed',request=>{const url=request.url();if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/'))criticalFailures.push(`${request.method()} ${url} ${request.failure()?.errorText||''}`)});
  const response=await page.goto(ORIGIN+'/?mobile-smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(response?.status(),200,'mobile root must return HTTP 200');
  await page.waitForFunction(()=>{
    const gate=document.getElementById('marketingGate');
    return gate&&!gate.classList.contains('hidden');
  },null,{timeout:30000});
  const state=await page.evaluate(()=>({
    title:document.title,
    standalone:document.body.classList.contains('standalone-preview'),
    previewDisplay:getComputedStyle(document.querySelector('.previewmode')).display,
    marketingHidden:document.getElementById('marketingGate')?.classList.contains('hidden'),
    authHidden:document.getElementById('authGate')?.classList.contains('hidden'),
    rolePortalDisplay:getComputedStyle(document.getElementById('roleAccessPortal')).display,
    heroText:document.querySelector('#marketingGate .marketinghero h1')?.textContent||'',
    bodyText:(document.body.innerText||'').slice(0,900)
  }));
  assert.match(state.title,/Thebe Desk/i);
  assert.equal(state.standalone,false,'production mobile root entered standalone preview mode');
  assert.equal(state.previewDisplay,'none','standalone preview marker is visible in production');
  assert.equal(state.marketingHidden,false,'marketing surface did not become visible on mobile');
  assert.equal(state.rolePortalDisplay,'none','plain mobile root exposed the role-access portal instead of the public homepage');
  assert.match(state.heroText,/See business risk before it becomes a penalty, dispute or loss\./i,'public homepage hero is missing on mobile root');
  assert.doesNotMatch(state.bodyText,/This account does not open the leadership workspace\./i,'role-access message replaced the public homepage');
  assert.doesNotMatch(state.bodyText,/STANDALONE PREVIEW · NO LIVE SUBMISSIONS/i,'preview text leaked into visible mobile production content');

  // Release the public-root landing guard through the same explicit user action
  // that real visitors use. The remainder of this section intentionally exposes
  // the workspace shell only for a non-mutating responsive-menu smoke test.
  const signIn=page.locator('#marketingGate [data-guest-action]').first();
  assert.ok(await signIn.count(),'Sign in action missing on mobile public homepage');
  await signIn.tap({timeout:10000});
  await page.waitForFunction(()=>!document.getElementById('authGate')?.classList.contains('hidden'),null,{timeout:10000});

  await page.waitForFunction(()=>typeof window.openMobileWorkspaceMenu==='function'&&document.getElementById('mobileMenuButton'),null,{timeout:10000});
  await page.evaluate(()=>{
    const marketing=document.getElementById('marketingGate');
    const auth=document.getElementById('authGate');
    const shell=document.getElementById('appShell');
    window.__mobileSmokeRestore={
      marketingHidden:marketing?.classList.contains('hidden')??false,
      authHidden:auth?.classList.contains('hidden')??true,
      shellVisibility:shell?.style.visibility||''
    };
    marketing?.classList.add('hidden');
    auth?.classList.add('hidden');
    if(shell)shell.style.visibility='visible';
  });
  const menu=page.locator('#mobileMenuButton');
  await menu.waitFor({state:'visible',timeout:10000});
  await menu.tap({timeout:10000});
  await page.waitForFunction(()=>document.body.classList.contains('mobile-nav-open'),null,{timeout:5000});
  await page.waitForTimeout(250);
  const menuState=await page.evaluate(()=>{
    const side=document.getElementById('workspaceSidebar');
    const nav=side?.querySelector(':scope > .nav');
    return {
      expanded:document.getElementById('mobileMenuButton')?.getAttribute('aria-expanded'),
      bodyTouch:getComputedStyle(document.body).touchAction,
      navTouch:nav?getComputedStyle(nav).touchAction:'',
      navOverflowY:nav?getComputedStyle(nav).overflowY:'',
      navClientHeight:nav?.clientHeight||0,
      navScrollHeight:nav?.scrollHeight||0,
      closeExists:!!document.getElementById('mobileNavClose')
    };
  });
  assert.equal(menuState.expanded,'true','mobile menu did not enter expanded state');
  assert.notEqual(menuState.bodyTouch,'none','mobile menu disabled all touch handling');
  assert.match(menuState.navTouch,/pan-y|auto/i,'mobile drawer lost vertical touch scrolling');
  assert.match(menuState.navOverflowY,/auto|scroll/i,'mobile drawer is not vertically scrollable');
  assert.equal(menuState.closeExists,true,'mobile drawer close control missing');
  const scrollResult=await page.evaluate(()=>{
    const nav=document.querySelector('#workspaceSidebar > .nav');
    if(!nav)return {before:-1,after:-1,max:-1};
    const before=nav.scrollTop;
    const max=Math.max(0,nav.scrollHeight-nav.clientHeight);
    nav.scrollTop=Math.min(max,Math.max(80,Math.floor(max/2)));
    return {before,after:nav.scrollTop,max};
  });
  if(scrollResult.max>0)assert.ok(scrollResult.after>scrollResult.before,'mobile drawer could not scroll');
  await page.locator('#mobileNavClose').tap({timeout:10000});
  await page.waitForFunction(()=>!document.body.classList.contains('mobile-nav-open'),null,{timeout:5000});
  assert.equal(await menu.getAttribute('aria-expanded'),'false','mobile menu did not close cleanly');
  const responsive=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>resolve(true),60))));
  assert.equal(responsive,true,'mobile page stopped responding after menu interaction');
  await page.evaluate(()=>{
    const restore=window.__mobileSmokeRestore||{};
    const marketing=document.getElementById('marketingGate');
    const auth=document.getElementById('authGate');
    const shell=document.getElementById('appShell');
    marketing?.classList.toggle('hidden',!!restore.marketingHidden);
    auth?.classList.toggle('hidden',!!restore.authHidden);
    if(shell)shell.style.visibility=restore.shellVisibility||'hidden';
    delete window.__mobileSmokeRestore;
    window.showMarketing?.();
  });
  await page.waitForFunction(()=>!document.getElementById('marketingGate')?.classList.contains('hidden'),null,{timeout:5000});

  const capabilities=await page.evaluate(async()=>{
    const [providerResponse,policyResponse]=await Promise.all([
      fetch('/api/auth/oauth/providers',{headers:{accept:'application/json'},cache:'no-store'}),
      fetch('/api/auth/registration-policy',{headers:{accept:'application/json'},cache:'no-store'})
    ]);
    return {
      providers:providerResponse.ok?await providerResponse.json():{google:false,facebook:false},
      policy:policyResponse.ok?await policyResponse.json():{mode:'invalid'}
    };
  });
  const expectedMode=['hold','cohort','open'].includes(String(capabilities.policy?.mode))?String(capabilities.policy.mode):'invalid';
  await page.waitForFunction(mode=>document.documentElement.classList.contains(`registration-${mode}`),expectedMode,{timeout:10000});

  const providerState=await page.evaluate(()=>({
    googleHidden:document.querySelector('.social-auth-btn.google,#googleAuthButton')?.hidden??true,
    facebookHidden:document.querySelector('.social-auth-btn.facebook,#facebookAuthButton')?.hidden??true,
    registerTabHidden:document.getElementById('registerTab')?.hidden??false
  }));
  if(capabilities.providers.google!==true)assert.equal(providerState.googleHidden,true,'unavailable Google sign-in control must be hidden directly, not only by parent layout');
  if(capabilities.providers.facebook!==true)assert.equal(providerState.facebookHidden,true,'unavailable Facebook sign-in control must be hidden directly, not only by parent layout');

  const start=page.locator('button.marketing-start-action').first();
  assert.ok(await start.count(),'Start Free action missing on mobile');
  if(expectedMode==='hold'||expectedMode==='invalid'){
    assert.equal(await start.evaluate(element=>element.hidden),true,'HOLD must hide public registration CTA');
    if(await page.locator('#registerTab').count())assert.equal(providerState.registerTabHidden,true,'HOLD must hide registration tab');
  }else{
    await start.click();
    await page.waitForFunction(()=>!document.getElementById('authGate')?.classList.contains('hidden'),null,{timeout:10000});
    await page.waitForTimeout(150);
    const authState=await page.evaluate(()=>({
      authHidden:document.getElementById('authGate')?.classList.contains('hidden'),
      companyDisplay:document.getElementById('companyNameField')?getComputedStyle(document.getElementById('companyNameField')).display:null,
      submitText:document.getElementById('authSubmit')?.textContent||''
    }));
    assert.equal(authState.authHidden,false);
    assert.notEqual(authState.companyDisplay,'none');
    assert.match(authState.submitText,/Create account/i);
  }

  await page.goto(ORIGIN+'/register-direct.html?mobile-smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(mode=>document.documentElement.classList.contains(`registration-${mode}`),expectedMode,{timeout:10000});
  if(expectedMode==='hold'||expectedMode==='invalid'){
    assert.equal(await page.locator('#registerForm').isHidden(),true,'direct registration form must fail closed during HOLD');
    assert.match((await page.locator('body').innerText()).slice(0,1200),/registration is temporarily (?:on hold|unavailable)/i,'direct registration page must explain HOLD state');
  }else{
    assert.equal(await page.locator('#registerForm').isVisible(),true,'registration form must remain available for cohort/open modes');
    assert.match((await page.locator('body').innerText()).slice(0,800),/Create your account/i);
  }

  assert.deepEqual(pageErrors,[],'mobile page errors detected');
  assert.deepEqual(criticalFailures,[],'mobile critical asset failures detected');
  console.log(`MOBILE_POSTDEPLOY_SMOKE_PASS registrationMode=${expectedMode}`);
}finally{
  await browser.close();
}
