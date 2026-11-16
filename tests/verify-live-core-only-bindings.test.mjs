import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {identifyActiveCoreDeployment,verifyLiveCoreOnlyBindings,
  readAndVerifyLiveCoreOnlyBindings} from '../scripts/verify-live-core-only-bindings.mjs';

const values={APP_ENV:'production',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_AI_EXPORTS_ENABLED:'false',
  THEBE_GENERAL_AI_ENABLED:'false'};
const deploymentId='11111111-1111-4111-8111-111111111111';
const versionId='22222222-2222-4222-8222-222222222222';
const otherDeployment='33333333-3333-4333-8333-333333333333';
const bindings=()=>Object.entries(values).map(([name,text])=>({name,text,type:'plain_text'}));
const version=(id=versionId)=>({success:true,result:{id,resources:{bindings:bindings()}}});
const deployments=(id=deploymentId,versions=[{version_id:versionId,percentage:100}])=>({
  success:true,result:{deployments:[{id,created_on:'2026-11-11T09:00:00Z',
    strategy:'percentage',versions}]}
});
const ok=body=>({ok:true,text:async()=>JSON.stringify(body)});

test('accepts only the single active 100 percent Worker deployment',()=>{
  assert.equal(identifyActiveCoreDeployment(deployments()).versionId,versionId);
  for(const payload of [null,{success:false,result:{deployments:[]}},
    {success:true,result:{deployments:[]}},deployments('not-uuid'),
    deployments(deploymentId,[]),
    deployments(deploymentId,[{version_id:versionId,percentage:50},
      {version_id:'44444444-4444-4444-8444-444444444444',percentage:50}]),
    deployments(deploymentId,[{version_id:versionId,percentage:99}]),
    {success:true,result:{deployments:[{id:deploymentId,created_on:'invalid',
      strategy:'percentage',versions:[{version_id:versionId,percentage:100}]}]}}
  ])assert.throws(()=>identifyActiveCoreDeployment(payload),/live_core_deployment_unqualified/);
});

test('requires explicit flags in immutable version details, never script settings',()=>{
  assert.equal(verifyLiveCoreOnlyBindings(version()).popIngestionEnabled,false);
  assert.throws(()=>verifyLiveCoreOnlyBindings({success:true,result:{bindings:bindings()}}),
    /live_core_bindings_unavailable/);
  for(const name of Object.keys(values)){
    for(const variant of ['missing','enabled','secret','duplicate']){
      const payload=version(),entries=payload.result.resources.bindings;
      const i=entries.findIndex(x=>x.name===name);
      if(variant==='missing')entries.splice(i,1);
      if(variant==='enabled')entries[i].text='true';
      if(variant==='secret')entries[i].type='secret_text';
      if(variant==='duplicate')entries.push({...entries[i]});
      assert.throws(()=>verifyLiveCoreOnlyBindings(payload),/live_core_bindings_mismatch_/);
    }
  }
});

test('read-only immutable active version verification and race-safe second deployment GET',async()=>{
  const urls=[];
  const opts={accountId:'a'.repeat(32),token:'private-test-token',
    fetchImpl:async(url,req)=>{
      urls.push(url);
      assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
      assert.equal(req.headers.Authorization,'Bearer private-test-token');
      if(url.includes('/deployments?'))return ok(deployments());
      if(url.endsWith('/versions/'+versionId))return ok(version());
      throw Error('unexpected_url');
    }};
  const result=await readAndVerifyLiveCoreOnlyBindings(opts);
  assert.equal(result.activeVersionId,versionId);
  assert.equal(result.activeDeploymentId,deploymentId);
  assert.equal(result.evidence,'immutable_active_worker_version');
  assert.equal(result.generalAiEnabled,false);
  assert.equal(urls.length,3);
  assert.match(urls[0],/\/deployments\?per_page=1&page=1$/);
  assert.match(urls[1],new RegExp('/versions/'+versionId+'$'));
  assert.equal(urls[0],urls[2]);
  await assert.rejects(readAndVerifyLiveCoreOnlyBindings({...opts,accountId:'invalid'}),
    /credentials_missing/);
});

test('fails closed when deployment changes during version read',async()=>{
  let calls=0;
  const fetchImpl=async(url)=>{
    if(url.includes('/deployments?'))return ok(deployments(++calls===1?deploymentId:otherDeployment));
    return ok(version());
  };
  await assert.rejects(readAndVerifyLiveCoreOnlyBindings({
    accountId:'a'.repeat(32),token:'token',fetchImpl}),/live_core_deployment_changed/);
});
test('fails closed on version-ID mismatch, HTTP refusal or malformed version envelope',async()=>{
  const base={accountId:'a'.repeat(32),token:'token'};
  const mismatch=async url=>url.includes('/deployments?')?ok(deployments()):
    ok(version('44444444-4444-4444-8444-444444444444'));
  await assert.rejects(readAndVerifyLiveCoreOnlyBindings({...base,fetchImpl:mismatch}),
    /live_core_version_identity_mismatch/);
  await assert.rejects(readAndVerifyLiveCoreOnlyBindings({...base,fetchImpl:async()=>({ok:false})}),
    /live_core_bindings_read_failed/);
  const bad=async url=>url.includes('/deployments?')?ok(deployments()):
    {ok:true,text:async()=>'{broken-json'};
  await assert.rejects(readAndVerifyLiveCoreOnlyBindings({...base,fetchImpl:bad}),
    /live_core_bindings_invalid_json/);
});

test('protected deployment checks live active bindings after write and before readiness acceptance',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const name='node scripts/verify-live-core-only-bindings.mjs';
  assert.equal(workflow.split(name).length-1,1);
  const at=workflow.indexOf(name);
  const mutation=workflow.indexOf('- name: Deploy exact candidate to Cloudflare');
  const readiness=workflow.indexOf('- name: Verify live production readiness');
  assert.ok(at>mutation);assert.ok(at<readiness);
  const protectedStep=workflow.slice(mutation,readiness);
  assert.match(protectedStep,/CLOUDFLARE_API_TOKEN:.*secrets\.CLOUDFLARE_API_TOKEN/);
  assert.ok(protectedStep.indexOf('node "$WRANGLER_JS" deploy')<protectedStep.indexOf(name));
});
