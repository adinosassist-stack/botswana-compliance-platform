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

  const root=await page.goto(ORIGIN+'/?mobile-smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(root?.status(),200,'mobile root must return HTTP 200');
  const publicState=await page.evaluate(()=>({
    title:document.title,
    hero:(document.querySelector('.hero h1')?.textContent||'').trim(),
    marketing:!!document.getElementById('marketingGate'),
    appShell:!!document.getElementById('appShell'),
    authForm:!!document.getElementById('authForm'),
    rolePortal:!!document.getElementById('roleAccessPortal'),
    bodyText:(document.body.innerText||'').slice(0,1400)
  }));
  assert.match(publicState.title,/Thebe Desk/i);
  assert.equal(publicState.marketing,true,'public homepage container missing');
  assert.match(publicState.hero,/See business risk before it becomes a penalty, dispute or loss\./i,'public homepage hero is missing on mobile root');
  assert.equal(publicState.appShell,false,'plain mobile root leaked the workspace shell');
  assert.equal(publicState.authForm,false,'plain mobile root leaked the authentication form');
  assert.equal(publicState.rolePortal,false,'plain mobile root exposed the role-access portal instead of the public homepage');
  assert.doesNotMatch(publicState.bodyText,/This account does not open the leadership workspace\./i,'role-access message replaced the public homepage');

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

  const signIn=page.getByRole('link',{name:/Sign in/i}).first();
  assert.ok(await signIn.count(),'Sign in link missing on mobile public homepage');
  await signIn.tap();
  await page.waitForURL(url=>url.pathname==='/auth/'&&url.searchParams.get('mode')==='login',{timeout:10000});
  await page.waitForSelector('#authForm',{state:'visible',timeout:10000});
  await page.waitForFunction(mode=>document.documentElement.classList.contains(`registration-${mode}`),expectedMode,{timeout:10000});
  const authSurface=await page.evaluate(()=>({
    appShell:!!document.getElementById('appShell'),
    marketing:!!document.getElementById('marketingGate'),
    companyHidden:document.getElementById('companyNameField')?.hidden??true,
    googleHidden:document.querySelector('.social-auth-btn.google,#googleAuthButton')?.hidden??true,
    facebookHidden:document.querySelector('.social-auth-btn.facebook,#facebookAuthButton')?.hidden??true,
    registerTabHidden:document.getElementById('registerTab')?.hidden??false
  }));
  assert.equal(authSurface.appShell,false,'auth surface leaked the workspace shell');
  assert.equal(authSurface.marketing,false,'auth surface embedded the public marketing shell');
  assert.equal(authSurface.companyHidden,true,'sign-in mode unexpectedly exposed company registration field');
  if(capabilities.providers.google!==true)assert.equal(authSurface.googleHidden,true,'unavailable Google sign-in control must be hidden directly, not only by parent layout');
  if(capabilities.providers.facebook!==true)assert.equal(authSurface.facebookHidden,true,'unavailable Facebook sign-in control must be hidden directly, not only by parent layout');

  if(expectedMode==='hold'||expectedMode==='invalid'){
    assert.equal(authSurface.registerTabHidden,true,'HOLD must hide public registration CTA');
    assert.match((await page.locator('body').innerText()).slice(0,1600),/registration is temporarily unavailable|new account registration is temporarily unavailable/i,'HOLD must explain registration unavailability');
  }else{
    assert.equal(authSurface.registerTabHidden,false,'open/cohort registration must expose the create-account tab');
    await page.locator('#registerTab').tap();
    await page.waitForFunction(()=>document.getElementById('companyNameField')?.hidden===false,null,{timeout:5000});
    const registrationState=await page.evaluate(()=>({companyHidden:document.getElementById('companyNameField')?.hidden,submitText:document.getElementById('authSubmit')?.textContent||''}));
    assert.equal(registrationState.companyHidden,false,'registration mode did not expose company name');
    assert.match(registrationState.submitText,/Create account/i);
  }

  const anonymousContext=await browser.newContext({
    viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
  });
  const anonymousPage=await anonymousContext.newPage();
  const appResponse=await anonymousPage.goto(ORIGIN+'/app/?mobile-boundary='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
  assert.ok(appResponse?.status()===200||appResponse?.status()===302,'anonymous app route returned an unexpected status');
  await anonymousPage.waitForURL(url=>url.pathname==='/auth/'&&url.searchParams.get('next')?.startsWith('/app/'),{timeout:10000});
  assert.ok(await anonymousPage.locator('#authForm').count(),'anonymous /app/ did not land on dedicated auth surface');
  await anonymousContext.close();

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
