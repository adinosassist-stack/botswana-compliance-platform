import test from "node:test";
import assert from "node:assert/strict";
import {createPrivateQueueReadOnlyAdapter as create} from "../scripts/general-ai-cloudflare-readonly-adapter.mjs";
const accountId="ddd23cab31928a4bb3d4998df9b26d1d";
test("wrong account and absent transport fail closed",()=>{
 assert.throws(()=>create({accountId:"wrong",client:{request:async()=>({})}}),/wrong Cloudflare account/);
 assert.throws(()=>create({accountId}),/transport required/);
});
test("read-only adapter exposes inventory, not live mutation operations",()=>{
 const adapter=create({accountId,client:{request:async()=>({result:[]})}});
 assert.equal(typeof adapter.readInventory,"function");
 for(const key of ["enable","publish","disable","verifyDelivery","attestServiceIsolation"])assert.equal(adapter[key],undefined);
 assert.equal(Object.isFrozen(adapter),true);
});
test("inventory reads only three fixed endpoints and rejects empty response",async()=>{
 const calls=[];const adapter=create({accountId,client:{request:async x=>{calls.push(x);return {result:[]}}}});
 await assert.rejects(adapter.readInventory(),/private queue identity must be unique/);
 assert.deepEqual(calls.map(x=>x.method),["GET","GET","POST"]);
 assert.ok(calls[2].path.endsWith("/d1/database/71e2d394-7dec-4878-bdc8-afe8f73cf541/query"));
 assert.match(calls[2].body.sql,/^SELECT name, type, sql FROM sqlite_master/);
});
