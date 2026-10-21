import assert from "node:assert/strict";
import {test} from "node:test";
import {generateEmployeeWorkflowReviews} from "../cloudflare/src/employee-workflow-review-generation.js";
const workflow={id:"w1",name:"Onboarding reviews",routineType:"onboarding_checklist",trigger:"manual",effect:"propose_internal_task",enabled:true};
test("manual generation uses only trusted tenant-owned workflows and active tenant employees",async()=>{
 const queries=[],inserts=[];
 const db={prepare(sql){return {bind(...params){queries.push({sql,params});return {
  async all(){
   if(sql.includes("FROM employee_ai_workflows"))return {success:true,results:[{definition:JSON.stringify(workflow)}]};
   if(sql.includes("FROM employees"))return {success:true,results:[{id:"e1",start_date:"2026-11-01",end_date:"2026-11-01",status:"active"}]};
   throw Error("unexpected SELECT");
  },
  async run(){inserts.push({sql,params});return {success:true,meta:{changes:1}};}
 }}}}};
 const result=await generateEmployeeWorkflowReviews({db,tenantId:"t1",ownerId:"owner1",today:"2026-10-21"});
 assert.deepEqual(result,{ok:true,generated:1,inserted:1,duplicateCount:0,executed:0});
 assert.deepEqual(queries[0].params,["t1","owner1"]);
 assert.deepEqual(queries[1].params,["t1"]);
 assert.equal(inserts[0].params[0],"t1");
 assert.deepEqual(JSON.parse(inserts[0].params[1]).slice(0,3),["t1","w1","e1"]);
 assert.match(queries[1].sql,/status/);
});
test("invalid scope rejects before querying tenant records",async()=>{
 const db={prepare(){throw Error("queried")}};
 await assert.rejects(generateEmployeeWorkflowReviews({db,tenantId:"",ownerId:"owner1",today:"2026-10-21"}),/invalid_generation_scope/);
});

test("contract end dates are not misrepresented as contract-renewal deadlines",async()=>{
 let writes=0;
 const db={prepare(sql){return {bind(){return {async all(){return sql.includes("employee_ai_workflows")?{success:true,results:[{definition:JSON.stringify({...workflow,routineType:"contract_renewal"})}]}:{success:true,results:[{id:"e1",start_date:"2026-01-01",end_date:"2026-11-01",status:"active"}]}},async run(){writes++;return {success:true,meta:{changes:1}}}}}}}};
 const result=await generateEmployeeWorkflowReviews({db,tenantId:"t1",ownerId:"owner1",today:"2026-10-21"});
 assert.equal(result.generated,0);assert.equal(writes,0);
});
