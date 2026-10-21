import assert from "node:assert/strict";
import {test} from "node:test";
import {handleEmployeeProposalReviewRequest as handle} from "../cloudflare/src/employee-proposal-review-api.js";
const session={tenant_id:"t1",user_id:"manager1",role:"manager"};
const base={req:{method:"GET"},session,readJson:async()=>({}),roleAllowed:()=>true};
test("unauthenticated and unauthorized callers never access storage",async()=>{
 const env={DB:{prepare(){throw Error("database touched")}}};
 assert.equal((await handle({...base,env,session:null})).status,401);
 assert.equal((await handle({...base,env,roleAllowed:()=>false})).status,403);
});
test("GET retrieves only session tenant pending reviews",async()=>{
 let params=[];
 const env={DB:{prepare(){return {bind(...p){params=p;return {async all(){return {success:true,results:[]}}}}}}}};
 const response=await handle({...base,env});assert.equal(response.status,200);assert.deepEqual(params,["t1"]);
});
test("POST uses trusted reviewer identity and rejects repeat decisions",async()=>{
 let params=[];
 const env={DB:{prepare(){return {bind(...p){params=p;return {async run(){return {success:true,meta:{changes:0}}}}}}}}};
 const response=await handle({...base,req:{method:"POST"},env,readJson:async()=>({tenantId:"evil",reviewerId:"evil",proposalKey:"key",decision:"approved"})});
 assert.equal(response.status,409);assert.equal(params[3],"t1");assert.equal(params[4],"key");assert.equal(params[1],"manager1");
});
test("invalid method and invalid decision do not touch database",async()=>{
 const env={DB:{prepare(){throw Error("unexpected")}}};
 assert.equal((await handle({...base,env,req:{method:"DELETE"}})).status,405);
 assert.equal((await handle({...base,env,req:{method:"POST"},readJson:async()=>({decision:"execute",proposalKey:"key"})})).status,400);
});
