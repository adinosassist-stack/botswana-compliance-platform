import assert from "node:assert/strict";
import fs from "node:fs";
import {__financeTest} from "../cloudflare/src/finance-core.js";

const rows=[
  {postedOn:"2026-09-14",description:"Supplier payment",reference:"INV-100",amountMinor:-12500,sourceId:""},
  {postedOn:"2026-09-13",description:"Customer receipt",reference:"RCPT-44",amountMinor:25000,sourceId:""}
];
const base={tenantId:"t1",accountId:"a1",sourceType:"csv",provider:null,rows};
const reordered={...base,rows:[rows[1],rows[0]]};
assert.deepEqual(__financeTest.importContentFingerprintBasis(base),__financeTest.importContentFingerprintBasis(reordered),"exact statement content must be order-independent");
assert.notDeepEqual(__financeTest.importContentFingerprintBasis(base),__financeTest.importContentFingerprintBasis({...base,rows:[...rows,rows[0]]}),"duplicate multiplicity must remain part of statement identity");
assert.notDeepEqual(__financeTest.importContentFingerprintBasis(base),__financeTest.importContentFingerprintBasis({...base,accountId:"a2"}),"account scope must remain part of content identity");
assert.deepEqual(__financeTest.importContentFingerprintBasis(base),__financeTest.importContentFingerprintBasis({...base,sourceType:"manual"}),"csv/manual provenance labels must not bypass user-import content identity");
assert.deepEqual(__financeTest.importContentFingerprintBasis(base),__financeTest.importContentFingerprintBasis({...base,provider:"caller-controlled-label"}),"provider labels must not bypass manual/csv content identity");
assert.deepEqual(__financeTest.importContentFingerprintBasis({...base,rows:[{...rows[0],sourceId:"source-1"}]}),__financeTest.importContentFingerprintBasis({...base,rows:[{...rows[0],sourceId:"source-2"}]}),"client supplied source ids must not bypass manual/csv content identity");
assert.equal(__financeTest.IMPORT_CONTENT_LOCK_PREFIX,"__thebe_finance_content_v1:");
assert.equal(__financeTest.MAX_LEGACY_CONTENT_CANDIDATES,100);

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/reservedImportIdempotencyKey\(idempotencyKey\)/,"reserved internal finance idempotency namespaces must be blocked from callers");
assert.match(finance,/allowDuplicateContent===true/,"duplicate override must be explicit");
assert.match(finance,/roleAllowed\(auth,"owner"\)/,"duplicate override must be owner-only");
assert.match(finance,/duplicate_override_reason_required/,"duplicate override must require an audit reason");
assert.match(finance,/findDuplicateImportContent/,"legacy and registered content detection must run before insertion");
assert.match(finance,/b\.source_type IN \('manual','csv'\)/,"legacy duplicate detection must span both user-import source labels");
assert.doesNotMatch(finance,/if\(\(rows\|\|\[\]\)\.some\(row=>text\(row\?\.sourceId,160\)\)\)return null/,"client supplied source ids must not disable legacy duplicate detection");
assert.match(finance,/finance-content-lock:/,"content reservations must be distinguishable from customer import batches");
assert.match(finance,/status,row_count,imported_count,duplicate_count,created_by_user_id\) VALUES\(\?,\?,\?,\?,\?,\?,'failed'/,"content reservation must remain excluded from completed-import summaries");
assert.match(finance,/duplicate_import_content/,"cross-key duplicate content must fail closed");
assert.match(finance,/finance_import_content_review_required/,"oversized legacy ambiguity must fail closed");
assert.match(finance,/contentFingerprint/,"content identity must be retained in lineage\/audit metadata");
assert.match(finance,/duplicateContentOverride/,"explicit owner override must be auditable");

const recovery=fs.readFileSync(".github/workflows/recovery-ci.yml","utf8");
assert.match(recovery,/node tests\/v82-finance-idempotency-replay-integrity\.mjs\s+node tests\/v82-finance-cross-idempotency-content-dedupe\.mjs/,"cross-key content regression must run immediately after exact-key finance integrity");
console.log("V82 finance cross-idempotency content dedupe PASS");
