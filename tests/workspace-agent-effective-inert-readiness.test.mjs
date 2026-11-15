import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyInertSurfaces,PINNED_INERT} from '../scripts/workspace-agent-effective-inert-readiness.mjs';
const STRANDED='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
const vars={
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false',
};
const safe=()=>Object.entries(vars).map(([name,text])=>({name,text,type:'plain_text'}));
const payload=(l=STRANDED)=>({
  pinned:{success:true,result:{id:PINNED_INERT,bindings:safe()}},
  service:{success:true,result:{bindings:[
    ...safe().map(b=>b.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED'?{...b,text:'true'}:b),
    {name:'SESSION_SECRET',type:'secret_text'},
    {name:'DB',type:'d1',id:'fa317ccc-683d-4466-9e3a-e296872d58ba'},
  ]}},
  latest:{success:true,result:{id:l}},
  deployments:{success:true,result:{deployments:[{versions:[{version_id:PINNED_INERT,percentage:100}]}]}}
});
test('classifies verified inert runtime separately from divergent service metadata',()=>{
 const r=qualifyInertSurfaces(payload());
 assert.equal(r.runtimeSafetyQualified,true);
 assert.equal(r.fullStagingQualified,false);
 assert.deepEqual(r.blockers,['service_settings_diverge_from_inert','latest_uploaded_version_diverges']);
});
test('all strict checks pass only when all surfaces agree',()=>{
 const p=payload(PINNED_INERT);p.service.result.bindings=safe();
 const r=qualifyInertSurfaces(p);
 assert.equal(r.runtimeSafetyQualified,true);
 assert.equal(r.fullStagingQualified,true);
 assert.deepEqual(r.blockers,[]);
});
test('unexpected secret even at deployed version fails runtime',()=>{
 const p=payload();p.pinned.result.bindings.push({name:'SESSION_SECRET',type:'secret_text'});
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('unexpected D1 binding even at deployed version fails runtime',()=>{
 const p=payload();p.pinned.result.bindings.push({name:'DB',type:'d1'});
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('any missing or altered named variable fails runtime',()=>{
 const p=payload();p.pinned.result.bindings[0].text='1';
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('advisory flag true in deployed version fails runtime',()=>{
 const p=payload();p.pinned.result.bindings.find(x=>x.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED').text='true';
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('duplicate bindings fail runtime',()=>{
 const p=payload();p.pinned.result.bindings[1].name=p.pinned.result.bindings[0].name;
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('pinned not fully deployed fails runtime despite safe metadata',()=>{
 const p=payload();p.deployments.result.deployments[0].versions[0].percentage=0;
 assert.equal(qualifyInertSurfaces(p).runtimeSafetyQualified,false);
});
test('a missing response fails closed',()=>{
 const r=qualifyInertSurfaces();
 assert.equal(r.fullStagingQualified,false);
 assert.equal(r.runtimeSafetyQualified,false);
 assert.equal(r.blockers.length,4);
});
test('service metadata not matching pinned is never full staging qualification',()=>{
 const p=payload(PINNED_INERT);p.service.result.bindings=p.pinned.result.bindings.map(b=>({...b}));p.service.result.bindings[0].type='json';
 assert.equal(qualifyInertSurfaces(p).fullStagingQualified,false);
});
