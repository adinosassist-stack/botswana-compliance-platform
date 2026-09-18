import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const BROWSER_FETCH_TIMEOUT_MS=15000;
const BROWSER_NAVIGATION_TIMEOUT_MS=30000;
const BROWSER_PROOF_WATCHDOG_MS=240000;
const RELOAD_EXTERNAL_DEADLINE_MS=45000;
const DIAGNOSTIC_EXTERNAL_DEADLINE_MS=12000;
const WORKSPACE_EXTERNAL_DEADLINE_MS=40000;
const BROWSER_CLOSE_DEADLINE_MS=5000;
const API_BREADCRUMB_PATHS=new Set(['/api/auth/me','/api/state','/api/audit','/api/billing/status']);
const SYNTHETIC_BOOT_TRACE_PREFIX='THEBE_SYNTHETIC_BOOT ';
const desktopAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const mobileAgent='Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
let browserProofComplete=false;

function assert(condition,message){if(!condition)throw new Error(`Synthetic browser proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}
function info(label,detail=''){console.log(`INFO ${label}${detail?`: ${detail}`:''}`)}
function cookieState(value){return value===true?'present':value===false?'absent':'unknown'}
function withDeadline(label,promise,ms){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} external deadline ${ms}ms exceeded`)),ms)})
  ]).finally(()=>clearTimeout(timer));
}
function logicalApiPath(raw){
  try{
    const url=new URL(raw);
    if(url.origin!==ORIGIN)return '';
    if(url.pathname==='/'){
      const tunneled=url.searchParams.get('__thebe_api_path');
      if(tunneled&&String(tunneled).startsWith('/api/'))return String(tunneled);
    }
    if(url.pathname==='/__thebe_api')return '/api';
    if(url.pathname.startsWith('/__thebe_api/'))return `/api/${url.pathname.slice('/__thebe_api/'.length)}`;
    if(url.pathname.startsWith('/api/'))return url.pathname;
    return '';
  }catch{return ''}
}
function apiTransport(raw){
  try{
    const url=new URL(raw);
    if(url.pathname==='/'&&url.searchParams.has('__thebe_api_path'))return 'root_tunnel';
    if(url.pathname==='/__thebe_api'||url.pathname.startsWith('/__thebe_api/'))return 'shadow_path';
    if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return 'direct';
    return 'other';
  }catch{return 'invalid'}
}
function attachApiBreadcrumbs(page,label){
  page.on('request',request=>{
    const path=logicalApiPath(request.url());
    if(!API_BREADCRUMB_PATHS.has(path))return;
    info(`${label} api breadcrumb`,`${request.method()} ${path} start transport=${apiTransport(request.url())}`);
  });
  page.on('response',response=>{
    const path=logicalApiPath(response.url());
    if(!API_BREADCRUMB_PATHS.has(path))return;
    const type=safe(String(response.headers()['content-type']||'content-type-missing').split(';',1)[0]);
    info(`${label} api breadcrumb`,`${response.request().method()} ${path} ${response.status()} transport=${apiTransport(response.url())} type=${type}`);
  });
  page.on('requestfailed',request=>{
    const path=logicalApiPath(request.url());
    if(!API_BREADCRUMB_PATHS.has(path))return;
    info(`${label} api breadcrumb`,`${request.method()} ${path} failed transport=${apiTransport(request.url())}`);
  });
  page.on('console',message=>{
    const text=String(message.text()||'');
    if(!text.startsWith(SYNTHETIC_BOOT_TRACE_PREFIX))return;
    info(`${label} boot trace`,safe(text.slice(SYNTHETIC_BOOT_TRACE_PREFIX.length)));
  });
  page.on('crash',()=>info(`${label} page lifecycle`,'crash'));
  page.on('close',()=>info(`${label} page lifecycle`,'close'));
}
assert(executablePath,'no Chromium-compatible browser found');

