import assert from "node:assert/strict";import fs from "node:fs";
const deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8");
const expected=[
"047_v81_delegated_authority.sql","048_v102_bounded_internal_task_execution.sql","049_v108_finance_receivables.sql","050_v115_manual_bank_subscriptions.sql","051_v117_persistent_agent_tasks.sql","052_v122_agent_observation_checkpoints.sql","053_v132_agent_observation_claims.sql","054_v134_agent_observation_identity.sql","055_v149_finance_watch_audit_integrity.sql"];
let last=-1;for(const name of expected){assert.equal(fs.existsSync("cloudflare/migrations/"+name),true,"missing migration "+name);const i=deploy.indexOf("migrations/"+name);assert.ok(i>last,"deployment chain missing or out of order: "+name);last=i;}
assert.match(deploy,/forward migrations 047, 048, 049, 050, 051, 052, 053, 054, and 055 in order/);
const m50=fs.readFileSync("cloudflare/migrations/050_v115_manual_bank_subscriptions.sql","utf8");assert.match(m50,/CREATE TABLE IF NOT EXISTS manual_payment_submissions/);assert.match(m50,/CREATE TABLE IF NOT EXISTS manual_payment_events/);
console.log("v137 migration chain integrity passed");
