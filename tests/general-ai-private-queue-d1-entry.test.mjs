import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../cloudflare/src/general-ai-private-queue-d1-entry.review.js";
import staging from "../cloudflare/src/general-ai-staging-entry.js";
const sha="a".repeat(40);
const nonce="b".repeat(32);
const source={operation:"verify-disabled",worker:"bw-general-ai-staging",sourceSha:sha,nonce};
function harness(){
  const sql=new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../cloudflare/schema/general-ai-private-queue-ledger-candidate.sql",import.meta.url),"utf8"));
  const db={prepare(s){const stmt=sql.prepare(s);return {bind(...params){return {run:async()=>{const r=stmt.run(...params);return {success:true,meta:{changes:Number(r.changes)}}}}}}}};
  let calls=0;
  const env={
    PRIVATE_AI_NONCE_DB:db,PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"true",
    PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED:"true",PRIVATE_AI_LEDGER_ISOLATION_VERIFIED:"true",
    APPROVED_SOURCE_SHA:sha,
    STAGING_AI:{fetch:request=>{calls++;return staging.fetch(request,{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"})}}
  };
  function batch(body=source){let acks=0;return {queue:"bw-general-ai-private-acceptance-queue",messages:[{body,ack:()=>acks++}],get acks(){return acks}}}
  return {sql,env,batch,get calls(){return calls}};
}
test("actual local SQLite ledger prevents duplicate Queue invocation across separate consumer calls",async()=>{
  const h=harness();try{
    const first=h.batch();await worker.queue(first,h.env);assert.equal(first.acks,1);
    const replay=h.batch();await assert.rejects(()=>worker.queue(replay,h.env),/ai_queue_nonce_reused_or_unverified/);
    assert.equal(replay.acks,0);assert.equal(h.calls,3);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,1);
  }finally{h.sql.close()}
});
test("no remote D1 calls without independent staging qualification flags",async()=>{
  const h=harness();try{
    for(const diff of [{PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"false"},{PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED:"false"},{PRIVATE_AI_LEDGER_ISOLATION_VERIFIED:"false"},{PRIVATE_AI_NONCE_DB:undefined}]){
      await assert.rejects(()=>worker.queue(h.batch(),{...h.env,...diff}));
    }
    assert.equal(h.calls,0);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,0);
  }finally{h.sql.close()}
});
test("rejects injected ledger bypass and malformed private Queue request before claim",async()=>{
 const h=harness();try{
   await assert.rejects(()=>worker.queue(h.batch(),{...h.env,PRIVATE_AI_NONCE_LEDGER:{claimOnce:async()=>true}}),/ai_nonce_ledger_injection_forbidden/);
   await assert.rejects(()=>worker.queue(h.batch({...source,prompt:"real input"}),h.env),/ai_queue_invalid_envelope/);
   assert.equal(h.calls,0);
   assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,0);
 }finally{h.sql.close()}
});
test("D1 schema missing denies invocation without service call or ack",async()=>{
 const h=harness();try{
    const b=h.batch();
    const env={...h.env,PRIVATE_AI_NONCE_DB:{prepare:()=>{throw Error("schema_missing")}}};
    await assert.rejects(()=>worker.queue(b,env),/schema_missing/);
    assert.equal(h.calls,0);assert.equal(b.acks,0);
 }finally{h.sql.close()}
});
