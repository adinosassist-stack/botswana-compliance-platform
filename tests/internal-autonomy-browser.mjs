import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const source=fs.readFileSync('public/js/owner-command-centre.js','utf8');
assert.match(source,/if\(shell\)\{ensureInternalAutonomyPanel\(shell\);return shell;\}/,'existing shells must re-evaluate owner-only controls after role hydration');
const factory=source.slice(source.indexOf('  function internalAutonomyPanel(){'),source.indexOf('  const clone='));
assert.ok(factory.includes('Authorize all three workflows'));
const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox']});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.setContent('<select id="companySelect"><option value="a">A</option><option value="b">B</option></select><main id="host"></main>');
  await page.addStyleTag({content:fs.readFileSync('public/assets/owner-command-centre.css','utf8')});
  await page.addScriptTag({content:`
    const q=(s,r=document)=>r.querySelector(s);
    let isOwner=false; const canEdit=()=>isOwner;
    const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
    const button=(label,fn,cls)=>{const n=text('button',label,cls);n.type='button';n.addEventListener('click',fn);return n;};
    window.calls=[];window.active=false;
    const request=async(url,options={})=>{
      calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      if(url==='/api/agentic/internal-autonomy'&&!options.method)return {policies:active?[{id:'policy-a',status:'active',policy:{expiresAt:new Date(Date.now()+86400000).toISOString(),intervalHours:24,taskTemplate:{title:'<img onerror=alert(1)>'}},next_run_at:new Date().toISOString()}]:[],runs:active?[{createdAt:new Date().toISOString(),report:{sources:[{actionKey:'business_health.read',data:{openPerformanceSignals:2}},{actionKey:'daily_operations_summary.read',data:{available:false}}]},record:{}}]:[]};
      if(url==='/api/agentic/authority/delegations'&&!options.method)return {items:[]};
      if(url==='/api/agentic/authority/delegations')return {delegation:{id:'delegation-a'}};
      if(url==='/api/agentic/task-execution/status')return {activeGrants:[]};
      if(url==='/api/agentic/internal-autonomy'&&options.method==='POST'){active=true;return {id:'policy-a'};}
      if(url.endsWith('/revoke'))active=false;
      return {ok:true};
    };
    ${factory}
    ensureInternalAutonomyPanel(document.getElementById('host'));
  `});
  assert.equal(await page.locator('#ownerInternalAutonomyPanel').count(),0,'unresolved/non-owner role does not mount owner controls');
  await page.evaluate(()=>{isOwner=true;ensureInternalAutonomyPanel(document.getElementById('host'));ensureInternalAutonomyPanel(document.getElementById('host'));});
  assert.equal(await page.locator('#ownerInternalAutonomyPanel').count(),1,'late owner hydration mounts once into the existing shell');
  await page.locator('#ownerInternalAutonomyPanel > summary').click();
  await page.getByRole('button',{name:'Authorize all three workflows'}).click();
  await page.getByRole('button',{name:'Revoke authorization'}).waitFor();
  const calls=await page.evaluate(()=>window.calls);
  const policy=calls.find(c=>c.url==='/api/agentic/internal-autonomy'&&c.method==='POST');
  assert.deepEqual(policy.body.scopes,['tasks','drafts','records']);assert.equal(policy.body.maxDailyRuns,5);assert.equal(policy.body.intervalHours,24);
  assert.equal(calls.filter(c=>c.url.endsWith('/run')).length,1);
  assert.equal(await page.locator('#ownerInternalAutonomyPanel img').count(),0,'owner task names use safe DOM text');
  await page.locator('#ownerInternalAutonomyPanel details > summary').click();
  assert.equal(await page.getByText('Open signals: 2',{exact:true}).isVisible(),true,'report uses readable evidence labels');
  assert.equal(await page.getByText('No operations summary has been recorded yet.',{exact:true}).isVisible(),true,'missing source is explicit');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'panel fits the viewport');
  await page.getByRole('button',{name:'Revoke authorization'}).click();
  await page.getByRole('button',{name:'Authorize all three workflows'}).waitFor();
  await page.selectOption('#companySelect','b');
  assert.equal(await page.locator('#ownerInternalAutonomyPanel').getAttribute('open'),null,'company switch closes the old scope');
  await page.evaluate(()=>{isOwner=false;ensureInternalAutonomyPanel(document.getElementById('host'));});
  assert.equal(await page.locator('#ownerInternalAutonomyPanel').count(),0,'role loss removes the owner controls');
  await page.close();
 }
 console.log('internal autonomy desktop/mobile standing authorization, run, revoke, tenant switch and safe rendering: PASS');
}finally{await browser.close();}
