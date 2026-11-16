import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCorporateAssetsRemoteMetadata}
  from '../scripts/corporate-assets-staging-remote-preflight.mjs';

const sha='a'.repeat(40),id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const deploymentId='11111111-1111-4111-8111-111111111111';
const v3='33333333-3333-4333-8333-333333333333';
const v2='22222222-2222-4222-8222-222222222222';
const variable=(name,text)=>({name,type:'plain_text',text});
const baseline=[
  variable('APP_ENV','staging'),
  variable('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
  variable('ASSETS_STAGING_D1_ID',id),
  variable('ASSETS_STAGING_SOURCE_SHA',sha),
  variable('THEBE_CORPORATE_ASSETS_ENABLED','false'),
  variable('ASSETS_STAGING_WRITES_ENABLED','false'),
  {name:'DB',type:'d1',id},
  {name:'SESSION_SECRET',type:'secret_text'},
  {name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
];
const plaintext=()=>baseline.map(b=>
  ['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'].includes(b.name)
  ?{name:b.name,type:'plain_text',text:'SENSITIVE_TEST_ONLY_NEVER_LEAK'}:b
);
const deployment=(versions=[{version_id:v3,percentage:100}])=>
  ({deployments:[{id:deploymentId,versions}]});

function mock({settings=baseline,versions={[v3]:baseline},
  initial=deployment(),after=initial,httpError=null,invalid=false}={}){
  let deploymentsRead=0;
  const calls=[];
  const request=async (url,opts)=>{
    calls.push({url,method:opts.method,redirect:opts.redirect});
    const suffix=url.slice(url.indexOf('/workers/scripts/'));
    if(httpError&&suffix.endsWith(httpError.path))
      return {ok:false,status:httpError.status};
    let result;
    if(suffix.endsWith('/settings'))result={bindings:settings};
    else if(suffix.endsWith('/deployments'))result=deploymentsRead++===0?initial:after;
    else if(suffix.includes('/versions/')){
      const id=suffix.slice(suffix.lastIndexOf('/')+1);
      result=versions[id]?{resources:{bindings:versions[id]}}:null;
    }
    else throw Error('unexpected request '+suffix);
    return {ok:true,status:200,json:async()=>({
      success:invalid?false:true,result
    })};
  };
  return {request,calls};
}

test('only exact-source deployed secret-text plus current settings may qualify',async()=>{
  const m=mock();
  const receipt=await verifyCorporateAssetsRemoteMetadata({
    token:'synthetic-read-token',sourceSha:sha,request:m.request
  });
  assert.equal(receipt.ready,true);
  assert.equal(receipt.deployedBindingTypesVerified,true);
  assert.equal(receipt.authenticatedSourceBytesVerified,false);
  assert.equal(receipt.deploymentAuthorized,false);
  assert.equal(receipt.activeVersionCount,1);
  assert.deepEqual(receipt.errors,[]);
  assert.equal(m.calls.length,4);
  assert.ok(m.calls.every(x=>x.method==='GET'&&x.redirect==='error'));
  assert.equal(JSON.stringify(receipt).includes('synthetic-read-token'),false);
  assert.equal(JSON.stringify(receipt).includes('secret_text'),false);
});

test('secure undeployed settings cannot hide the ACTIVE legacy plaintext version',async()=>{
  const m=mock({versions:{[v3]:plaintext()}});
  const result=await verifyCorporateAssetsRemoteMetadata({
    token:'synthetic-token',sourceSha:sha,request:m.request
  });
  assert.equal(result.ready,false);
  assert.equal(result.deployedBindingTypesVerified,false);
  assert.ok(result.errors.includes('active_version_SESSION_SECRET_must_be_secret_text'));
  assert.ok(result.errors.includes('active_version_AUDIT_INTEGRITY_SECRET_must_be_secret_text'));
  assert.equal(JSON.stringify(result).includes('SENSITIVE_TEST_ONLY_NEVER_LEAK'),false);
});

test('a mixed traffic rollout rejects one live plaintext version',async()=>{
  const split=deployment([
    {version_id:v3,percentage:25},{version_id:v2,percentage:75}
  ]);
  const m=mock({initial:split,versions:{[v3]:baseline,[v2]:plaintext()}});
  const result=await verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:m.request
  });
  assert.equal(result.ready,false);
  assert.equal(result.activeVersionCount,2);
  assert.ok(result.errors.some(x=>x.startsWith('active_version_')));
});

test('source identity, private asset flags and isolated D1 must match on ACTIVE version',async()=>{
  for(const bad of [
    baseline.map(x=>x.name==='ASSETS_STAGING_SOURCE_SHA'
      ?{...x,text:'b'.repeat(40)}:x),
    baseline.map(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED'
      ?{...x,text:'true'}:x),
    baseline.map(x=>x.name==='DB'
      ?{...x,id:'99999999-9999-4999-8999-999999999999'}:x)
  ]){
    const m=mock({versions:{[v3]:bad}});
    const result=await verifyCorporateAssetsRemoteMetadata({
      token:'synthetic',sourceSha:sha,request:m.request
    });
    assert.equal(result.ready,false);
    assert.ok(result.errors.some(x=>x.startsWith('active_version_')));
  }
});

test('latest settings with changed secret type fail even if deployed version looks secure',async()=>{
  const m=mock({settings:plaintext()});
  const result=await verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:m.request
  });
  assert.equal(result.ready,false);
  assert.ok(result.errors.includes('SESSION_SECRET_must_be_secret_text'));
  assert.ok(!JSON.stringify(result).includes('SENSITIVE_TEST_ONLY_NEVER_LEAK'));
});

test('missing, partial, duplicate or invalid deployment inventory fails closed',async()=>{
  const cases=[
    {deployments:[]},
    {deployments:[{id:deploymentId,versions:[]}]},
    deployment([{version_id:v3,percentage:50}]),
    deployment([{version_id:v3,percentage:50},{version_id:v3,percentage:50}]),
    deployment([{version_id:'bad',percentage:100}]),
    {deployments:[{id:'bad',versions:[{version_id:v3,percentage:100}]}]}
  ];
  for(const initial of cases){
    const m=mock({initial});
    await assert.rejects(verifyCorporateAssetsRemoteMetadata({
      token:'synthetic',sourceSha:sha,request:m.request
    }),/active_deployment_inventory_invalid/);
  }
});

test('deployment turnover while inspecting active versions invalidates attestation',async()=>{
  const m=mock({after:deployment([{version_id:v2,percentage:100}])});
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:m.request
  }),/active_deployment_changed_during_read/);
});

test('missing version detail, token, sha and Cloudflare HTTP errors fail closed',async()=>{
  const m=mock({versions:{}});
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:m.request
  }),/staging_metadata_invalid_version/);
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'',sourceSha:sha,request:m.request
  }),/dedicated_staging_read_token_required/);
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:'bad',request:m.request
  }),/exact_reviewed_sha_required/);
  const failed=mock({httpError:{path:'/deployments',status:403}});
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:failed.request
  }),/staging_metadata_read_failed_deployments_403/);
  const malformed=mock({invalid:true});
  await assert.rejects(verifyCorporateAssetsRemoteMetadata({
    token:'synthetic',sourceSha:sha,request:malformed.request
  }),/staging_metadata_invalid_settings/);
});
