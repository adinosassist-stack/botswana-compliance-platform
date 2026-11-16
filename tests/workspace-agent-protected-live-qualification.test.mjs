import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {requireGate,verifyBaseline,assertReceipt,completeZoneRoutes,wranglerArgs,cloudflareApiUrl,ACCOUNT,INERT_VERSION,DB,TARGET,PHRASE} from '../scripts/workspace-agent-protected-live-qualification.mjs';
const path=new URL('../.github/workflows/workspace-agent-protected-live-qualification.yml',import.meta.url);
const yaml=readFileSync(path,'utf8');
function baseline(){return {targetDeployment:{versions:[{version_id:INERT_VERSION,percentage:100}]},
  targetSubdomain:{enabled:false,previews_enabled:false},targetSchedules:[],targetDomains:[],
  d1:{uuid:DB,name:TARGET,num_tables:0},targetSettings:{bindings:[
    {name:'AGENT_BOUNDED_TASK_EXECUTION_ENABLED',type:'plain_text'},
    {name:'APP_ENV',type:'plain_text'},{name:'PAYMENT_PROVIDER',type:'plain_text'},
    {name:'POP_UPLOAD_STAGING_ENABLED',type:'plain_text'},
    {name:'THEBE_GENERAL_AI_ENABLED',type:'plain_text'},
    {name:'THEBE_INTERNAL_AUTONOMY_ENABLED',type:'plain_text'},
    {name:'THEBE_LIVE_VOICE_ENABLED',type:'plain_text'},
    {name:'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',type:'plain_text',text:'false'}]},
  callerExists:false,zoneRoutes:[]};}
const gate={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'7c1bc8cb5dc0a98114511cf11e31d0473487740d',
  EXPECTED_MAIN_SHA:'7c1bc8cb5dc0a98114511cf11e31d0473487740d',
  CONFIRMATION:PHRASE,GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',
  GITHUB_ACTIONS:'true',CLOUDFLARE_API_TOKEN:'fake',WORKSPACE_AGENT_QUALIFICATION_ENVIRONMENT:'workspace-agent-private-staging'};

test('workflow is dispatch only, exact-main protected, independently reviewed with rollback',()=>{
  assert.match(yaml,/workflow_dispatch:/);
  assert.doesNotMatch(yaml,/^\s+RUNNER_ENVIRONMENT:/m);
  assert.equal((yaml.match(/WORKSPACE_AGENT_QUALIFICATION_ENVIRONMENT: workspace-agent-private-staging/g) || []).length,2);assert.doesNotMatch(yaml,/\n  (push|pull_request|schedule):/);
  for(const pattern of [/environment: workspace-agent-private-staging/,/prevent_self_review == true/,
    /users\/thusico/,/expected_main_sha/,/preflight_run_id/,/\.conclusion == "success"/,
    /github\.ref == 'refs\/heads\/main'/,/concurrency:/,/cancel-in-progress: false/,
    /--dry-run/,/--verify-only/,/if: always\(\)/,/CLOUDFLARE_API_TOKEN:/,/GITHUB_TOKEN:/])assert.match(yaml,pattern);
});
test('fail closed when any owner, SHA or environment gate is incorrect',()=>{
  requireGate({...gate,RUNNER_ENVIRONMENT:'github-hosted'});
  assert.throws(()=>requireGate({...gate,WORKSPACE_AGENT_QUALIFICATION_ENVIRONMENT:undefined,
    RUNNER_ENVIRONMENT:'workspace-agent-private-staging'}),/gate_failed/);
  for(const field of Object.keys(gate)){
    assert.throws(()=>requireGate({...gate,[field]:field==='CLOUDFLARE_API_TOKEN'?'':'wrong'}),/gate_failed/,field);
  }
});
test('baseline demands exact inert version, zero tables and no ingress or bindings',()=>{
  assert.equal(verifyBaseline(baseline()),true);
  const changes=[b=>b.targetDeployment.versions[0].version_id='bad',
    b=>b.d1.num_tables=1,b=>b.callerExists=true,b=>b.zoneRoutes.push({script:TARGET}),
    b=>b.targetSubdomain.enabled=true,b=>b.targetSubdomain.previews_enabled=true,
    b=>b.targetSchedules.push({cron:'* * * * *'}),b=>b.targetDomains.push({hostname:'example.com'}),
    b=>b.targetSettings.bindings[0].type='d1',
    b=>b.targetSettings.bindings[7].text='true',
    b=>b.targetSettings.bindings.pop()];
  for(const change of changes){const b=baseline();change(b);assert.throws(()=>verifyBaseline(b),undefined,String(change));}
});
test('receipt requires all seven exact authorization results and cleanup',()=>{
 const good={event:'workspace_agent_qualification',results:[
    {case:'owner-a',status:200},{case:'manager-a',status:200},{case:'owner-b',status:200},
    {case:'viewer',status:403},{case:'expired',status:401},{case:'revoked',status:401},
    {case:'no-session',status:401},
 ],mutationDenied:true,unrelatedPathDenied:true,fixturesRemoved:true};
 assert.equal(assertReceipt(good),true);
 for(const key of ['fixturesRemoved','mutationDenied','unrelatedPathDenied'])
   assert.throws(()=>assertReceipt({...good,[key]:false}));
 assert.throws(()=>assertReceipt({...good,results:good.results.slice(1)}));
 assert.throws(()=>assertReceipt({...good,results:good.results.map((r,i)=>i? r : {...r,status:403})}));
});

