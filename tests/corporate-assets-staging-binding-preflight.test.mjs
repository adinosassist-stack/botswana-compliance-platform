import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAssetStagingBindingMetadata} from '../scripts/corporate-assets-staging-binding-preflight.mjs';
const id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const sourceSha='a'.repeat(40);
const meta={databaseId:id,sourceSha};
const binding=(name,text)=>({name,type:'plain_text',text});
const baseline=[
 binding('APP_ENV','staging'),
 binding('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 binding('ASSETS_STAGING_WRITES_ENABLED','false'),
 binding('THEBE_CORPORATE_ASSETS_ENABLED','false'),
 binding('ASSETS_STAGING_D1_ID',id),
 binding('ASSETS_STAGING_SOURCE_SHA',sourceSha),
 {name:'DB',type:'d1',id},
 {name:'SESSION_SECRET',type:'secret_text'},
 {name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
];
test('only metadata with isolated DB, source and secure secret binding types passes',()=>{
 const result=checkAssetStagingBindingMetadata(baseline,meta);
 assert.equal(result.ready,true);assert.deepEqual(result.errors,[]);
 assert.equal(Object.isFrozen(result),true);
});
test('live legacy plain text secret bindings deny acceptance',()=>{
 const bad=baseline.map(b=>b.name.endsWith('_SECRET')?{...b,type:'plain_text',text:'REDACTED'}:b);
 const result=checkAssetStagingBindingMetadata(bad,meta);
 assert.equal(result.ready,false);
 assert.ok(result.errors.includes('SESSION_SECRET_must_be_secret_text'));
 assert.ok(result.errors.includes('AUDIT_INTEGRITY_SECRET_must_be_secret_text'));
 assert.equal(JSON.stringify(result).includes('REDACTED'),false,'never echo values');
});
test('fail closed on duplicate or missing bindings, wrong DB and source, enabled writes',()=>{
 for(const list of [
  [...baseline,baseline[0]],
  baseline.filter(b=>b.name!=='SESSION_SECRET'),
  baseline.map(b=>b.name==='DB'?{...b,id:'00000000-0000-4000-8000-000000000000'}:b),
  baseline.map(b=>b.name==='ASSETS_STAGING_SOURCE_SHA'?{...b,text:'b'.repeat(40)}:b),
  baseline.map(b=>b.name==='ASSETS_STAGING_WRITES_ENABLED'?{...b,text:'true'}:b),
  baseline.map(b=>b.name==='THEBE_CORPORATE_ASSETS_ENABLED'?{...b,text:'true'}:b)
 ])assert.equal(checkAssetStagingBindingMetadata(list,meta).ready,false);
 assert.equal(checkAssetStagingBindingMetadata(undefined,meta).ready,false);
});
