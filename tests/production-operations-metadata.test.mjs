import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectProductionOperationsMetadata} from '../scripts/production-operations-metadata.mjs';

const accountId='a'.repeat(32),token='synthetic-private-token';
const databaseId='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const sourceSha='b'.repeat(40),id='11111111-2222-4333-8444-555555555555';
const fixtures=[
  {uuid:databaseId,name:'bw-compliance-os',version:'production',file_size:1024},
  {observability:{enabled:true,logs:{enabled:true,invocation_logs:true,head_sampling_rate:0.5,destinations:['private-destination']}},logpush:false,bindings:[{secret:token}]},
  {deployments:[{id,created_on:'2026-10-25T12:00:00.000Z',versions:[{version_id:id,percentage:100}],annotations:{secret:token}}]},
  {bookmark:'private-recovery-bookmark'},
  {name:'bw-compliance-evidence',creation_date:'2026-01-01T00:00:00Z',secret:token}
];
function provider(transform=x=>x){
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({success:true,result:transform(structuredClone(fixtures[calls.length-1]),calls.length-1)}));
  }};
}

test('five exact metadata GETs produce an allowlisted report, never customer queries or secrets',async()=>{
  const f=provider();
  const r=await collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f});
  assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),[
    `/client/v4/accounts/${accountId}/d1/database/${databaseId}`,
    `/client/v4/accounts/${accountId}/workers/scripts/bw-compliance-os/script-settings`,
    `/client/v4/accounts/${accountId}/workers/scripts/bw-compliance-os/deployments`,
    `/client/v4/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,
    `/client/v4/accounts/${accountId}/r2/buckets/bw-compliance-evidence`
  ]);
  for(const {options} of f.calls){assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,`Bearer ${token}`)}
  assert.equal(r.scope,'production_metadata_only');
  assert.equal(r.database.identityVerified,true);
  assert.equal(r.database.timeTravelBookmarkAvailable,true);
  assert.equal(r.worker.logging.enabled,true);
  assert.equal(r.worker.logging.samplingRate,0.5);
  assert.deepEqual(r.worker.deployments,[{id,createdAt:'2026-10-25T12:00:00.000Z',versions:[{id,percentage:100}]}]);
  assert.equal(r.recoveryRehearsalVerified,false);
  assert.equal(r.alertDeliveryVerified,false);
  const json=JSON.stringify(r);
  for(const secret of [token,accountId,databaseId,'private-destination','private-recovery-bookmark','bindings','annotations'])assert.equal(json.includes(secret),false,secret);
});

test('bad authority or production identity stops before any provider request',async()=>{
  for(const patch of [{accountId:'../other'},{token:''},{sourceSha:'main'},{databaseId:'20c0d37e-552e-438f-a56d-3f12c27d38e2'}]){
    const f=provider();await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f,...patch}),/^Error: ops_metadata_invalid_inputs$/);assert.equal(f.calls.length,0);
  }
});

test('wrong remote identities fail closed without visiting later endpoints',async()=>{
  for(const patch of [{uuid:id},{name:'different-db'}]){
    const f=provider((row,i)=>i===0?{...row,...patch}:row);
    await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f}),/ops_metadata_database_identity/);assert.equal(f.calls.length,1);
  }
  const f=provider((row,i)=>i===4?{...row,name:'different-bucket'}:row);
  await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f}),/ops_metadata_bucket_identity/);
});

test('provider failures never expose response bodies, tokens, URLs or transport messages',async()=>{
  for(const fetchImpl of [async()=>new Response(JSON.stringify({success:false,errors:[{message:token}]}),{status:401}),async()=>{throw Error(token)},async()=>new Response(token)]){
    await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,fetchImpl}),e=>e.message==='ops_metadata_database_unavailable');
  }
});

test('authentication diagnostics contain only fixed stage, status and bounded numeric provider codes',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({success:false,errors:[{code:10000,message:token},{code:token},{code:-1},{code:1000000}]}),{status:401});
  await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,fetchImpl}),error=>{
    assert.deepEqual(error.diagnostic,{stage:'database',httpStatus:401,providerCodes:[10000]});
    assert.equal(JSON.stringify(error).includes(token),false);
    return true;
  });
});

test('missing observability is unknown, not proof of logging or alert delivery',async()=>{
  const f=provider((row,i)=>i===1?{}:row);
  const r=await collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f});
  assert.deepEqual(r.worker.logging,{enabled:null,invocationLogs:null,samplingRate:null,destinationCount:null});
  assert.equal(r.alertDeliveryVerified,false);
});

test('malformed deployment or bookmark metadata cannot become operational evidence',async()=>{
  for(const [index,replacement] of [[2,{deployments:[{id:'unsafe-content'}]}],[2,{deployments:[]}],[3,{bookmark:''}]]){
    const f=provider((row,i)=>i===index?replacement:row);
    await assert.rejects(collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,...f}),/ops_metadata_(deployments|bookmark)_invalid/);
  }
});

test('workflow is manual, protected, exact-main, and exposes credentials only to the collector',()=>{
  const s=readFileSync(new URL('../.github/workflows/production-operations-metadata.yml',import.meta.url),'utf8');
  assert.match(s,/workflow_dispatch:/);assert.doesNotMatch(s,/^  (push|schedule|pull_request_target):/m);
  assert.match(s,/default: DO_NOT_RUN/);assert.match(s,/environment: production/);
  const qualification=s.split('  collect:')[0];
  assert.doesNotMatch(qualification,/secrets\.|environment: production/);
  assert.match(s,/needs: qualify/);
  assert.match(s,/github.ref == 'refs\/heads\/main'/);assert.match(s,/inputs.confirmation == 'READ_ONLY_OPERATIONS_METADATA'/);
  assert.match(s,/expected_sha/);assert.match(s,/live_sha/);assert.match(s,/persist-credentials: false/);
  assert.match(s,/node --test tests\/production-operations-metadata.test.mjs/);
  assert.match(s,/secrets.CLOUDFLARE_API_TOKEN/);assert.doesNotMatch(s,/upload-artifact|wrangler|\/query|\/restore|\/export/);
  for(const line of s.split('\n').filter(x=>x.includes('uses:')))assert.match(line,/@[a-f0-9]{40}\b/);
});
