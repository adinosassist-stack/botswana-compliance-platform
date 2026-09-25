import assert from "node:assert/strict";
import fs from "node:fs";
import {__financeConnectionTest} from "../cloudflare/src/finance-core.js";

const providers=__financeConnectionTest.providerCatalog();
assert.deepEqual(providers.map(item=>item.key).sort(),["fnb_bw_business","generic_adapter","xero"]);
for(const provider of providers){
  assert.equal(provider.readOnly,true);
  assert.equal(provider.credentialStorage,"external");
  assert.equal(provider.configuredByThebe,false);
}
assert.equal(__financeConnectionTest.PROVIDER_DEFINITIONS.fnb_bw_business.activationMode,"provider_onboarding_required");
assert.equal(__financeConnectionTest.PROVIDER_DEFINITIONS.xero.activationMode,"provider_onboarding_required");
assert.equal(__financeConnectionTest.PROVIDER_DEFINITIONS.generic_adapter.activationMode,"owner_attested_read_only");
assert.equal(__financeConnectionTest.CONNECTION_STATUSES.has("active"),true);
assert.equal(__financeConnectionTest.CONNECTION_STATUSES.has("write_enabled"),false);
assert.equal(__financeConnectionTest.MAX_CONNECTIONS,100);
assert.equal(__financeConnectionTest.containsSecretMaterial({accessToken:"forbidden"}),true);
assert.equal(__financeConnectionTest.containsSecretMaterial({nested:{clientSecret:"forbidden"}}),true);
assert.equal(__financeConnectionTest.containsSecretMaterial({credentialStorage:"external",confirmReadOnly:true}),false);
assert.deepEqual(__financeConnectionTest.connectionActionPath("/api/finance/connections/c1/pause"),{connectionId:"c1",action:"pause"});
assert.deepEqual(__financeConnectionTest.connectionSyncRunsPath("/api/finance/connections/c1/sync-runs"),{connectionId:"c1"});

const rows=[
  {entity_id:"c1",event_type:"CONNECTION_REGISTERED",sequence:1,occurred_at:"2026-09-13 10:00:00",payload_json:JSON.stringify({accountId:"a1",providerKey:"generic_adapter",connectionType:"generic_adapter",displayName:"Readonly feed",readOnly:true,credentialStorage:"external",secretMaterialStored:false})},
  {entity_id:"c1",event_type:"CONNECTION_STATUS_CHANGED",sequence:2,occurred_at:"2026-09-13 10:01:00",payload_json:JSON.stringify({previousStatus:"not_configured",status:"active"})},
  {entity_id:"c1",event_type:"CONNECTION_STATUS_CHANGED",sequence:3,occurred_at:"2026-09-13 10:02:00",payload_json:JSON.stringify({previousStatus:"not_configured",status:"paused"})},
  {entity_id:"c1",event_type:"CONNECTION_STATUS_CHANGED",sequence:4,occurred_at:"2026-09-13 10:03:00",payload_json:JSON.stringify({previousStatus:"active",status:"revoked"})},
  {entity_id:"c1",event_type:"CONNECTION_STATUS_CHANGED",sequence:5,occurred_at:"2026-09-13 10:04:00",payload_json:JSON.stringify({previousStatus:"paused",status:"active"})}
];
const sync={entity_id:"c1",event_type:"CONNECTION_SYNC_COMPLETED",sequence:6,occurred_at:"2026-09-13 10:05:00",payload_json:JSON.stringify({status:"completed",batchId:"b1",idempotencyKeyHash:"abc"})};
const state=__financeConnectionTest.connectionFromLineage(rows,sync);
assert.equal(state.id,"c1");
assert.equal(state.status,"revoked","revocation must be terminal even if a stale later event tries to revive the connection");
assert.equal(state.accountId,"a1");
assert.equal(state.providerKey,"generic_adapter");
assert.equal(state.readOnly,true);
assert.equal(state.credentialStorage,"external");
assert.equal(state.secretMaterialStored,false);
assert.equal(state.lastSyncStatus,"completed");
assert.equal(state.lastSyncedAt,"2026-09-13 10:05:00");

assert.equal(fs.existsSync("cloudflare/migrations/047_v81_finance_connections.sql"),false,"finance connections must not add a schema migration");
assert.equal(fs.existsSync("scripts/migrate-production-d1-047.mjs"),false,"no production migration runner should exist for finance connections");
assert.equal(fs.existsSync(".github/workflows/migrate-production-d1-047.yml"),false,"no production migration workflow should exist for finance connections");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.latest_cloudflare_migration,"051_v117_persistent_agent_tasks.sql");

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/entity_type='finance_connection'/);
assert.match(finance,/CONNECTION_REGISTERED/);
assert.match(finance,/CONNECTION_STATUS_CHANGED/);
assert.match(finance,/CONNECTION_SYNC_COMPLETED/);
assert.match(finance,/finance_connection_secret_material_forbidden/);
assert.match(finance,/external_account_reference_not_accepted/);
assert.match(finance,/finance_connection_id_required/);
assert.match(finance,/finance_connection_not_active/);
assert.match(finance,/finance_connection_account_mismatch/);
assert.match(finance,/finance_connection_provider_mismatch/);
assert.match(finance,/provider_onboarding_required/);
assert.match(finance,/connection\.providerKey!=="generic_adapter"/);
assert.match(finance,/body\.confirmReadOnly!==true/);
assert.match(finance,/credentialStorage,20\)!=="external"/);
assert.match(finance,/recordAdapterSyncCompletion/);
assert.match(finance,/json_extract\(payload_json,'\$\.idempotencyKeyHash'\)/);
assert.match(finance,/sourceType==="adapter"/);
assert.doesNotMatch(finance,/CREATE TABLE IF NOT EXISTS finance_connections/);
assert.doesNotMatch(finance,/finance_connection_sync_runs/);
assert.doesNotMatch(finance,/\b(payment|transfer|withdraw|payout)\s*\(/i);
assert.doesNotMatch(finance,/await\s+fetch\s*\(/);

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(worker,/handleFinanceRequest/);
assert.match(worker,/const EXPECTED_SCHEMA_DELTA="046_v80_agentic_outcomes\.sql";/);

console.log("v81 finance connection boundary tests passed: lineage-backed, read-only, no secrets, no schema mutation, provider write-back disabled; V81 authority is the release successor");
