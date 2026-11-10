import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {createPostgresAgentApprovalHistoryReader} from "../server/agent-approval-history-postgres.js";
import {getAgentApprovalHistoryForPrincipal} from "../server/agent-approval-history-controller.js";

// Opt-in integration test: requires a disposable database with the verified
// 20261015 and 20261016 governance migrations already applied.
test("real PostgreSQL history is tenant- and actor-isolated", {skip:!process.env.AGENT_HISTORY_TEST_DATABASE_URL}, async()=>{
 const require=createRequire(import.meta.url);
 const {Pool}=require("pg");
 const pool=new Pool({connectionString:process.env.AGENT_HISTORY_TEST_DATABASE_URL});
 const tenantA="history-"+randomUUID(),tenantB="history-"+randomUUID();
 const ids=[randomUUID(),randomUUID(),randomUUID()];
 const insert=`insert into agent_action_approvals
 (id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at)
 values ($1,$2,$3,$4,$5,$6,'pending',now()+interval '1 hour')`;
 try{
  await pool.query(insert,[ids[0],tenantA,"owner-a","draft_internal_task","a".repeat(64),randomUUID()]);
  await pool.query(insert,[ids[1],tenantA,"manager-a","draft_internal_task","b".repeat(64),randomUUID()]);
  await pool.query(insert,[ids[2],tenantB,"owner-b","draft_internal_task","c".repeat(64),randomUUID()]);
  const reader=createPostgresAgentApprovalHistoryReader(pool);
  const ownerRows=await reader.listTenantApprovals({tenantId:tenantA});
  assert.deepEqual(new Set(ownerRows.map(x=>x.id)),new Set(ids.slice(0,2)));
  const managerRows=await reader.listTenantApprovals({tenantId:tenantA,actorId:"manager-a"});
  assert.deepEqual(managerRows.map(x=>x.id),[ids[1]]);
  const result=await getAgentApprovalHistoryForPrincipal({
   principal:{authenticated:true,tenantId:tenantA,actorId:"manager-a",actorRole:"manager"},
   pool,featureEnabled:true
  });
  assert.equal(result.ok,true);assert.deepEqual(result.items.map(x=>x.id),[ids[1]]);
  assert.equal(result.items[0].status,"requested");
 }finally{
  await pool.query("delete from agent_action_approvals where id = any($1::uuid[])",[ids]).catch(()=>{});
  await pool.end();
 }
});
