import assert from "node:assert/strict";
import fs from "node:fs";
import {__financeWatchDurableLoopTest,FINANCE_WATCH_DURABLE_LOOP_VERSION} from "../cloudflare/src/finance-watch-durable-loop.js";

const writes=[];
const DB={
  prepare(sql){
    return {sql,bindings:[],bind(...values){this.bindings=values;return this}};
  },
  async batch(statements){
    for(const statement of statements)writes.push({sql:statement.sql,bindings:statement.bindings});
    return [
      {meta:{}},
      {meta:{changes:1}},
      {meta:{changes:1}},
      {meta:{changes:1}},
      {meta:{changes:1}}
    ];
  }
};

const task={id:"watch-owner-attention",tenant_id:"tenant-a",status:"active",next_run_at:"2026-09-26T08:00:00.000Z"};
const claim={id:"claim-a",scheduledFor:"2026-09-26T08:00:00.000Z",attempts:3,recovered:true};
const outcome={ok:false,persisted:false,code:"observation_unverified",recovery:{decision:"owner_attention",retry:false},executionAllowed:false};

const escalated=await __financeWatchDurableLoopTest.escalateOwnerAttention({DB},task,claim,outcome);
assert.equal(escalated.paused,true);
assert.equal(escalated.recoveryDecision,"owner_attention");
assert.equal(escalated.executionAllowed,false);
assert.equal(escalated.externalActions,0);
assert.equal(writes.length,5);
assert.match(writes[0].sql,/SELECT CASE WHEN NOT EXISTS/);
assert.match(writes[1].sql,/agent_observation_claims SET status='failed'/);
assert.match(writes[2].sql,/agent_persistent_tasks SET status='paused'/);
assert.match(writes[3].sql,/OWNER_ATTENTION_REQUIRED/);
assert.match(writes[4].sql,/AGENT_FINANCE_OBSERVATION_OWNER_ATTENTION/);

const source=fs.readFileSync("cloudflare/src/finance-watch-durable-loop.js","utf8");
assert.match(source,/outcome\?\.recovery\?\.decision==="owner_attention"/);
assert.match(source,/await escalateOwnerAttention\(env,task,claim,outcome\)/);
assert.match(source,/code:"owner_attention_escalation_failed"/);
assert.match(FINANCE_WATCH_DURABLE_LOOP_VERSION,/v16$/);

console.log("v158 Finance Watch owner-attention circuit breaker passed");
