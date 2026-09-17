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
  page.on('response',response=>{
    try{
      const url=new URL(response.url());
      if(url.origin===ORIGIN&&url.pathname==='/js/api-client.js')scriptResponses.push({url:url.href,status:response.status()});
    }catch{}
  });

  const root=await page.goto(`${ORIGIN}/?client-runtime-proof=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
  assert(root?.status()===200,`root returned HTTP ${root?.status()||0}`);
  const expected=String((await root.allHeaders())['x-thebe-client-release']||'');
  const implementation=String((await root.allHeaders())['x-thebe-client-implementation']||'');
  assert(implementation===EXPECTED_IMPLEMENTATION,`unexpected implementation ${implementation||'missing'}`);
  assert(new RegExp(`^${EXPECTED_IMPLEMENTATION}-[0-9a-f]{12}$`).test(expected),`invalid runtime release ${expected||'missing'}`);

  await page.waitForFunction(()=>typeof window.BW?.api?.createClient==='function',null,{timeout:15000});
  const domSrc=await page.locator('script[src*="/js/api-client.js"]').first().getAttribute('src');
  assert(domSrc,'API client script tag missing');
  const domVersion=new URL(domSrc,ORIGIN).searchParams.get('v');
  assert(domVersion===expected,`DOM API client version ${domVersion||'missing'} does not match response ${expected}`);

  await page.waitForFunction(()=>[...document.scripts].some(script=>String(script.src||'').includes('/js/api-client.js')),null,{timeout:5000});
  assert(scriptResponses.length>=1,'browser did not observe an API client network response');
  const loaded=new URL(scriptResponses.at(-1).url);
  assert(scriptResponses.at(-1).status===200,`API client returned HTTP ${scriptResponses.at(-1).status}`);
  assert(loaded.searchParams.get('v')===expected,`browser loaded ${loaded.searchParams.get('v')||'unversioned'} instead of ${expected}`);

  const version=await page.evaluate(async()=>{
    const response=await fetch('/api/version',{credentials:'same-origin',cache:'no-store'});
    return {status:response.status,body:await response.json()};
  });
  assert(version.status===200&&version.body?.ok===true,'/api/version did not return release provenance');
  const sourceSha=String(version.body?.sourceSha||'').toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(sourceSha),'release source SHA missing from /api/version');
  assert(expected.endsWith(sourceSha.slice(0,12)),`runtime ${expected} is not bound to source ${sourceSha}`);
  assert(pageErrors.length===0,`page errors: ${safe(pageErrors.join(' | '))}`);

  console.log(`CLIENT_RUNTIME_PROOF_PASS release=${expected} source=${sourceSha}`);
  await context.close();
}finally{
  await browser.close().catch(()=>{});
}
