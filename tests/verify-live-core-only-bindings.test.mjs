import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyLiveCoreOnlyBindings,readAndVerifyLiveCoreOnlyBindings} from '../scripts/verify-live-core-only-bindings.mjs';

const values={APP_ENV:'production',PAYMENT_PROVIDER:'none',POP_UPLOAD_STAGING_ENABLED:'false',THEBE_AI_EXPORTS_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false'};
const data=()=>({success:true,result:{bindings:Object.entries(values).map(([name,text])=>({name,text,type:'plain_text'}))}});

test('accepts only explicit live production freeze flags',()=>{
  assert.equal(verifyLiveCoreOnlyBindings(data()).popIngestionEnabled,false);
});
test('rejects missing, enabled, secret and duplicate flags',()=>{
  for(const name of Object.keys(values)){
    for(const variant of ['missing','enabled','secret','duplicate']){
      const payload=data();const entries=payload.result.bindings;
      const i=entries.findIndex(x=>x.name===name);
      if(variant==='missing')entries.splice(i,1);
      if(variant==='enabled')entries[i].text='true';
      if(variant==='secret')entries[i].type='secret_text';
      if(variant==='duplicate')entries.push({...entries[i]});
      assert.throws(()=>verifyLiveCoreOnlyBindings(payload),/live_core_bindings_mismatch_/);
    }
  }
});
test('rejects malformed provider responses',()=>{
  for(const payload of [null,{success:false,result:{bindings:[]}},{success:true,result:{}},{success:true,result:{bindings:{}}}]){
    assert.throws(()=>verifyLiveCoreOnlyBindings(payload),/live_core_bindings_unavailable/);
  }
});
test('read-only API request and fail closed on missing flag',async()=>{
  let called=0;
  const opts={accountId:'a'.repeat(32),token:'private-test-token',fetchImpl:async(url,req)=>{
    called++;
    assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
    assert.equal(req.headers.Authorization,'Bearer private-test-token');
    assert.match(url,/\/workers\/scripts\/bw-compliance-os\/settings$/);
    return {ok:true,text:async()=>JSON.stringify(data())};
  }};
  assert.equal((await readAndVerifyLiveCoreOnlyBindings(opts)).production,true);
  assert.equal(called,1);
  await assert.rejects(()=>readAndVerifyLiveCoreOnlyBindings({...opts,accountId:'wrong'}),/credentials_missing/);
  await assert.rejects(()=>readAndVerifyLiveCoreOnlyBindings({...opts,fetchImpl:async()=>({ok:false})}),/read_failed/);
});
test('protected deployment verifies live bindings after write and before readiness acceptance',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const name='node scripts/verify-live-core-only-bindings.mjs';
  assert.equal(workflow.split(name).length-1,1);
  const at=workflow.indexOf(name);
  const mutation=workflow.indexOf('- name: Deploy exact candidate to Cloudflare');
  const readiness=workflow.indexOf('- name: Verify live production readiness');
  assert.ok(at>mutation);
  assert.ok(at<readiness);
  const protectedStep=workflow.slice(mutation,readiness);
  assert.match(protectedStep,/CLOUDFLARE_API_TOKEN:.*secrets\.CLOUDFLARE_API_TOKEN/);
  assert.ok(protectedStep.indexOf('node "$WRANGLER_JS" deploy')<protectedStep.indexOf(name));
});
