import test from "node:test";
import assert from "node:assert/strict";
import {handleEmployeeWorkflowRequest} from "../cloudflare/src/employee-workflow-api.js";
import {createEmployeeWorkflowD1Store} from "../cloudflare/src/employee-workflow-d1-store.js";

const request=(method="GET")=>({method});
const call=(session,roleAllowed,db,method="GET")=>handleEmployeeWorkflowRequest({
 req:request(method),env:{DB:db},session,roleAllowed,readJson:async()=>({workflow:{id:"x"}})
});
test("employee workflow route denies missing trusted identity before storage",async()=>{
 const res=await call({tenant_id:"tenant"},()=>true,null);
 assert.equal(res.status,401);
});
test("employee workflow route denies non-manager roles before storage",async()=>{
 const res=await call({tenant_id:"tenant",user_id:"actor"},()=>false,null);
 assert.equal(res.status,403);
 assert.equal(res.headers.get("cache-control"),"no-store");
});
test("employee workflow route rejects unsupported methods before storage",async()=>{
 const res=await call({tenant_id:"tenant",user_id:"actor"},()=>true,null,"DELETE");
 assert.equal(res.status,405);
 assert.equal(res.headers.get("allow"),"GET, POST");
});
test("employee workflow route fails closed on missing D1 binding",async()=>{
 const res=await call({tenant_id:"tenant",user_id:"actor"},()=>true,null);
 assert.equal(res.status,503);
 assert.equal((await res.json()).reason,"storage_unavailable");
});
test("D1 store rejects missing or malformed tenant and owner scopes",async()=>{
 let prepared=0;
 const db={prepare(){prepared++;throw new Error("unexpected query")}};
 const store=createEmployeeWorkflowD1Store(db);
 await assert.rejects(store.saveOwned({tenantId:"",ownerId:"actor",workflow:{id:"id"}}),/invalid_scope/);
 await assert.rejects(store.saveOwned({tenantId:"tenant",ownerId:"",workflow:{id:"id"}}),/invalid_scope/);
 await assert.rejects(store.saveOwned({tenantId:"tenant",ownerId:"actor",workflow:{id:""}}),/invalid_scope/);
 await assert.rejects(store.listOwned({tenantId:"",ownerId:"actor"}),/invalid_scope/);
 assert.equal(prepared,0);
});
test("D1 store binds trusted tenant and owner to all queries",async()=>{
 const calls=[];
 const db={prepare(sql){return {bind(...args){calls.push({sql,args});return {async run(){return {success:true}},async all(){return {success:true,results:[]}}}}}}};
 const store=createEmployeeWorkflowD1Store(db);
 assert.equal(await store.saveOwned({tenantId:"tenant-A",ownerId:"actor-A",workflow:{id:"wf-A"}}),true);
 assert.deepEqual(await store.listOwned({tenantId:"tenant-B",ownerId:"actor-B"}),[]);
 assert.deepEqual(calls[0].args.slice(0,3),["tenant-A","actor-A","wf-A"]);
 assert.deepEqual(calls[1].args,["tenant-B","actor-B"]);
 assert.match(calls[1].sql,/WHERE tenant_id=\\? AND owner_id=\\?/);
});
