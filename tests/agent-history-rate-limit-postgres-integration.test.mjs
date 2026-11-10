import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {createAgentHistoryPostgresRateLimiter} from "../server/agent-approval-history-postgres-rate-limit.js";
import {createAgentHistoryRateLimitCleanup} from "../server/agent-approval-history-rate-limit-cleanup.js";
const url=process.env.AGENT_HISTORY_TEST_DATABASE_URL;
test("real PostgreSQL: concurrent shared limiter, isolation, and retention", {skip:!url},async()=>{
 const pool=new pg.Pool({connectionString:url,max:16});
 try{
  const limiter=createAgentHistoryPostgresRateLimiter({pool,limit:7,windowSeconds:60,clock:()=>new Date(180000)});
  const attempts=await Promise.all(Array.from({length:40},()=>limiter({tenantId:"tenant-a",actorId:"user-a"})));
  assert.equal(attempts.filter(Boolean).length,7);
  assert.equal(attempts.filter(x=>!x).length,33);
  assert.equal(await limiter({tenantId:"tenant-a",actorId:"user-b"}),true);
  assert.equal(await limiter({tenantId:"tenant-b",actorId:"user-a"}),true);
  const q=await pool.query("select request_count from agent_history_rate_limits where tenant_id=$1 and actor_id=$2 and bucket_id=$3",["tenant-a","user-a",3]);
  assert.equal(q.rows[0].request_count,7);
  const cleanup=createAgentHistoryRateLimitCleanup({pool,windowSeconds:60,retentionSeconds:3600,clock:()=>new Date(7200000)});
  const deleted=await cleanup();
  assert.ok(deleted>=3);
  const remaining=await pool.query("select count(*)::int as count from agent_history_rate_limits where bucket_id=3");
  assert.equal(remaining.rows[0].count,0);
 }finally{await pool.end()}
});
