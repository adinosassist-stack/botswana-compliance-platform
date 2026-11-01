import test from "node:test";
import assert from "node:assert/strict";
import {createAssetsSummaryHttp} from "../server/corporate-assets-summary-http.js";
const principal={companyId:"11111111-1111-4111-8111-111111111111",userId:"22222222-2222-4222-8222-222222222222"};
test("requires authenticated, rate-limited GET requests",async()=>{
 let calls=0;
 const handle=createAssetsSummaryHttp({authenticate:async()=>principal,rateLimit:async()=>true,readSummary:async()=>{calls++;return {totalAssets:3}}});
 assert.equal((await handle({method:"POST"})).status,405);
 assert.equal((await handle({method:"GET"})).status,200);
 assert.equal(calls,1);
});
test("fails closed for unauthenticated or limited requests",async()=>{
 let queried=false;
 const missing=createAssetsSummaryHttp({authenticate:async()=>null,rateLimit:async()=>true,readSummary:async()=>{queried=true}});
 assert.equal((await missing({method:"GET"})).status,401);
 const limited=createAssetsSummaryHttp({authenticate:async()=>principal,rateLimit:async()=>false,readSummary:async()=>{queried=true}});
 assert.equal((await limited({method:"GET"})).status,429);
 assert.equal(queried,false);
});
test("never reveals internal service failures",async()=>{
 const handle=createAssetsSummaryHttp({authenticate:async()=>principal,rateLimit:async()=>true,readSummary:async()=>{throw new Error("private database detail")}});
 const r=await handle({method:"GET"});
 assert.equal(r.status,503);assert.deepEqual(r.body,{error:"assets_unavailable"});
 assert.equal(r.headers["cache-control"],"no-store");
});
