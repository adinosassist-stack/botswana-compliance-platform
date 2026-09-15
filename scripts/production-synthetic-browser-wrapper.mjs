import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const BROWSER_FETCH_TIMEOUT_MS=15000;
const BROWSER_PROOF_WATCHDOG_MS=120000;
const desktopAgent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const mobileAgent='Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
let browserProofComplete=false;

function assert(condition,message){if(!condition)throw new Error(`Synthetic browser proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}
assert(executablePath,'no Chromium-compatible browser found');

async function assertWorkspace(page,label){
  await page.waitForFunction(()=>{
    const shell=document.getElementById('appShell');
    const marketing=document.getElementById('marketingGate');
    const auth=document.getElementById('authGate');
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return !shell.classList.contains('hidden')&&style.display!=='none'&&style.visibility!=='hidden'&&
      !!document.getElementById('workspaceSidebar')&&marketing?.classList.contains('hidden')&&auth?.classList.contains('hidden');
  },null,{timeout:30000});
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
  const watchdog=setTimeout(()=>{browser.close().catch(()=>{})},BROWSER_PROOF_WATCHDOG_MS);
  try{
    const desktop=await browser.newContext({viewport:{width:1440,height:1100},screen:{width:1440,height:1100},userAgent:desktopAgent});
    const page=await desktop.newPage();
    page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
    const pageErrors=[];const criticalFailures=[];
    page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
    page.on('requestfailed',r=>{const url=r.url();if(url.startsWith(ORIGIN+'/js/')||url.startsWith(ORIGIN+'/assets/'))criticalFailures.push(`${r.method()} ${url} ${r.failure()?.errorText||''}`)});
    const response=await page.goto(`${ORIGIN}/register-direct.html?desktop-registration-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
    assert(response?.status()===200,'desktop registration route did not return 200');
    assert(/Create your account/i.test((await page.locator('body').innerText()).slice(0,1000)),'desktop registration heading missing');
    for(const id of ['#companyName','#email','#password','#submitBtn','#status'])assert(await page.locator(id).count(),`desktop registration control missing ${id}`);
    await page.locator('#companyName').fill('A');await page.locator('#email').fill('bad');await page.locator('#password').fill('short');await page.locator('#submitBtn').click();
    await page.waitForFunction(()=>document.getElementById('status')?.classList.contains('show'),null,{timeout:5000});
    assert(/business name/i.test(await page.locator('#status').innerText()),'desktop invalid registration did not fail closed');
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

    await page.goto(`${ORIGIN}/?desktop-owner-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
    await loginInBrowser(page,credentials);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await assertWorkspace(page,'desktop');
    const desktopNav=page.locator('#workspaceSidebar [data-view]:visible');
    const desktopNavCount=await desktopNav.count();assert(desktopNavCount>0,'desktop owner workspace has no visible data-view navigation');
    const firstDesktopNav=desktopNav.first();const desktopView=await firstDesktopNav.getAttribute('data-view');await firstDesktopNav.click({timeout:10000});
    const desktopResponsive=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>resolve(true),60))));
    assert(desktopResponsive===true,'desktop owner workspace stopped responding after navigation');
    assert(pageErrors.length===0,`desktop page errors: ${safe(pageErrors.join(' | '))}`);
    assert(criticalFailures.length===0,`desktop critical assets failed: ${safe(criticalFailures.join(' | '))}`);
    mark('desktop registration pass 3',`canonical synthetic owner reached workspace and ${desktopView||'workspace'} navigation stayed responsive`);
    await desktop.close();

    const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:mobileAgent});
    const mobilePage=await mobile.newPage();
    mobilePage.setDefaultTimeout(15000);mobilePage.setDefaultNavigationTimeout(45000);
    await mobilePage.goto(`${ORIGIN}/?authenticated-mobile-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
    await loginInBrowser(mobilePage,credentials);
    await mobilePage.reload({waitUntil:'domcontentloaded',timeout:45000});
    await assertWorkspace(mobilePage,'mobile');
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
  }finally{
    clearTimeout(watchdog);
    await browser.close().catch(()=>{});
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