async function probeWorkspaceBootstrap(page,pageErrors=[]){
  const cookies=await page.context().cookies(ORIGIN);
  const sessionCookiePresent=cookies.some(cookie=>cookie.name==='__Host-bw_session'||cookie.name==='bw_session');
  const result=await page.evaluate(async timeoutMs=>{
    const direct=async path=>{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort('synthetic-bootstrap-diagnostic-timeout'),timeoutMs);
      try{
        const response=await fetch(path,{method:'GET',credentials:'same-origin',headers:{accept:'application/json'},signal:controller.signal,redirect:'error'});
        let body=null;try{body=await response.json()}catch{}
        return {status:response.status,error:body?.error||null,role:body?.user?.role||null,companies:Array.isArray(body?.state?.companies)?body.state.companies.length:null};
      }catch(error){return {status:0,error:String(error?.name||'network_error'),role:null,companies:null}}
      finally{clearTimeout(timer)}
    };
    const client=async path=>{
      try{
        const factory=globalThis.BW?.api?.createClient;
        if(typeof factory!=='function')return {ok:false,error:'api_client_missing',role:null,companies:null};
        const data=await factory({timeoutMs,retries:0}).request(path);
        return {ok:true,error:null,role:data?.user?.role||null,companies:Array.isArray(data?.state?.companies)?data.state.companies.length:null};
      }catch(error){return {ok:false,error:String(error?.code||error?.name||'client_error'),role:null,companies:null}}
    };
    const [directMe,directState,clientMe,clientState]=await Promise.all([
      direct('/api/auth/me'),direct('/api/state'),client('/api/auth/me'),client('/api/state')
    ]);
    const shell=document.getElementById('appShell'),marketing=document.getElementById('marketingGate'),auth=document.getElementById('authGate');
    return {
      directMe,directState,clientMe,clientState,
      gates:{
        shell:!!shell,
        shellVisibility:shell?getComputedStyle(shell).visibility:'missing',
        marketingHidden:!!marketing?.classList.contains('hidden'),
        authHidden:!!auth?.classList.contains('hidden'),
        sidebar:!!document.getElementById('workspaceSidebar')
      }
    };
  },Math.min(BROWSER_FETCH_TIMEOUT_MS,8000));
  return {...result,sessionCookiePresent,pageError:pageErrors.length?safe(pageErrors[0]):''};
}

function summarizeProbe(d){
  return `sessionCookie=${cookieState(d?.sessionCookiePresent)} directMe=${d?.directMe?.status||0}/${safe(d?.directMe?.error||d?.directMe?.role||'ok')} directState=${d?.directState?.status||0}/${safe(d?.directState?.error||`companies=${d?.directState?.companies}`)} clientMe=${d?.clientMe?.ok?`ok/${safe(d?.clientMe?.role||'role-missing')}`:safe(d?.clientMe?.error||'failed')} clientState=${d?.clientState?.ok?`ok/companies=${d?.clientState?.companies}`:safe(d?.clientState?.error||'failed')} gates=${safe(JSON.stringify(d?.gates||{}))}${d?.pageError?` pageError=${safe(d.pageError)}`:''}`;
}

async function observeWorkspaceBootstrap(page,label,pageErrors=[]){
  try{
    const cookies=await page.context().cookies(ORIGIN);
    const sessionCookiePresent=cookies.some(cookie=>cookie.name==='__Host-bw_session'||cookie.name==='bw_session');
    const gates=await page.evaluate(()=>{
      const shell=document.getElementById('appShell'),marketing=document.getElementById('marketingGate'),auth=document.getElementById('authGate');
      return {
        shell:!!shell,
        shellVisibility:shell?getComputedStyle(shell).visibility:'missing',
        marketingHidden:!!marketing?.classList.contains('hidden'),
        authHidden:!!auth?.classList.contains('hidden'),
        sidebar:!!document.getElementById('workspaceSidebar')
      };
    });
    const pageError=pageErrors.length?safe(pageErrors[0]):'';
    info(`${label} workspace bootstrap`,`passive observation sessionCookie=${cookieState(sessionCookiePresent)} gates=${safe(JSON.stringify(gates))}${pageError?` pageError=${pageError}`:''}; no diagnostic API requests issued`);
    return {sessionCookiePresent,gates,pageError};
  }catch(error){
    info(`${label} workspace bootstrap`,`passive_observation_error=${safe(error?.message||error)}`);
    return null;
  }
}

async function assertWorkspace(page,label,pageErrors=[]){
  try{
    await page.waitForFunction(()=>{
      const shell=document.getElementById('appShell');
      const marketing=document.getElementById('marketingGate');
      const auth=document.getElementById('authGate');
      if(!shell)return false;
      const style=getComputedStyle(shell);
      return !shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&
        !!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
    },null,{timeout:30000});
  }catch(error){
    const d=await withDeadline(`${label} timeout diagnostic`,probeWorkspaceBootstrap(page,pageErrors),DIAGNOSTIC_EXTERNAL_DEADLINE_MS).catch(probeError=>({sessionCookiePresent:null,directMe:{status:0,error:'probe_failed'},directState:{status:0,error:'probe_failed'},clientMe:{ok:false,error:'probe_failed'},clientState:{ok:false,error:'probe_failed'},gates:{},pageError:safe(probeError?.message||probeError)}));
    throw new Error(`Synthetic browser proof failed: ${label} workspace bootstrap timeout ${summarizeProbe(d)}`);
  }
  const state=await page.evaluate(()=>({
    standalone:document.body.classList.contains('standalone-preview'),
    shell:!!document.getElementById('appShell'),sidebar:!!document.getElementById('workspaceSidebar')
  }));
  assert(!state.standalone,`${label} entered standalone preview mode`);
  assert(state.shell&&state.sidebar,`${label} workspace shell/sidebar missing`);
}

