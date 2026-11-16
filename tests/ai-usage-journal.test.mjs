import test from "node:test";
import assert from "node:assert/strict";
import {normalizeAiUsageRecord,recordAiUsage,getTenantAiUsage} from "../cloudflare/src/ai-usage-journal.js";
const event=(requestId="req1")=>({requestId,provider:"openai",model:"gpt-5-mini",usageKnown:true,inputTokens:120,outputTokens:20,cachedInputTokens:10});
function fakeDb(){
 const records=new Map();
 return {records,prepare(sql){return {bind(...args){return {
  async run(){if(!sql.includes("INSERT INTO ai_usage_journal"))throw Error("unexpected_sql");
   const [tenantId,requestId,provider,model,known,input,output,cached]=args;
   const key=tenantId+":"+requestId;
   if(records.has(key))throw Error("duplicate");
   records.set(key,{tenantId,requestId,provider,model,known,input,output,cached});
   return {success:true};
  },
  async first(){if(!sql.includes("WHERE tenant_id=?"))throw Error("missing_tenant_filter");
   const rows=[...records.values()].filter(x=>x.tenantId===args[0]);
   return {requests:rows.length,input_tokens:rows.reduce((a,x)=>a+(x.input||0),0),
    output_tokens:rows.reduce((a,x)=>a+(x.output||0),0),
    unknown_requests:rows.filter(x=>!x.known).length};
  }
 };}};}}}
test("tenant isolation and rejected duplicate replay",async()=>{
 const db=fakeDb();
 await recordAiUsage(db,"tenant-a",event());
 await assert.rejects(()=>recordAiUsage(db,"tenant-a",event()),/write_failed/);
 await recordAiUsage(db,"tenant-b",event());
 assert.equal(db.records.size,2);
 assert.deepEqual(await getTenantAiUsage(db,"tenant-a"),{requests:1,inputTokens:120,outputTokens:20,unknownRequests:0});
 assert.deepEqual(await getTenantAiUsage(db,"tenant-b"),{requests:1,inputTokens:120,outputTokens:20,unknownRequests:0});
});
test("unknown billed usage is counted, never assigned zero tokens",async()=>{
 const db=fakeDb();
 await recordAiUsage(db,"tenant-a",{...event("req2"),usageKnown:false,inputTokens:null,outputTokens:null,cachedInputTokens:null});
 assert.deepEqual(await getTenantAiUsage(db,"tenant-a"),{requests:1,inputTokens:0,outputTokens:0,unknownRequests:1});
});
test("rejects invalid identities, negative counts and inconsistent cached usage",()=>{
 assert.throws(()=>normalizeAiUsageRecord(event(),"tenant a"),/invalid_record/);
 assert.throws(()=>normalizeAiUsageRecord({...event(),inputTokens:-1},"tenant-a"),/invalid_record/);
 assert.throws(()=>normalizeAiUsageRecord({...event(),cachedInputTokens:200},"tenant-a"),/invalid_record/);
 assert.throws(()=>normalizeAiUsageRecord({...event(),usageKnown:false},"tenant-a"),/invalid_record/);
});
test("fails closed if the ledger is unavailable",async()=>{
 await assert.rejects(()=>recordAiUsage(null,"tenant-a",event()),/ledger_unavailable/);
 await assert.rejects(()=>getTenantAiUsage(null,"tenant-a"),/ledger_unavailable/);
});
