import fs from 'node:fs';
import {chromium} from 'playwright-core';

const ORIGIN='https://thebedesk.com';
const EXPECTED_IMPLEMENTATION='transport-fallback-race-v2';
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>fs.existsSync(path));

function assert(condition,message){if(!condition)throw new Error(`Client runtime proof failed: ${message}`)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,240)}

assert(executablePath,'no Chromium-compatible browser found');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  const scriptResponses=[];
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(safe(error?.stack||error)));
  page.on('response',async response=>{
    try{
      const url=new URL(response.url());
      if(url.origin===ORIGIN&&url.pathname==='/js/api-client.js'){
        const headers=await response.allHeaders();
        scriptResponses.push({
          url:url.href,
          status:response.status(),
          release:String(headers['x-thebe-client-release']||''),
          implementation:String(headers['x-thebe-client-implementation']||'')
        });
      }
    }catch{}
  });

  const root=await page.goto(`${ORIGIN}/?client-runtime-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
  assert(root?.status()===200,`root returned HTTP ${root?.status()||0}`);
  const rootHeaders=await root.allHeaders();
  const expected=String(rootHeaders['x-thebe-client-release']||'');
  const implementation=String(rootHeaders['x-thebe-client-implementation']||'');
  assert(implementation===EXPECTED_IMPLEMENTATION,`unexpected implementation ${implementation||'missing'}`);
  assert(new RegExp(`^${EXPECTED_IMPLEMENTATION}-[0-9a-f]{12}$`).test(expected),`invalid runtime release ${expected||'missing'}`);

  // The public-root guard may not retain the originating <script> node in the DOM.
  // Runtime authority therefore comes from the browser's actual network/resource
  // observations plus the initialized API object, not from persistent markup.
  await page.waitForFunction(()=>typeof window.BW?.api?.createClient==='function',null,{timeout:15000});
  if(scriptResponses.length===0){
    const signIn=page.locator('#marketingGate [data-guest-action]').first();
    if(await signIn.count()){
      await signIn.click({timeout:10000});
      await page.waitForFunction(()=>!document.getElementById('authGate')?.classList.contains('hidden'),null,{timeout:10000});
    }
  }
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>{
    try{return new URL(entry.name).pathname==='/js/api-client.js'}catch{return false}
  }),null,{timeout:10000});

  const resourceUrls=await page.evaluate(()=>performance.getEntriesByType('resource')
    .map(entry=>String(entry.name||''))
    .filter(name=>{try{return new URL(name).pathname==='/js/api-client.js'}catch{return false}}));
  assert(resourceUrls.length>=1,'browser performance timeline did not observe API client resource');
  const loaded=new URL(resourceUrls.at(-1));
  assert(loaded.searchParams.get('v')===expected,`browser loaded ${loaded.searchParams.get('v')||'unversioned'} instead of ${expected}`);
  assert(scriptResponses.length>=1,'browser response stream did not observe API client network response');
  const observed=scriptResponses.at(-1);
  assert(observed.status===200,`API client returned HTTP ${observed.status}`);
  const observedUrl=new URL(observed.url);
  assert(observedUrl.searchParams.get('v')===expected,`network response loaded ${observedUrl.searchParams.get('v')||'unversioned'} instead of ${expected}`);
  if(observed.release)assert(observed.release===expected,`API client response identity ${observed.release} does not match root ${expected}`);
  if(observed.implementation)assert(observed.implementation===implementation,`API client response implementation ${observed.implementation} does not match root ${implementation}`);

  const version=await page.evaluate(async()=>{
    const response=await fetch('/api/version',{credentials:'same-origin',cache:'no-store'});
    return {status:response.status,body:await response.json()};
  });
  assert(version.status===200&&version.body?.ok===true,'/api/version did not return release provenance');
  const sourceSha=String(version.body?.sourceSha||'').toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(sourceSha),'release source SHA missing from /api/version');
  assert(expected.endsWith(sourceSha.slice(0,12)),`runtime ${expected} is not bound to source ${sourceSha}`);
  assert(pageErrors.length===0,`page errors: ${safe(pageErrors.join(' | '))}`);

  console.log(`CLIENT_RUNTIME_PROOF_PASS release=${expected} source=${sourceSha} resource=${loaded.pathname}?v=${loaded.searchParams.get('v')}`);
  await context.close();
}finally{
  await browser.close().catch(()=>{});
}
