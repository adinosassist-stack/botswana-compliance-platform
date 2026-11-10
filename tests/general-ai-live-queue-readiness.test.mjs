import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSyntheticEnvelope,assertInertConsumerConfiguration,generateReadinessEvidence} from "../scripts/general-ai-live-queue-readiness.mjs";
const sha="a".repeat(40),nonce="b".repeat(32);
const config=readFileSync(new URL("../cloudflare/wrangler.general-ai-private-consumer.toml",import.meta.url),"utf8");

test("synthetic envelope has only approved disabled-state fields",()=>{
 const body=createSyntheticEnvelope({sourceSha:sha,nonce});
 assert.deepEqual(Object.keys(body),["operation","worker","sourceSha","nonce"]);
 assert.equal(body.operation,"verify-disabled");
 assert.ok(Object.isFrozen(body));
});
test("invalid source and nonce fail before any Queue send",()=>{
 for(const sourceSha of ["","A".repeat(40),"a".repeat(39)])assert.throws(()=>createSyntheticEnvelope({sourceSha,nonce}));
 for(const value of ["","B".repeat(32),"b".repeat(31)])assert.throws(()=>createSyntheticEnvelope({sourceSha:sha,nonce:value}));
});
test("locked consumer remains inert, private, and isolated",()=>{
 assert.equal(assertInertConsumerConfiguration(config),true);
 for(const alteration of [
  config.replace('PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED = "false"','PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED = "true"'),
  config.replace('workers_dev = false','workers_dev = true'),
  config.replace('max_retries = 0','max_retries = 2'),
  config+'\nAPPROVED_SOURCE_SHA = "'+sha+'"\n',
  config+'\n[[queues.producers]]\n'
 ])assert.throws(()=>assertInertConsumerConfiguration(alteration));
});
test("evidence cannot misrepresent offline checks as live Queue proof",()=>{
 const result=generateReadinessEvidence({sourceSha:sha,config});
 assert.equal(result.scope,"OFFLINE_READINESS_ONLY");
 for(const key of ["consumerEnabled","liveDeliveryVerified","liveAckVerified","liveReplayVerified","recoveryVerified","customerTrafficEnabled"])assert.equal(result[key],false);
 assert.equal(result.queueMessagesSent,0);
 assert.ok(Object.isFrozen(result));
});
