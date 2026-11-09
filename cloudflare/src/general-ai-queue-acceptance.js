/** REVIEW-ONLY Cloudflare Queue consumer for private disabled-state acceptance.
 * No fetch handler, public route, database adapter, provider binding or outbound HTTP.
 * Never deploy without independent approval and restricted queue/consumer identity.
 */
import {verifyPrivateAiDisabled} from "./general-ai-private-acceptance.js";
const QUEUE = "bw-general-ai-private-acceptance-queue";
const TARGET = "bw-general-ai-staging";
const SHA = /^[a-f0-9]{40}$/;
const NONCE = /^[a-f0-9]{32}$/;
const FIELDS = ["operation","worker","sourceSha","nonce"];
const fail = code => { throw Error(code) };
function validateConfig(batch, env) {
  if(batch?.queue!==QUEUE)fail("ai_queue_scope_mismatch");
  if(env?.PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED!=="true")fail("ai_queue_not_authorized");
  if(typeof env?.STAGING_AI?.fetch!=="function")fail("ai_private_target_binding_missing");
  if(!SHA.test(env?.APPROVED_SOURCE_SHA||""))fail("ai_approved_source_sha_required");
  // An implementation must guarantee an atomic, durable, globally unique claim.
  // KV get/put or in-memory Sets are NOT sufficient replay protection.
  if(typeof env?.PRIVATE_AI_NONCE_LEDGER?.claimOnce!=="function")fail("ai_durable_nonce_ledger_required");
}
export function validatePrivateAiQueueMessage(body, approvedSha) {
  if(!body || typeof body!=="object" || Array.isArray(body) ||
      Object.keys(body).length!==FIELDS.length ||
      FIELDS.some(k=>!Object.hasOwn(body,k)))fail("ai_queue_invalid_envelope");
  if(body.operation!=="verify-disabled" || body.worker!==TARGET ||
      body.sourceSha!==approvedSha || !NONCE.test(body.nonce))fail("ai_queue_unapproved_operation");
  return {operation:body.operation,nonce:body.nonce};
}
export default {
  async queue(batch,env){
    validateConfig(batch,env);
    if(!Array.isArray(batch.messages) || batch.messages.length!==1)fail("ai_queue_one_message_only");
    // No cookies, prompts, session IDs, D1 writes, provider requests or response bodies.
    const data=validatePrivateAiQueueMessage(batch.messages[0].body,env.APPROVED_SOURCE_SHA);
    // Claim before invoking. On failure, do NOT release the nonce: a repeated
    // message must not re-execute the private target. Dead-letter/manual review
    // is safer than silently retrying a partially executed acceptance run.
    const claimed=await env.PRIVATE_AI_NONCE_LEDGER.claimOnce({
      namespace:QUEUE,sourceSha:env.APPROVED_SOURCE_SHA,nonce:data.nonce
    });
    if(claimed!==true)fail("ai_queue_nonce_reused_or_unverified");
    const result=await verifyPrivateAiDisabled({service:env.STAGING_AI});
    if(result.ok!==true || result.tested!==3)fail("ai_queue_private_boundary_no_go");
    // No nonce or message payload in logs.
    console.log(JSON.stringify({event:"general_ai_private_disabled_accepted",tests:result.tested}));
    batch.messages[0].ack();
  }
};
