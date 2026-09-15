import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {__financeTest} from "../cloudflare/src/finance-core.js";

const row={postedOn:"2026-09-15",description:"Provider receipt",reference:"REF-1",amountMinor:12500,sourceId:"provider-42"};
assert.deepEqual(__financeTest.ledgerRowBasis(row),["2026-09-15",12500,"REF-1","Provider receipt"]);
assert.equal(__financeTest.sameLedgerRow(row,{...row}),true);
assert.equal(__financeTest.sameLedgerRow(row,{...row,amountMinor:12501}),false);
assert.equal(__financeTest.sameLedgerRow(row,{...row,postedOn:"2026-09-14"}),false);
assert.equal(__financeTest.sameLedgerRow(row,{...row,description:"Changed receipt"}),false);
assert.equal(__financeTest.sameLedgerRow(row,{...row,reference:"REF-2"}),false);

const requestBase={tenantId:"t1",accountId:"a1",sourceType:"adapter",provider:"generic_adapter",connectionId:"c1",rows:[row,{postedOn:"2026-09-14",description:"Fee",reference:"FEE-1",amountMinor:-500,sourceId:"provider-43"}]};
assert.deepEqual(__financeTest.importRequestFingerprintBasis(requestBase),__financeTest.importRequestFingerprintBasis({...requestBase,rows:[requestBase.rows[1],requestBase.rows[0]]}),"request identity should tolerate provider row reordering");
for(const changed of [
  {...row,amountMinor:12501},
  {...row,postedOn:"2026-09-14"},
  {...row,description:"Changed receipt"},
  {...row,reference:"REF-2"},
  {...row,sourceId:"provider-99"}
]) assert.notDeepEqual(__financeTest.importRequestFingerprintBasis(requestBase),__financeTest.importRequestFingerprintBasis({...requestBase,rows:[changed,requestBase.rows[1]]}),"full normalized request binding must detect adapter payload drift");

const fingerprints=["fp-42","fp-43"];
assert.equal(__financeTest.adapterBatchSourceIdentityConflict(requestBase.rows,fingerprints),null);
assert.equal(__financeTest.adapterBatchSourceIdentityConflict([row,{...row}], ["fp-42","fp-42"]),null,"identical repeated provider identity is a normal duplicate");
const within=__financeTest.adapterBatchSourceIdentityConflict([row,{...row,amountMinor:999}], ["fp-42","fp-42"]);
assert.equal(within?.fingerprint,"fp-42");
assert.equal(within?.sourceId,"provider-42");

assert.equal(__financeTest.IMPORT_REQUEST_LOCK_PREFIX,"__thebe_finance_request_v1:");
assert.equal(__financeTest.reservedImportIdempotencyKey("__thebe_finance_request_v1:abc"),true);
assert.equal(__financeTest.reservedImportIdempotencyKey("__thebe_finance_content_v1:abc"),true);
assert.equal(__financeTest.reservedImportIdempotencyKey("customer-key"),false);

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/finance_source_identity_conflict/,"changed data behind an immutable adapter source ID must fail closed");
assert.match(finance,/FINANCE_SOURCE_IDENTITY_CONFLICT/,"source identity conflicts must be audited");
assert.match(finance,/JOIN json_each\(\?\) wanted ON wanted\.value=t\.source_fingerprint/,"existing source identities must be checked in one bounded lookup");
assert.match(finance,/ON CONFLICT\(tenant_id,account_id,source_fingerprint\) DO UPDATE SET/,"adapter source identity race must be enforced inside the atomic transaction write");
assert.match(finance,/ELSE NULL END/,"conflicting adapter identity must abort the transaction write instead of being silently ignored");
assert.match(finance,/importRequestLockId\(batchId\)/,"new batches must atomically persist a request binding sentinel");
assert.match(finance,/expectedRequestLockKey/,"replay verification must bind to the stored full-request sentinel");
assert.match(finance,/Number\(existing\?\.imported_count\)!==expectedRowCount/,"legacy replay with suppressed rows must fail closed when no request binding exists");
assert.match(finance,/source_fingerprint,posted_on,description,reference,amount_minor/,"legacy replay fallback must compare full stored ledger fields");
assert.match(finance,/reservedImportIdempotencyKey\(idempotencyKey\)/,"all internal finance idempotency namespaces must be reserved");

const sqlMatch=finance.match(/sourceType==="adapter"\s*\? env\.DB\.prepare\(`([\s\S]*?ON CONFLICT\(tenant_id,account_id,source_fingerprint\) DO UPDATE SET[\s\S]*?ELSE NULL END)`\)\.bind\(packedJson\)/);
assert.ok(sqlMatch,"adapter transaction UPSERT SQL must remain directly testable");
const db=new DatabaseSync(":memory:");
db.exec(`CREATE TABLE finance_transactions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, import_batch_id TEXT NOT NULL,
  posted_on TEXT NOT NULL, description TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', amount_minor INTEGER NOT NULL CHECK(amount_minor<>0),
  currency TEXT NOT NULL, source_type TEXT NOT NULL, source_fingerprint TEXT NOT NULL,
  UNIQUE(tenant_id,account_id,source_fingerprint)
)`);
const upsert=db.prepare(sqlMatch[1]);
const packed=(id,batchId,amountMinor=12500)=>JSON.stringify([{id,tenantId:"t1",accountId:"a1",batchId,postedOn:"2026-09-15",description:"Provider receipt",reference:"REF-1",amountMinor,sourceType:"adapter",fingerprint:"fp-42"}]);
upsert.run(packed("tx-1","batch-1"));
assert.equal(db.prepare("SELECT COUNT(*) count FROM finance_transactions").get().count,1);
upsert.run(packed("tx-2","batch-2"));
assert.equal(db.prepare("SELECT COUNT(*) count FROM finance_transactions").get().count,1,"identical provider replay must remain one canonical transaction");
assert.throws(()=>upsert.run(packed("tx-3","batch-3",12501)),/NOT NULL|constraint/i,"changed amount behind the same source identity must abort atomically");
assert.equal(db.prepare("SELECT amount_minor FROM finance_transactions WHERE source_fingerprint='fp-42'").get().amount_minor,12500,"conflicting provider data must never overwrite the canonical row");
db.close();

const recovery=fs.readFileSync(".github/workflows/recovery-ci.yml","utf8");
assert.match(recovery,/node tests\/v82-finance-cross-idempotency-content-dedupe\.mjs\s+node tests\/v82-finance-adapter-source-identity-integrity\.mjs/,"adapter source identity regression must run immediately after cross-key content integrity");
console.log("V82 finance adapter source identity integrity PASS");
