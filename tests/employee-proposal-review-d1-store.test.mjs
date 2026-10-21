import assert from "node:assert/strict";
import {test} from "node:test";
import {createEmployeeProposalReviewD1Store} from "../cloudflare/src/employee-proposal-review-d1-store.js";
const proposal={proposalKey:JSON.stringify(["t1","w1","e1","contract_renewal","2026-11-01"]),workflowId:"w1",employeeId:"e1",type:"contract_renewal",dueDate:"2026-11-01",status:"proposed",requiresHumanReview:true};
test("enqueue scopes tenant and uses duplicate-safe insert",async()=>{
 let sql="",params=[];
 const db={prepare(s){sql=s;return {bind(...p){params=p;return {async run(){return {success:true,meta:{changes:0}}}}}}}};
 const result=await createEmployeeProposalReviewD1Store(db).enqueue({tenantId:"t1",proposal});
 assert.deepEqual(result,{ok:true,inserted:false});assert.match(sql,/INSERT OR IGNORE/);assert.equal(params[0],"t1");
});
test("cross-tenant enqueue rejects before touching storage",async()=>{
 let called=false;const db={prepare(){called=true;throw Error("unexpected")}};
 await assert.rejects(createEmployeeProposalReviewD1Store(db).enqueue({tenantId:"t2",proposal}),/scope_mismatch/);
 assert.equal(called,false);
});
test("approval changes only pending scoped row",async()=>{
 let sql="",params=[];
 const db={prepare(s){sql=s;return {bind(...p){params=p;return {async run(){return {success:true,meta:{changes:1}}}}}}}};
 assert.equal(await createEmployeeProposalReviewD1Store(db).decide({tenantId:"t1",proposalKey:proposal.proposalKey,reviewerId:"manager",decision:"approved",reviewedAt:"2026-10-21T16:00:00Z"}),true);
 assert.match(sql,/WHERE tenant_id=\? AND proposal_key=\? AND status='proposed'/);
 assert.deepEqual(params.slice(0,3),["approved","manager","2026-10-21T16:00:00Z"]);
});
test("pending list cannot query across tenants",async()=>{
 let sql="",params=[];const db={prepare(s){sql=s;return {bind(...p){params=p;return {async all(){return {success:true,results:[]}}}}}}};
 assert.deepEqual(await createEmployeeProposalReviewD1Store(db).listPending({tenantId:"t1"}),[]);
 assert.match(sql,/WHERE tenant_id=\? AND status='proposed'/);assert.deepEqual(params,["t1"]);
});
