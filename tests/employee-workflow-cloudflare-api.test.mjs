import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handleEmployeeWorkflowRequest} from '../cloudflare/src/employee-workflow-api.js';

const env={DB:{prepare(){return {bind(){return {async all(){return {success:true,results:[]}}}}}}}};
test('unauthenticated session is rejected',async()=>{
 const response=await handleEmployeeWorkflowRequest({req:{method:'GET'},env,session:null,readJson:async()=>({}),roleAllowed:()=>true});
 assert.equal(response.status,401);
});
test('viewer cannot list workflows',async()=>{
 const response=await handleEmployeeWorkflowRequest({req:{method:'GET'},env,session:{tenant_id:'t1',user_id:'u1'},readJson:async()=>({}),roleAllowed:()=>false});
 assert.equal(response.status,403);
});
test('owner can list scoped workflows',async()=>{
 const response=await handleEmployeeWorkflowRequest({req:{method:'GET'},env,session:{tenant_id:'t1',user_id:'u1'},readJson:async()=>({}),roleAllowed:()=>true});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).workflows,[]);
});
test('unsupported methods cannot mutate workflows',async()=>{
 const response=await handleEmployeeWorkflowRequest({req:{method:'DELETE'},env,session:{tenant_id:'t1',user_id:'u1'},readJson:async()=>({}),roleAllowed:()=>true});
 assert.equal(response.status,405);
});

test('request body cannot override authenticated tenant or owner',async()=>{
 let bindings;
 const scopedEnv={DB:{prepare(){return {bind(...args){bindings=args;return {async run(){return {success:true}}}}}}}};
 const response=await handleEmployeeWorkflowRequest({
  req:{method:'POST'},env:scopedEnv,
  session:{tenant_id:'trusted-tenant',user_id:'trusted-owner'},
  readJson:async()=>({tenantId:'attacker-tenant',actorId:'attacker-owner',workflow:{
   id:'w1',name:'Review onboarding',routineType:'onboarding_checklist',
   trigger:'manual',effect:'preview',enabled:true
  }}),
  roleAllowed:()=>true
 });
 assert.equal(response.status,200);
 assert.ok(bindings.includes('trusted-tenant'));
 assert.ok(bindings.includes('trusted-owner'));
 assert.ok(!bindings.includes('attacker-tenant'));
 assert.ok(!bindings.includes('attacker-owner'));
});

test('unavailable D1 table produces controlled 503 without leaking database details',async()=>{
 const broken={DB:{prepare(){throw new Error('SQLITE_ERROR: no such table: employee_ai_workflows')}}};
 const response=await handleEmployeeWorkflowRequest({req:{method:'GET'},env:broken,session:{tenant_id:'t1',user_id:'u1'},readJson:async()=>({}),roleAllowed:()=>true});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'workflow_storage_unavailable'});
 assert.equal(response.headers.get('cache-control'),'no-store');
});
