import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const preflight=fs.readFileSync("cloudflare/preflight-production.sh","utf8");
const deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8");

test("Cloudflare Queue consumer is not configured without a queue handler",()=>{
  const runtimeHasQueueHandler=/\basync\s+queue\s*\(|\bqueue\s*\(/.test(worker);
  assert.equal(runtimeHasQueueHandler,false);
  assert.doesNotMatch(wrangler,/\[\[queues\.consumers\]\]/);
});

test("unused TASK_QUEUE binding and provisioning are absent",()=>{
  assert.doesNotMatch(worker,/env\.TASK_QUEUE/);
  assert.doesNotMatch(wrangler,/TASK_QUEUE|bw-compliance-tasks/);
  assert.doesNotMatch(preflight,/TASK_QUEUE|bw-compliance-tasks/);
  assert.doesNotMatch(deploy,/queues create bw-compliance-tasks/);
});

test("production safety gates remain intact",()=>{
  assert.match(wrangler,/workers_dev = false/);
  assert.match(wrangler,/preview_urls = false/);
  assert.match(wrangler,/PAYMENT_PROVIDER = "none"/);
  assert.match(wrangler,/EVIDENCE_UPLOADS_ENABLED = "true"/);
});
