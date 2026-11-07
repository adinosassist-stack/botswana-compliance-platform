import test from "node:test";
import assert from "node:assert/strict";
import worker,{validatePrivateAiQueueMessage} from "../cloudflare/src/general-ai-queue-acceptance.js";
import staging from "../cloudflare/src/general-ai-staging-entry.js";
const sha="a".repeat(40);
const msg={operation:"verify-disabled",worker:"bw-general-ai-staging",sourceSha:sha,nonce:"b".repeat(32)};
const target={fetch:request=>staging.fetch(request,{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"})};
const config={STAGING_AI:target,APPROVED_SOURCE_SHA:sha,PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED:"true"};
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
