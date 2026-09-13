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
assert.equal(__financeConnectionTest.containsSecretMaterial({accessToken:"forbidden"}),true);
assert.equal(__financeConnectionTest.containsSecretMaterial({nested:{clientSecret:"forbidden"}}),true);
assert.equal(__financeConnectionTest.containsSecretMaterial({credentialStorage:"external",confirmReadOnly:true}),false);
assert.deepEqual(__financeConnectionTest.connectionActionPath("/api/finance/connections/c1/pause"),{connectionId:"c1",action:"pause"});
assert.deepEqual(__financeConnectionTest.connectionSyncRunsPath("/api/finance/connections/c1/sync-runs"),{connectionId:"c1"});

const migration=fs.readFileSync("cloudflare/migrations/047_v81_finance_connections.sql","utf8");
for(const table of ["finance_connections","finance_connection_sync_runs"])assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
assert.match(migration,/read_only INTEGER NOT NULL DEFAULT 1 CHECK\(read_only=1\)/);
assert.match(migration,/credential_storage TEXT NOT NULL DEFAULT 'external' CHECK\(credential_storage='external'\)/);
assert.match(migration,/secret_material_stored INTEGER NOT NULL DEFAULT 0 CHECK\(secret_material_stored=0\)/);
assert.doesNotMatch(migration,/access_token|refresh_token|client_secret|password|api_key/i);
assert.match(migration,/FOREIGN KEY\(finance_account_id\) REFERENCES finance_accounts\(id\) ON DELETE RESTRICT/);
assert.match(migration,/UNIQUE\(tenant_id,idempotency_key\)/);

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/finance_connection_secret_material_forbidden/);
assert.match(finance,/finance_connection_id_required/);
assert.match(finance,/finance_connection_not_active/);
assert.match(finance,/finance_connection_account_mismatch/);
assert.match(finance,/finance_connection_provider_mismatch/);
assert.match(finance,/provider_onboarding_required/);
assert.match(finance,/connection\.provider_key!=="generic_adapter"/);
assert.match(finance,/body\.confirmReadOnly!==true/);
assert.match(finance,/credentialStorage,20\)!=="external"/);
assert.match(finance,/recordAdapterSyncCompletion/);
assert.match(finance,/sourceType==="adapter"/);
assert.doesNotMatch(finance,/\b(payment|transfer|withdraw|payout)\s*\(/i);
assert.doesNotMatch(finance,/await\s+fetch\s*\(/);

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(worker,/handleFinanceRequest/);

console.log("v81 finance connection boundary tests passed: read-only, no secrets, provider write-back disabled");