async function loginInBrowser(page,credentials){
  const result=await page.evaluate(async({email,password,timeoutMs})=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort('synthetic-browser-login-timeout'),timeoutMs);
    try{
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password}),signal:controller.signal});
      let body=null;try{body=await response.json()}catch{}
      return {status:response.status,ok:body?.ok===true,role:body?.user?.role||null,error:null};
    }catch(error){
      return {status:0,ok:false,role:null,error:String(error?.name||error||'browser login failed')};
    }finally{
      clearTimeout(timer);
    }
  },{...credentials,timeoutMs:BROWSER_FETCH_TIMEOUT_MS});
  assert(result.status===200&&result.ok&&result.role==='owner',`browser owner login failed HTTP ${result.status}${result.error?` ${safe(result.error)}`:''}`);
}

async function runBrowserProof(credentials){
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  let activeStage='browser launch';
  browser.on('disconnected',()=>info('browser lifecycle',`disconnected stage=${safe(activeStage)}`));
  const watchdog=setTimeout(()=>{
    console.error(`FAIL synthetic browser watchdog stage=${safe(activeStage)} limitMs=${BROWSER_PROOF_WATCHDOG_MS}`);
    browser.close().catch(()=>{});
  },BROWSER_PROOF_WATCHDOG_MS);
  try{
    activeStage='desktop context';
    const desktop=await browser.newContext({viewport:{width:1440,height:1100},screen:{width:1440,height:1100},userAgent:desktopAgent});
    const page=await desktop.newPage();
    page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(BROWSER_NAVIGATION_TIMEOUT_MS);
    attachApiBreadcrumbs(page,'desktop');
    const pageErrors=[];const criticalFailures=[];
    page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
    page.on('requestfailed',r=>{const url=r.url();if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/'))criticalFailures.push(`${r.method()} ${url} ${r.failure()?.errorText||''}`)});
    activeStage='desktop registration route';
    const response=await page.goto(`${ORIGIN}/register-direct.html?desktop-registration-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:BROWSER_NAVIGATION_TIMEOUT_MS});
    assert(response?.status()===200,'desktop registration route did not return 200');
    assert(/Create your account/i.test((await page.locator('body').innerText()).slice(0,1000)),'desktop registration heading missing');
    for(const id of ['#companyName','#email','#password','#submitBtn','#status'])assert(await page.locator(id).count(),`desktop registration control missing ${id}`);
    await page.locator('#companyName').fill('A');await page.locator('#email').fill('bad');await page.locator('#password').fill('short');await page.locator('#submitBtn').click();
    await page.waitForFunction(()=>document.getElementById('status')?.classList.contains('show'),null,{timeout:5000});
    assert(/business name/i.test(await page.locator('#status').innerText()),'desktop invalid registration did not fail closed');
    activeStage='desktop registration proof';
    const proof=await page.evaluate(async timeoutMs=>{
      const encoder=new TextEncoder();
      const leading=(bytes,bits)=>{let remaining=Number(bits)||0;for(const value of bytes){if(remaining<=0)return true;const take=Math.min(8,remaining);if((value>>(8-take))!==0)return false;remaining-=take}return remaining<=0};
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort('synthetic-browser-proof-timeout'),timeoutMs);
      try{
        const response=await fetch('/api/auth/registration-proof/challenge',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:controller.signal});
        const body=await response.json();
        if(response.status!==200||body?.provider!=='thebe_proof'||body?.required!==true)return {ok:false,status:response.status};
        for(let counter=0;counter<=500000;counter++){
          const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`${body.token}:${counter}`)));
          if(leading(digest,body.difficulty))return {ok:true,status:response.status,difficulty:body.difficulty,counter};
          if(counter&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        return {ok:false,status:response.status,difficulty:body.difficulty};
      }finally{
        clearTimeout(timer);
      }
    },BROWSER_FETCH_TIMEOUT_MS);
    assert(proof.ok&&Number.isInteger(proof.difficulty)&&proof.difficulty>=8&&proof.difficulty<=16,'desktop browser could not solve first-party registration proof');
    mark('desktop registration pass 1',`live form validation + browser proof solved at difficulty=${proof.difficulty}`);

    activeStage='desktop auth surface navigation';
    info('desktop synthetic stage','opening dedicated auth surface');
    await page.goto(`${ORIGIN}/auth/?mode=login&next=/app/&desktop-owner-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:BROWSER_NAVIGATION_TIMEOUT_MS});
    activeStage='desktop owner browser login';
    info('desktop synthetic stage','submitting owner login');
    await loginInBrowser(page,credentials);
    mark('desktop browser login','owner login returned 200');
    activeStage='desktop app navigation';
    info('desktop synthetic stage','opening authenticated /app/ workspace');
    const desktopApp=await page.goto(`${ORIGIN}/app/?desktop-owner-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:BROWSER_NAVIGATION_TIMEOUT_MS});
    assert(desktopApp?.status()===200,'desktop authenticated /app/ route did not return 200');
    activeStage='desktop pre-reload diagnostic';
    await withDeadline('desktop pre-reload diagnostic',observeWorkspaceBootstrap(page,'desktop pre-reload',pageErrors),DIAGNOSTIC_EXTERNAL_DEADLINE_MS);
    activeStage='desktop initial workspace reveal';
    await withDeadline('desktop initial workspace reveal',assertWorkspace(page,'desktop initial',pageErrors),WORKSPACE_EXTERNAL_DEADLINE_MS);
    activeStage='desktop authenticated reload';
    info('desktop synthetic stage','reloading authenticated /app/ workspace');
    await withDeadline('desktop authenticated reload',page.reload({waitUntil:'commit',timeout:BROWSER_NAVIGATION_TIMEOUT_MS}),RELOAD_EXTERNAL_DEADLINE_MS);
    activeStage='desktop post-reload diagnostic';
    await withDeadline('desktop post-reload diagnostic',observeWorkspaceBootstrap(page,'desktop post-reload',pageErrors),DIAGNOSTIC_EXTERNAL_DEADLINE_MS);
    activeStage='desktop workspace reveal';
    await withDeadline('desktop workspace reveal',assertWorkspace(page,'desktop',pageErrors),WORKSPACE_EXTERNAL_DEADLINE_MS);
    const desktopNav=page.locator('#workspaceSidebar [data-view]:visible');
    const desktopNavCount=await desktopNav.count();assert(desktopNavCount>0,'desktop owner workspace has no visible data-view navigation');
    const firstDesktopNav=desktopNav.first();const desktopView=await firstDesktopNav.getAttribute('data-view');await firstDesktopNav.click({timeout:10000});
    const desktopResponsive=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>resolve(true),60))));
    assert(desktopResponsive===true,'desktop owner workspace stopped responding after navigation');
    assert(pageErrors.length===0,`desktop page errors: ${safe(pageErrors.join(' | '))}`);
    assert(criticalFailures.length===0,`desktop critical assets failed: ${safe(criticalFailures.join(' | '))}`);
    mark('desktop registration pass 3',`canonical synthetic owner reached workspace and ${desktopView||'workspace'} navigation stayed responsive`);
    await desktop.close();

    activeStage='mobile context';
    const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:mobileAgent});
    const mobilePage=await mobile.newPage();
    mobilePage.setDefaultTimeout(15000);mobilePage.setDefaultNavigationTimeout(BROWSER_NAVIGATION_TIMEOUT_MS);
    attachApiBreadcrumbs(mobilePage,'mobile');
    const mobilePageErrors=[];
    mobilePage.on('pageerror',e=>mobilePageErrors.push(String(e?.stack||e)));
    activeStage='mobile auth surface navigation';
    await mobilePage.goto(`${ORIGIN}/auth/?mode=login&next=/app/&authenticated-mobile-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:BROWSER_NAVIGATION_TIMEOUT_MS});
    activeStage='mobile owner browser login';
    await loginInBrowser(mobilePage,credentials);
    mark('mobile browser login','same owner login returned 200');
    activeStage='mobile app navigation';
    const mobileApp=await mobilePage.goto(`${ORIGIN}/app/?authenticated-mobile-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:BROWSER_NAVIGATION_TIMEOUT_MS});
    assert(mobileApp?.status()===200,'mobile authenticated /app/ route did not return 200');
    activeStage='mobile pre-reload diagnostic';
    await withDeadline('mobile pre-reload diagnostic',observeWorkspaceBootstrap(mobilePage,'mobile pre-reload',mobilePageErrors),DIAGNOSTIC_EXTERNAL_DEADLINE_MS);
    activeStage='mobile initial workspace reveal';
    await withDeadline('mobile initial workspace reveal',assertWorkspace(mobilePage,'mobile initial',mobilePageErrors),WORKSPACE_EXTERNAL_DEADLINE_MS);
    activeStage='mobile authenticated reload';
    info('mobile synthetic stage','reloading authenticated /app/ workspace');
    await withDeadline('mobile authenticated reload',mobilePage.reload({waitUntil:'commit',timeout:BROWSER_NAVIGATION_TIMEOUT_MS}),RELOAD_EXTERNAL_DEADLINE_MS);
    activeStage='mobile post-reload diagnostic';
    await withDeadline('mobile post-reload diagnostic',observeWorkspaceBootstrap(mobilePage,'mobile post-reload',mobilePageErrors),DIAGNOSTIC_EXTERNAL_DEADLINE_MS);
    activeStage='mobile workspace reveal';
    await withDeadline('mobile workspace reveal',assertWorkspace(mobilePage,'mobile',mobilePageErrors),WORKSPACE_EXTERNAL_DEADLINE_MS);
    const menu=mobilePage.locator('#mobileMenuButton');await menu.waitFor({state:'visible',timeout:10000});await menu.tap({timeout:10000});
    await mobilePage.waitForFunction(()=>document.body.classList.contains('mobile-nav-open'),null,{timeout:5000});
    const menuState=await mobilePage.evaluate(()=>{const nav=document.querySelector('#workspaceSidebar > .nav');return {expanded:document.getElementById('mobileMenuButton')?.getAttribute('aria-expanded'),bodyTouch:getComputedStyle(document.body).touchAction,navTouch:nav?getComputedStyle(nav).touchAction:'',overflow:nav?getComputedStyle(nav).overflowY:'',max:nav?Math.max(0,nav.scrollHeight-nav.clientHeight):0}});
    assert(menuState.expanded==='true','authenticated mobile menu did not expand');
    assert(menuState.bodyTouch!=='none','authenticated mobile menu disabled all touch handling');
    assert(/pan-y|auto/i.test(menuState.navTouch),'authenticated mobile drawer lost vertical touch scrolling');
    assert(/auto|scroll/i.test(menuState.overflow),'authenticated mobile drawer is not vertically scrollable');
    if(menuState.max>0){
      const scrolled=await mobilePage.evaluate(()=>{const nav=document.querySelector('#workspaceSidebar > .nav');const before=nav.scrollTop;const max=Math.max(0,nav.scrollHeight-nav.clientHeight);nav.scrollTop=Math.min(max,Math.max(80,Math.floor(max/2)));return nav.scrollTop>before});
      assert(scrolled,'authenticated mobile drawer could not scroll');
    }
    const mobileNav=mobilePage.locator('#workspaceSidebar [data-view]:visible');
    const mobileNavCount=await mobileNav.count();assert(mobileNavCount>0,'authenticated mobile drawer has no visible data-view navigation');
    const target=mobileNav.first();const mobileView=await target.getAttribute('data-view');await target.tap({timeout:10000});await mobilePage.waitForTimeout(250);
    if(await mobilePage.locator('#mobileNavClose').isVisible().catch(()=>false))await mobilePage.locator('#mobileNavClose').tap({timeout:5000});
    await mobilePage.waitForFunction(()=>!document.body.classList.contains('mobile-nav-open'),null,{timeout:5000});
    const mobileResponsive=await mobilePage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>resolve(true),60))));
    assert(mobileResponsive===true,'authenticated mobile workspace stopped responding after navigation');
    mark('authenticated mobile continuation',`same owner identity opened/scrolled drawer and ${mobileView||'workspace'} navigation stayed responsive`);
    await mobile.close();
    activeStage='browser proof complete';
  }finally{
    clearTimeout(watchdog);
    await withDeadline('browser close',browser.close().catch(()=>{}),BROWSER_CLOSE_DEADLINE_MS).catch(error=>info('browser close',safe(error?.message||error)));
  }
}

globalThis.__thebeSyntheticBrowserProof=async credentials=>{
  assert(credentials&&credentials.email&&credentials.password&&credentials.companyName,'canonical synthetic credentials were not supplied to browser proof');
  mark('desktop registration pass 2','canonical production registration completed and owner login returned 200; proving that same identity in browsers');
  await runBrowserProof(credentials);
  browserProofComplete=true;
};

try{
  await import('./production-synthetic-lifecycle.mjs');
  assert(browserProofComplete,'canonical lifecycle finished without completing desktop/mobile browser proof');
  mark('synthetic browser wrapper','desktop 3-pass registration boundary + authenticated mobile continuation completed before canonical cleanup');
}finally{
  delete globalThis.__thebeSyntheticBrowserProof;
}
