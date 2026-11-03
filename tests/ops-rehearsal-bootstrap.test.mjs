import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../cloudflare/src/ops-rehearsal-entry.js';
import {renderOpsRehearsalConfig} from '../scripts/render-ops-rehearsal-config.mjs';

const input={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),OPS_WORKER_D1_ID:'c5c232a8-8fe7-440c-81ba-021a44fd3fdd',
 OPS_REHEARSAL_SOURCE_SHA:'b'.repeat(40)};

test('offline package uses only the verified app D1 and rehearsal evidence bucket',()=>{
 const c=renderOpsRehearsalConfig(input);
 assert.equal(c.name,'bw-compliance-os-ops-rehearsal');
 assert.equal(c.d1_databases.length,1);
 assert.equal(c.d1_databases[0].database_id,input.OPS_WORKER_D1_ID);
 assert.deepEqual(c.r2_buckets,[{binding:'EVIDENCE',bucket_name:'bw-compliance-ops-evidence'}]);
 assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.equal(c.keep_vars,false);
 assert.deepEqual(c.routes,[]);assert.deepEqual(c.triggers.crons,[]);
 assert.equal(c.vars.APP_ENV,'rehearsal');assert.equal(c.vars.AI_FEATURES_DEFAULT,'off');
 assert.equal(c.vars.EVIDENCE_UPLOADS_ENABLED,'false');assert.equal(c.vars.POP_UPLOAD_STAGING_ENABLED,'false');
 assert.equal(c.vars.AGENT_BOUNDED_TASK_EXECUTION_ENABLED,'0');
 for(const field of ['assets','ai','services','secrets','durable_objects','queues'])assert.equal(c[field],undefined);
});

test('production, billing, regulatory, POP, conversation, restore and unverified D1 IDs are refused',()=>{
 for(const id of ['', '8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','9d1b8852-4424-46e9-ba24-cdad5ced215f',
  '20c0d37e-552e-438f-a56d-3f12c27d38e2','812f9021-890b-41e6-8fa1-6001f90a9b53',
  '95c48030-0395-44cb-aa95-622beaf4efdf','07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8',
  '11111111-1111-4111-8111-111111111111'])
  assert.throws(()=>renderOpsRehearsalConfig({...input,OPS_WORKER_D1_ID:id}),/verified_database_required/);
 assert.throws(()=>renderOpsRehearsalConfig({...input,OPS_RESTORE_D1_ID:input.OPS_WORKER_D1_ID}),/verified_database_required/);
});

test('missing account and nonexact source revision cannot produce a configuration',()=>{
 assert.throws(()=>renderOpsRehearsalConfig({...input,CLOUDFLARE_ACCOUNT_ID:''}),/account_required/);
 for(const sha of ['', 'main','abcdef0','B'.repeat(40)])
  assert.throws(()=>renderOpsRehearsalConfig({...input,OPS_REHEARSAL_SOURCE_SHA:sha}),/exact_sha_required/);
});

test('bootstrap never reports readiness or touches storage, including write and ops routes',async()=>{
 let calls=0;
 const binding=new Proxy({}, {get(){calls++;throw Error('storage must not be accessed')}});
 const env={...renderOpsRehearsalConfig(input).vars,DB:binding,EVIDENCE:binding};
 for(const path of ['/','/api/ready','/api/ops/diagnostics','/api/auth/login','/api/platform/billing/manual-payments']){
  for(const method of ['GET','POST','DELETE']){
   const r=await worker.fetch(new Request('https://rehearsal.invalid'+path,{method}),env);
   assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');
   assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
   assert.deepEqual(await r.json(),{error:'ops_rehearsal_not_qualified',ready:false,activationEnabled:false});
  }
 }
 assert.equal(calls,0);
});

test('production context or mismatched identity remains disabled',async()=>{
 const env=renderOpsRehearsalConfig(input).vars;
 for(const patch of [{APP_ENV:'production'},{DEPLOYMENT_PROFILE:'workers-free-first'},
  {REHEARSAL_APP_D1_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'},{OPS_REHEARSAL_SOURCE_SHA:'main'}]){
  const r=await worker.fetch(new Request('https://example.invalid/api/ready'),{...env,...patch});
  assert.equal(r.status,503);assert.equal((await r.json()).error,'ops_rehearsal_configuration_required');
 }
});

test('production and billing entries do not mount the locked rehearsal entry',()=>{
 for(const path of ['cloudflare/src/worker.js','cloudflare/src/production-entry.js',
  'cloudflare/src/release-governance-entry.js','cloudflare/src/billing-staging-entry.js'])
  assert.doesNotMatch(fs.readFileSync(path,'utf8'),/ops-rehearsal-entry/);
});
