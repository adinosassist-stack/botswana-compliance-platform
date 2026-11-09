import assert from "node:assert/strict";

export const REQUIRED_LIVE_EVIDENCE = Object.freeze([
  "liveDeliveryVerified",
  "liveAckVerified",
  "liveReplayVerified",
  "recoveryVerified",
  "d1IsolationVerified",
  "consumerRestoredDisabled"
]);

export function validateLiveQueueAcceptance(record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record));
  assert.match(record.sourceSha ?? "", /^[a-f0-9]{40}$/);
  assert.match(record.runUrl ?? "", /^https:\/\/github\.com\/adinosassist-stack\/botswana-compliance-platform\/actions\/runs\/[1-9][0-9]*$/);
  assert.equal(record.environment, "general-ai-private-staging");
  assert.equal(record.queue, "bw-general-ai-private-acceptance-queue");
  assert.equal(record.customerAiEnabled, false);
  assert.equal(record.productionResourcesTouched, false);
  for (const key of REQUIRED_LIVE_EVIDENCE) {
    assert.equal(record[key], true, `${key} requires verified live evidence`);
    assert.match(record.evidence?.[key] ?? "", /^[a-zA-Z0-9_.:/-]{8,256}$/, `missing redacted evidence reference: ${key}`);
  }
  return Object.freeze({accepted:true,sourceSha:record.sourceSha,runUrl:record.runUrl});
}

export function initialLiveQueueAcceptance(sourceSha) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  return Object.freeze({
    sourceSha,
    environment:"general-ai-private-staging",
    queue:"bw-general-ai-private-acceptance-queue",
    customerAiEnabled:false,
    productionResourcesTouched:false,
    ...Object.fromEntries(REQUIRED_LIVE_EVIDENCE.map(key=>[key,false]))
  });
}
