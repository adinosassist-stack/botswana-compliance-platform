import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../cloudflare/src/general-ai-private-queue-d1-entry.review.js";
import staging from "../cloudflare/src/general-ai-staging-entry.js";

const sha="c".repeat(40);
const nonce="d".repeat(32);
const body={operation:"verify-disabled",worker:"bw-general-ai-staging",sourceSha:sha,nonce};
function setup(){
  const sql=new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../cloudflare/schema/general-ai-private-queue-ledger-candidate.sql",import.meta.url),"utf8"));
  const db={prepare(query){const statement=sql.prepare(query);return {bind(...args){return {run:async()=>{const result=statement.run(...args);return {success:true,meta:{changes:Number(result.changes)}}}}}}}};
  let calls=0;
  const env={
    PRIVATE_AI_NONCE_DB:db,
    PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"true",
    PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED:"true",
    PRIVATE_AI_LEDGER_ISOLATION_VERIFIED:"true",
    APPROVED_SOURCE_SHA:sha,
    STAGING_AI:{fetch:async request=>{calls++;return staging.fetch(request,{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"})}}
  };
  function batch(payload=body){let acks=0;return {queue:"bw-general-ai-private-acceptance-queue",messages:[{body:payload,ack(){acks++}}],get acks(){return acks}}}
  return {sql,env,batch,get calls(){return calls},close(){sql.close()}};
}
test("wrong Queue identity is rejected before any D1 claim or service invocation",async()=>{
  const h=setup();try{
    const b={...h.batch(),queue:"customer-queue"};
    await assert.rejects(()=>worker.queue(b,h.env),/ai_queue_scope_mismatch/);
    assert.equal(h.calls,0);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,0);
  }finally{h.close()}
});
test("source SHA mismatch cannot claim a nonce or acknowledge delivery",async()=>{
  const h=setup();try{
    const b=h.batch({...body,sourceSha:"e".repeat(40)});
    await assert.rejects(()=>worker.queue(b,h.env),/ai_queue_unapproved_operation/);
    assert.equal(b.acks,0);
    assert.equal(h.calls,0);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,0);
  }finally{h.close()}
});
test("failed staging service leaves claimed nonce locked and no ack on subsequent replay",async()=>{
  const h=setup();try{
    h.env.STAGING_AI={fetch:async()=>{throw Error("staging_unavailable")}};
    const first=h.batch();
    await assert.rejects(()=>worker.queue(first,h.env),/staging_unavailable/);
    assert.equal(first.acks,0);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,1);
    const replay=h.batch();
    await assert.rejects(()=>worker.queue(replay,h.env),/ai_queue_nonce_reused_or_unverified/);
    assert.equal(replay.acks,0);
  }finally{h.close()}
});
test("acknowledgment failure does not permit a second staging invocation",async()=>{
  const h=setup();try{
    const first=h.batch();
    first.messages[0].ack=()=>{throw Error("ack_unavailable")};
    await assert.rejects(()=>worker.queue(first,h.env),/ack_unavailable/);
    assert.equal(h.calls,3);
    const replay=h.batch();
    await assert.rejects(()=>worker.queue(replay,h.env),/ai_queue_nonce_reused_or_unverified/);
    assert.equal(h.calls,3);
    assert.equal(replay.acks,0);
  }finally{h.close()}
});
test("multiple messages in one batch fail closed before nonce claim",async()=>{
  const h=setup();try{
    const b=h.batch();b.messages.push({body:{...body,nonce:"f".repeat(32)},ack(){}});
    await assert.rejects(()=>worker.queue(b,h.env),/ai_queue_one_message_only/);
    assert.equal(h.calls,0);
    assert.equal(h.sql.prepare("SELECT count(*) AS n FROM ai_private_queue_nonce_claims").get().n,0);
  }finally{h.close()}
});
