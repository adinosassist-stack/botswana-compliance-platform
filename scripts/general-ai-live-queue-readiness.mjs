import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validatePrivateAiQueueMessage} from "../cloudflare/src/general-ai-queue-acceptance.js";

export const STAGING_QUEUE="bw-general-ai-private-acceptance-queue";
export const STAGING_WORKER="bw-general-ai-staging";
export const STAGING_D1="71e2d394-7dec-4878-bdc8-afe8f73cf541";
const SHA=/^[a-f0-9]{40}$/;
const NONCE=/^[a-f0-9]{32}$/;

export function createSyntheticEnvelope({sourceSha,nonce}){
  assert.match(sourceSha,SHA,"exact 40-character lowercase source SHA required");
  assert.match(nonce,NONCE,"exact 32-character lowercase nonce required");
  const body={operation:"verify-disabled",worker:STAGING_WORKER,sourceSha,nonce};
  validatePrivateAiQueueMessage(body,sourceSha);
  return Object.freeze(body);
}

export function assertInertConsumerConfiguration(config){
  const requireLine=line=>assert.ok(config.split(/\r?\n/).includes(line),`missing locked line: ${line}`);
  for(const line of [
    'name = "bw-general-ai-private-queue-acceptance"',
    'workers_dev = false','preview_urls = false',
    'PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED = "false"',
    'PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED = "false"',
    'PRIVATE_AI_LEDGER_ISOLATION_VERIFIED = "false"',
    'database_id = "'+STAGING_D1+'"',
    'queue = "'+STAGING_QUEUE+'"',
    'max_batch_size = 1','max_concurrency = 1','max_retries = 0'
  ])requireLine(line);
  assert.doesNotMatch(config,/^\s*(?:route|routes|zone_id|APPROVED_SOURCE_SHA)\s*=/m);
  assert.doesNotMatch(config,/^\s*\[\[queues\.producers\]\]/m);
  return true;
}

export function generateReadinessEvidence({sourceSha,config}){
  assert.match(sourceSha,SHA);
  assertInertConsumerConfiguration(config);
  return Object.freeze({
    sourceSha,
    scope:"OFFLINE_READINESS_ONLY",
    stagingQueue:STAGING_QUEUE,
    isolatedNonceDatabase:STAGING_D1,
    consumerEnabled:false,
    queueMessagesSent:0,
    liveDeliveryVerified:false,
    liveAckVerified:false,
    liveReplayVerified:false,
    recoveryVerified:false,
    customerTrafficEnabled:false
  });
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const sourceSha=process.argv[2];
  const config=readFileSync(new URL("../cloudflare/wrangler.general-ai-private-consumer.toml",import.meta.url),"utf8");
  console.log(JSON.stringify(generateReadinessEvidence({sourceSha,config}),null,2));
}
