import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {installAgentCostTestSchema} from "./helpers/agent-cost-schema.mjs";
import {reserveAgentCost,settleAgentCost} from "../cloudflare/src/agent-cost-reservations.js";

const db=new DatabaseSync(":memory:");
try{
  installAgentCostTestSchema(db);
  db.exec("INSERT INTO tenants(id,name) VALUES('t1','Purge'),('t2','Keep'); INSERT INTO users(id,email) VALUES('u1','purge@example.test'),('u2','keep@example.test'); INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','u1','owner','active'),('t2','u2','owner','active'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('t1','thebe',100,1),('t2','thebe',100,1)");
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},first(){return db.prepare(sql).get(...args)},run(){return db.prepare(sql).run(...args)}}},
    async batch(statements){db.exec("BEGIN IMMEDIATE");try{const result=statements.map(s=>({meta:{changes:Number(s.run().changes)}}));db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}}};
  const env={DB};
  const cost=tenant=>({tenantId:tenant,actorTenantId:tenant,agentId:"thebe",runId:tenant,reservationId:tenant,estimatedCostMinor:10});
  assert.equal((await reserveAgentCost(env,cost('t1'))).allowed,true);
  assert.equal((await reserveAgentCost(env,cost('t2'))).allowed,true);
  db.exec("INSERT INTO deletion_requests(id,tenant_id,user_id,status,processing_token) VALUES('dr1','t1','u1','processing','claim-1')");
  // Execute the actual worker finalizer and its exact noncascade SQL list.
  const source=readFileSync("cloudflare/src/worker.js","utf8");
  const constants=source.slice(source.indexOf("const TENANT_NON_CASCADE_PURGE_SQL="),source.indexOf("const TENANT_DELETION_EVIDENCE_BATCH="));
  const finalizer=source.slice(source.indexOf("async function finalizeTenantDeletion("),source.indexOf("async function processDeletionRequest("));
  const activeLegalHold=async(env,tenant)=>env.DB.prepare("SELECT id FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1").bind(tenant).first();
  const releaseClaim=async(env,id,token,status,error)=>env.DB.prepare("UPDATE deletion_requests SET status=?,last_error=?,processing_token=NULL WHERE id=? AND processing_token=?").bind(status,error,id,token).run();
  const finalize=new Function("activeLegalHold","tenantDeletionFingerprint","releaseTenantDeletionClaim",constants+finalizer+"return finalizeTenantDeletion;")
    (activeLegalHold,async(_env,tenant)=>'synthetic-fingerprint-'+tenant,releaseClaim);
  const dr={id:'dr1',tenant_id:'t1'};
  assert.equal((await finalize(env,dr,'stale-claim')).error,'deletion_claim_lost');
  const before={...db.prepare("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2'").get()};
  await assert.rejects(finalize(env,dr,'claim-1'),/cost_purge_reconciliation_required/);
  assert.equal(db.prepare("SELECT count(*) n FROM deletion_tombstones").get().n,0);
  assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_purge_authorizations").get().n,0);
  assert.ok(db.prepare("SELECT id FROM users WHERE id='u1'").get(),"blocked batch must preserve user");
  assert.equal((await reserveAgentCost(env,{...cost('t1'),runId:'during-delete',reservationId:'during-delete'})).allowed,false);
  assert.equal((await settleAgentCost(env,{...cost('t1'),actualCostMinor:5,provider:'mock',model:'mock',inputTokens:1,outputTokens:1})).allowed,true);
  for(const table of ['agent_cost_budgets','agent_cost_reservations','agent_cost_events'])
    assert.throws(()=>db.exec("DELETE FROM "+table+" WHERE tenant_id='t1'"),/cost_.*delete_forbidden/);
  assert.throws(()=>db.exec("DELETE FROM tenants WHERE id='t1'"),/cost_purge_governance_required/);
  assert.throws(()=>db.exec("INSERT INTO agent_cost_purge_authorizations(tenant_id,request_id) VALUES('t1','forged')"),/cost_purge_governance_required/);
  db.exec("INSERT INTO legal_holds(id,tenant_id,reason) VALUES('hold','t1','Synthetic')");
  await assert.rejects(DB.batch([DB.prepare("INSERT INTO deletion_tombstones(request_id,tenant_fingerprint) VALUES('dr1','synthetic-fingerprint-t1')")]),/cost_purge_legal_hold_active/);
  assert.equal((await finalize(env,dr,'claim-1')).error,'legal_hold_active');
  db.exec("UPDATE legal_holds SET active=0,status='released'; UPDATE deletion_requests SET status='processing',processing_token='claim-2' WHERE id='dr1'");
  assert.equal((await finalize(env,dr,'claim-2')).ok,true);
  for(const table of ['tenants','users','deletion_requests','agent_cost_budgets','agent_cost_reservations','agent_cost_events','agent_cost_purge_authorizations']){
    const key=table==='users'?'id':table==='tenants'?'id':'tenant_id';
    assert.equal(db.prepare("SELECT count(*) n FROM "+table+" WHERE "+key+"=?").get(table==='users'?'u1':'t1').n,0,table+" target purge");
  }
  assert.ok(db.prepare("SELECT request_id FROM deletion_tombstones WHERE request_id='dr1'").get());
  assert.deepEqual({...db.prepare("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2'").get()},before);
  assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t2'").get().n,1);
  assert.equal((await finalize(env,dr,'claim-2')).error,'deletion_claim_lost');
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  db.exec(readFileSync("cloudflare/experimental/agent_cost_accounting.sql","utf8"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  console.log("Agent cost tenant purge: actual worker finalizer, claim/hold/reconciliation guards, rollback and tenant isolation PASS");
}finally{db.close()}
