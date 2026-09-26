import assert from "node:assert/strict";
import {runFinanceWatchTask} from "../cloudflare/src/finance-watch-durable-loop.js";

function dbMock(){
 const writes=[];const db={
  prepare(sql){return {sql,bindings:[],bind(...v){this.bindings=v;return this},async first(){
   if(sql.includes("agent_observation_checkpoints"))return null;
   if(sql.includes("audit_chain_state"))return null;
   if(sql.includes("finance_accounts"))return {cash_position_minor:10000,account_count:1};
   if(sql.includes("finance_reconciliation_runs"))return {reconciliation_count:1,exception_count:0,exception_exposure_minor:0};
   if(sql.includes("finance_import_batches"))return {import_batch_count:1,completed_batch_count:1,failed_batch_count:0,imported_row_count:10,duplicate_row_count:0};
   if(sql.includes("finance_transactions"))return {transaction_count:10,missing_fingerprint_count:0};
   if(sql.includes("finance_invoices"))return {};
   return {};
  },async all(){return {results:[]}},async run(){writes.push({sql,bindings:this.bindings});return {meta:{changes:1}}}}},
  async batch(stmts){for(const s of stmts)writes.push({sql:s.sql,bindings:s.bindings});return stmts.map(()=>({meta:{changes:1}}))}
 };return {db,writes};
}
const {db,writes}=dbMock();
const task={id:"watch-a",tenant_id:"tenant-a",status:"active",allowed_tools_json:JSON.stringify(["financial_position.read","finance_data_quality.read"]),budget_json:JSON.stringify({maxToolCallsPerRun:4})};
const result=await runFinanceWatchTask({env:{DB:db,AUDIT_INTEGRITY_SECRET:"test-audit-secret-32-characters-minimum"},task});
assert.equal(result.executionAllowed,false);assert.equal(result.externalActions,0);assert.equal(result.persisted,true);assert.equal(result.checkpoint.tenantId,"tenant-a");
assert.ok(writes.some(x=>x.sql.includes("INSERT INTO agent_observation_checkpoints")));
assert.ok(writes.some(x=>x.sql.includes("INSERT INTO audit_events(tenant_id,actor_user_id")));
assert.ok(writes.some(x=>x.sql.includes("INSERT INTO audit_chain_state")));
assert.ok(writes.every(x=>!x.sql.includes("INSERT INTO audit_events(id,")));
assert.ok(writes.every(x=>!x.sql.includes("agent_execution_grants")&&!x.sql.includes("agent_task_requests")));

const invalid=await runFinanceWatchTask({env:{DB:db},task:{...task,tenant_id:""}});
assert.equal(invalid.ok,false);assert.equal(invalid.executionAllowed,false);
console.log("v129 durable finance watch loop passed");
