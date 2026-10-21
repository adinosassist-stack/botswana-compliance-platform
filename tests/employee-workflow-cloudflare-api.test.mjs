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
