import test from "node:test";
import assert from "node:assert/strict";
import {listEmployeeWorkflows,saveEmployeeWorkflow} from "../server/employee-workflow-ownership-service.js";
import {createEmployeeWorkflowD1Store} from "../cloudflare/src/employee-workflow-d1-store.js";

const principal={tenantId:"tenant-A",actorId:"owner-A",permissions:["people.workflow.manage"]};
const workflow={id:"wf",name:"Safe preview",routineType:"onboarding_checklist",trigger:"manual",effect:"preview"};
test("ownership service filters cross-tenant and cross-owner results from compromised adapter",async()=>{
 const store={async listOwned(){return [
  {tenantId:"tenant-B",ownerId:"owner-A",workflow},
  {tenantId:"tenant-A",ownerId:"owner-B",workflow},
  {tenantId:"tenant-A",ownerId:"owner-A",workflow}
 ]}};
 const result=await listEmployeeWorkflows({principal,store});
 assert.equal(result.ok,true);
 assert.equal(result.workflows.length,1);
 assert.equal(result.workflows[0].id,"wf");
});
test("ownership service rejects missing permissions without calling store",async()=>{
 let calls=0;
 const store={async listOwned(){calls++;return []},async saveOwned(){calls++;return true}};
 const denied={...principal,permissions:[]};
 assert.equal((await listEmployeeWorkflows({principal:denied,store})).reason,"forbidden");
 assert.equal((await saveEmployeeWorkflow({principal:denied,store,definition:workflow})).reason,"forbidden");
 assert.equal(calls,0);
});
test("D1 read failure and malformed serialized data fail closed",async()=>{
 const db={prepare(){return {bind(){return {async all(){return {success:true,results:[{tenant_id:"tenant-A",owner_id:"owner-A",definition:"{bad"}]}}}}}}}};
 const store=createEmployeeWorkflowD1Store(db);
 await assert.rejects(store.listOwned({tenantId:"tenant-A",ownerId:"owner-A"}));
 const result=await listEmployeeWorkflows({principal,store});
 assert.deepEqual(result,{ok:false,reason:"storage_unavailable"});
});
test("D1 unsuccessful write cannot be reported as saved",async()=>{
 const db={prepare(){return {bind(){return {async run(){return {success:false}}}}}}};
 const store=createEmployeeWorkflowD1Store(db);
 assert.equal(await store.saveOwned({tenantId:"tenant-A",ownerId:"owner-A",workflow}),false);
 const result=await saveEmployeeWorkflow({principal,store,definition:workflow});
 assert.equal(result.ok,false);
 assert.equal(result.reason,"not_saved");
});
