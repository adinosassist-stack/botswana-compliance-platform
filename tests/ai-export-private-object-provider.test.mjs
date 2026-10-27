import assert from "node:assert/strict";
import {test} from "node:test";
import {createAiPrivateObjectProvider} from "../server/ai-export-private-object-provider.js";
test("private provider binds bucket, object path and visibility",async()=>{
 const writes=[];const reads=[];
 const store=createAiPrivateObjectProvider({bucket:"private-exports",clock:()=>1000,putObject:async v=>writes.push(v),getObject:async v=>(reads.push(v),Buffer.from("%PDF"))});
 await store.put("ai-exports/tenant1/job1",Buffer.from("%PDF"),{private:true,expiresAt:2000});
 assert.equal(writes[0].visibility,"private");assert.equal(writes[0].bucket,"private-exports");
 assert.equal((await store.get("ai-exports/tenant1/job1",{private:true})).toString(),"%PDF");
 assert.equal(reads[0].visibility,"private");
});
test("rejects public access, unsafe keys and expired writes before IO",async()=>{
 let calls=0;const store=createAiPrivateObjectProvider({bucket:"private",clock:()=>1000,putObject:async()=>calls++,getObject:async()=>{calls++;return Buffer.from("x")}});
 await assert.rejects(store.put("ai-exports/t1/j1",Buffer.from("x"),{private:false,expiresAt:2000}));
 await assert.rejects(store.put("../secret",Buffer.from("x"),{private:true,expiresAt:2000}));
 await assert.rejects(store.put("ai-exports/t1/j1",Buffer.from("x"),{private:true,expiresAt:999}));
 assert.equal(await store.get("ai-exports/t1/j1",{private:false}),null);
 assert.equal(await store.get("https://public.invalid/key",{private:true}),null);
 assert.equal(calls,0);
});
