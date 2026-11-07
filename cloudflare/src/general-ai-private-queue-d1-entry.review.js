/** REVIEW ONLY — private Queue/D1 integration candidate. NOT a deployed entrypoint.
 * No fetch handler, no public URL, no direct production use. Requires separately
 * approved dedicated D1, schema and exact-source protected runner configuration.
 */
import queueConsumer from "./general-ai-queue-acceptance.js";
import {createPrivateAiD1NonceLedger} from "./general-ai-private-queue-d1-ledger.js";

export function buildPrivateQueueEnvironment(env) {
  if(env?.PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED!=="true")throw Error("ai_queue_not_authorized");
  if(env?.PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED!=="true")throw Error("ai_nonce_schema_qualification_required");
  if(env?.PRIVATE_AI_LEDGER_ISOLATION_VERIFIED!=="true")throw Error("ai_nonce_isolation_unverified");
  if(typeof env?.PRIVATE_AI_NONCE_DB?.prepare!=="function")throw Error("ai_nonce_d1_binding_required");
  if(typeof env?.STAGING_AI?.fetch!=="function")throw Error("ai_private_target_binding_missing");
  if(env.PRIVATE_AI_NONCE_LEDGER!==undefined)throw Error("ai_nonce_ledger_injection_forbidden");
  return {
    ...env,
    PRIVATE_AI_NONCE_LEDGER:createPrivateAiD1NonceLedger({db:env.PRIVATE_AI_NONCE_DB,schemaQualified:true})
  };
}
export default {
  async queue(batch,env){
    return queueConsumer.queue(batch,buildPrivateQueueEnvironment(env));
  }
};
