import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright-core');
const executablePath=[process.env.CHROMIUM_EXECUTABLE_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(p=>fs.existsSync(p));
const source=fs.readFileSync('public/employee-proposal-review-panel.js','utf8').replace('export function mountEmployeeProposalReviewQueue','function mountEmployeeProposalReviewQueue');
const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox']});
let scenarios=0;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000);
  const mount=async({enabled=true,grants=[{delegationId:'delegation-a'}],failPreparation=false}={})=>{
   await page.setContent('<main id="host"></main>');
   await page.addScriptTag({content:`(()=>{${source}
    window.calls=[];window.release=null;window.delay=false;window.failPreparation=${JSON.stringify(failPreparation)};
    window.options=${JSON.stringify({enabled,grants})};
    window.approved=[{proposalKey:'approved-a',payload:{title:'Review onboarding <img src=x onerror=alert(1)>',employeeId:'employee-a',workflowName:'Onboarding',dueDate:'2026-11-01'}}];
    const fetcher=async(path,options={})=>{
     const body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method||'GET',body});
     if(body?.action==='prepare_task'){
      if(delay)await new Promise(resolve=>{release=resolve});
      if(failPreparation)return {ok:false,status:409};
      return {ok:true,data:{ok:true,request:{id:'request-a',status:'prepared'},execution:{performed:false}}};
     }
     if(path==='/api/agentic/task-execution/status')return {ok:true,data:{schemaReady:true,activeGrants:window.options.grants}};
     if(path.includes('view=approved'))return {ok:true,data:{ok:true,proposals:approved,nextCursor:path.includes('after=')?null:'cursor-a',taskPreparationEnabled:window.options.enabled}};
     return {ok:true,data:{ok:true,proposals:[],taskPreparationEnabled:window.options.enabled}};
    };
    window.dispose=mountEmployeeProposalReviewQueue(document.getElementById('host'),{fetcher});})();`});
   await page.getByRole('status').filter({hasText:'No pending reviews.'}).waitFor();
  };
  await mount();
  assert.equal((await page.evaluate(()=>calls)).length,1,'initial mount only reads pending reviews');
  await page.getByRole('button',{name:'Approved proposals',exact:true}).click();
  const prepare=page.getByRole('button',{name:'Prepare task for owner review',exact:true});await prepare.waitFor();
  assert.equal(await page.locator('#host img').count(),0,'proposal titles render as text');
  await page.evaluate(()=>{delay=true});await prepare.click();
  assert.equal(await prepare.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Pending reviews',exact:true}).isDisabled(),true);
  await page.evaluate(()=>release());await page.getByRole('status').filter({hasText:'Separate owner approval is required.'}).waitFor();
  const posts=await page.evaluate(()=>calls.filter(c=>c.method==='POST'));
  assert.deepEqual(posts,[{path:'/api/employee-workflow-reviews',method:'POST',body:{action:'prepare_task',proposalKey:'approved-a',delegationId:'delegation-a'}}]);
  assert.equal(await prepare.isDisabled(),true,'success prevents repeated click until refresh');
  assert.ok(!posts.some(c=>/approve|execute|permit/.test(c.path)),'the panel never invokes approval or execution endpoints');
  await page.getByRole('button',{name:'Next approved proposals',exact:true}).click();
  await page.getByRole('button',{name:'Previous approved proposals',exact:true}).waitFor();
  assert.ok((await page.evaluate(()=>calls)).some(c=>c.path.includes('after=cursor-a')));
  await page.getByRole('button',{name:'Previous approved proposals',exact:true}).click();await prepare.waitFor();
  scenarios++;
  await mount({enabled:false});assert.equal(await page.getByRole('button',{name:'Approved proposals',exact:true}).isVisible(),false);
  assert.equal((await page.evaluate(()=>calls)).length,1);scenarios++;
  await mount({grants:[]});await page.getByRole('button',{name:'Approved proposals',exact:true}).click();
  await page.getByRole('status').filter({hasText:'An owner must authorize internal task creation'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Prepare task for owner review',exact:true}).count(),0);scenarios++;
  await mount({failPreparation:true});await page.getByRole('button',{name:'Approved proposals',exact:true}).click();await prepare.click();
  await page.getByRole('status').filter({hasText:'Refresh approved proposals before trying again.'}).waitFor();
  assert.equal(await prepare.isDisabled(),false);scenarios++;
  await mount();await page.getByRole('button',{name:'Approved proposals',exact:true}).click();await page.evaluate(()=>{delay=true});await prepare.click();
  await page.evaluate(()=>{dispose();document.getElementById('host').textContent='New workspace';release();});
  await page.waitForTimeout(25);assert.equal(await page.locator('#host').textContent(),'New workspace');scenarios++;
  await page.close();
 }
 console.log('Employee task preparation browser: '+scenarios+' mobile/desktop scenarios PASS');
}finally{await browser.close()}
