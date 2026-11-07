import test from "node:test";
import assert from "node:assert/strict";
import worker,{validatePrivateAiQueueMessage} from "../cloudflare/src/general-ai-queue-acceptance.js";
import staging from "../cloudflare/src/general-ai-staging-entry.js";
const sha="a".repeat(40);
const msg={operation:"verify-disabled",worker:"bw-general-ai-staging",sourceSha:sha,nonce:"b".repeat(32)};
const target={fetch:request=>staging.fetch(request,{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"})};
function ledger(){const consumed=new Set();return {consumed,async claimOnce({namespace,sourceSha,nonce}){const key=[namespace,sourceSha,nonce].join(":");if(consumed.has(key))return false;consumed.add(key);return true}}}
const config={STAGING_AI:target,APPROVED_SOURCE_SHA:sha,PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"true",PRIVATE_AI_NONCE_LEDGER:{claimOnce:async()=>true}};
function batch(body=msg,queue="bw-general-ai-private-acceptance-queue") {
 let acks=0;
 return {queue,messages:[{body,ack:()=>{acks++}}],get acks(){return acks}};
}
test("review-only queue consumer verifies disabled private target and acknowledges",async()=>{
 const b=batch();
 await worker.queue(b,config);
 assert.equal(b.acks,1);
});
test("unprovisioned runner or wrong queue never contacts service",async()=>{
 let calls=0;
 const env={...config,STAGING_AI:{fetch:()=>{calls++;throw Error("must_not_run")}}};
 await assert.rejects(()=>worker.queue(batch(),{...env,PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"false"}),/ai_queue_not_authorized/);
 await assert.rejects(()=>worker.queue(batch(msg,"other-queue"),env),/ai_queue_scope_mismatch/);
 assert.equal(calls,0);
});
test("only exact disabled-check operation, worker, sha, nonce and fields allowed",()=>{
 for(const body of [
  {...msg,operation:"enable-ai"}, {...msg,worker:"bw-compliance-os"},
  {...msg,sourceSha:"c".repeat(40)}, {...msg,nonce:"bad"},
  {...msg,prompt:"sensitive"}, {...msg,actorId:"real-user"}, null, [], {}
 ])assert.throws(()=>validatePrivateAiQueueMessage(body,sha));
});
test("invalid message never calls private Worker or acknowledges",async()=>{
 let calls=0;
 const b=batch({...msg,prompt:"hello"});
 await assert.rejects(()=>worker.queue(b,{...config,STAGING_AI:{fetch:()=>{calls++}}}),/ai_queue_invalid_envelope/);
 assert.equal(calls,0);assert.equal(b.acks,0);
});
test("unexpected enabled target fails closed without ack",async()=>{
 const b=batch();
 await assert.rejects(()=>worker.queue(b,{...config,STAGING_AI:{fetch:async()=>new Response(null,{status:401})}}),/private_staging_boundary_mismatch/);
 assert.equal(b.acks,0);
});
test("batch or missing SHA fails closed",async()=>{
 const b=batch();b.messages.push(b.messages[0]);
 await assert.rejects(()=>worker.queue(b,config),/ai_queue_one_message_only/);
 await assert.rejects(()=>worker.queue(batch(),{...config,APPROVED_SOURCE_SHA:""}),/ai_approved_source_sha_required/);
});

test("same nonce cannot invoke the private target twice",async()=>{
 const l=ledger();let calls=0;
 const env={...config,PRIVATE_AI_NONCE_LEDGER:l,STAGING_AI:{fetch:request=>{calls++;return target.fetch(request)}}};
 const first=batch();
 await worker.queue(first,env);
 assert.equal(first.acks,1);
 const replay=batch();
 await assert.rejects(()=>worker.queue(replay,env),/ai_queue_nonce_reused_or_unverified/);
 assert.equal(replay.acks,0);
 assert.equal(calls,3);
});
test("no durable nonce ledger fails before any service call",async()=>{
 let calls=0;
 const env={...config,PRIVATE_AI_NONCE_LEDGER:undefined,STAGING_AI:{fetch:()=>{calls++;return new Response(null,{status:404})}}};
 await assert.rejects(()=>worker.queue(batch(),env),/ai_durable_nonce_ledger_required/);
 assert.equal(calls,0);
});
test("non-atomic or uncertain nonce result refuses invocation and acknowledgement",async()=>{
 let calls=0;
 for(const verdict of [false,null,undefined,1]){
  const b=batch();
  const env={...config,PRIVATE_AI_NONCE_LEDGER:{claimOnce:async()=>verdict},STAGING_AI:{fetch:()=>{calls++}}};
  await assert.rejects(()=>worker.queue(b,env),/ai_queue_nonce_reused_or_unverified/);
  assert.equal(b.acks,0);
 }
 assert.equal(calls,0);
});
test("failed private target leaves nonce claimed and refuses retry",async()=>{
 const l=ledger();let calls=0;
 const env={...config,PRIVATE_AI_NONCE_LEDGER:l,STAGING_AI:{fetch:async()=>{calls++;return new Response(null,{status:401})}}};
 await assert.rejects(()=>worker.queue(batch(),env),/private_staging_boundary_mismatch/);
 await assert.rejects(()=>worker.queue(batch(),env),/ai_queue_nonce_reused_or_unverified/);
 assert.equal(calls,1);
});