test('Wrangler invocation uses an actual resolved executable and version-only upload',()=>{
  const argv=wranglerArgs('/tmp/synthetic-caller.json','/tmp/synthetic-secrets.json');
  assert.ok(argv.every(a=>typeof a==='string' && a.length>0));
  assert.ok(argv[0].replaceAll(String.fromCharCode(92),'/').endsWith('/node_modules/wrangler/bin/wrangler.js'));
  assert.deepEqual(argv.slice(1,3),['versions','upload']);
  assert.ok(argv.includes('--strict'));
  assert.deepEqual(argv.slice(argv.indexOf('--config'),argv.indexOf('--config')+2),
    ['--config','/tmp/synthetic-caller.json']);
  assert.deepEqual(argv.slice(argv.indexOf('--secrets-file'),argv.indexOf('--secrets-file')+2),
    ['--secrets-file','/tmp/synthetic-secrets.json']);
  assert.ok(!argv.includes('deploy'));
});
test('route inventory is unpaginated or provably complete, with strict shape',()=>{
  const route={id:'r123',pattern:'thebedesk.com/*',script:'unrelated-worker'};
  assert.deepEqual(completeZoneRoutes({success:true,result:[route]}),[route]);
  assert.deepEqual(completeZoneRoutes({success:true,result:[],result_info:{page:1,total_pages:1,total_count:0,count:0}}),[]);
  for(const bad of [
    {success:true,result:[],result_info:{page:1,total_pages:2,count:0,total_count:1}},
    {success:true,result:[],result_info:{page:1,count:0,total_count:1}},
    {success:true,result:[],result_info:null},
    {success:true,result:[{}]},
    {success:true,result:[route,route]},
    {success:true,result:[{...route,script:42}]},
    {success:true,result:null},
  ]) assert.throws(()=>completeZoneRoutes(bad),/zone_routes_(invalid|incomplete)/);
});

test('Cloudflare route inventory calls global zone endpoint, while Worker and D1 remain account scoped',()=>{
  const zoneId='a'.repeat(32);
  assert.equal(cloudflareApiUrl(`/zones/${zoneId}/workers/routes`),
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`);
  assert.equal(cloudflareApiUrl('/workers/scripts/bw-workspace-agent-staging/settings'),
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/bw-workspace-agent-staging/settings`);
  assert.equal(cloudflareApiUrl('/d1/database/fa317ccc-683d-4466-9e3a-e296872d58ba'),
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/fa317ccc-683d-4466-9e3a-e296872d58ba`);
  assert.throws(()=>cloudflareApiUrl('https://example.invalid'),/invalid_cloudflare_api_path/);
});
