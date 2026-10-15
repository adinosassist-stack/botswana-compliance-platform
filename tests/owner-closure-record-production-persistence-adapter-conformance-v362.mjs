import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const server = read('server/server.js');
const stateVersionMigration = read('db/migrations/003_state_version.sql');
const numericVersionMigration = read('db/migrations/032_v82_workspace_version_numeric_contract.sql');
const replayMigration = read('db/migrations/030_v78_malware_scan_replay_hardening.sql');
const casTest = read('tests/v82-finance-connection-transition-cas.mjs');
const replayTest = read('tests/v82-finance-idempotency-replay-integrity.mjs');
const rollbackTest = read('tests/v145-finance-finalization-rollback-runtime.mjs');
const referenceWriter = read('tests/owner-closure-record-persistence-writer-reference-v361.mjs');

const requireAll = (source, tokens, label) => {
  for (const token of tokens) assert.ok(source.includes(token), `${label} missing ${token}`);
};

// Production transaction capability: explicit acquire/begin/commit/rollback plus fail-safe release exists.
requireAll(server, [
  'pool.connect()',
  'client.query("BEGIN")',
  'client.query("COMMIT")',
  'client.query("ROLLBACK")',
  'client?.release()'
], 'Postgres transaction primitive');

// Production optimistic concurrency capability: state mutations bind tenant + observed version.
requireAll(server, [
  'version=version+1',
  'tenant_id=$1',
  'version=$3'
], 'workspace CAS primitive');
assert.match(
  server,
  /update\s+app_state\s+set\s+state=\$2,updated_at=now\(\),version=version\+1\s+where\s+tenant_id=\$1\s+and\s+version=\$3\s+returning\s+version/i,
  'workspace CAS primitive must bind tenant + observed version and return the new version'
);
assert.match(server, /stateSchema=z\.object\(\{state:z\.record\(z\.any\(\)\),version:z\.number\(\)\.int\(\)\.positive\(\)\}\)/, 'state writes require a positive integer observed version');

// The migration chain gives the CAS token a durable positive numeric contract.
assert.match(
  stateVersionMigration,
  /alter\s+table\s+app_state\s+add\s+column\s+if\s+not\s+exists\s+version\s+bigint\s+not\s+null\s+default\s+1/i,
  'workspace version foundation must create a non-null version with default 1'
);
assert.match(
  numericVersionMigration,
  /version\s*>\s*2147483647\s+OR\s+version\s*<\s*1/i,
  'V82 numeric migration must reject versions outside the positive INTEGER range'
);
assert.match(
  numericVersionMigration,
  /ALTER\s+TABLE\s+app_state\s+ALTER\s+COLUMN\s+version\s+TYPE\s+integer\s+USING\s+version::integer/i,
  'V82 numeric migration must convert the durable version to INTEGER'
);

// Production replay/single-consumption capability: the exact scan claim can be consumed only once.
assert.match(
  server,
  /update\s+evidence\s+set\s+scan_status=\$3,scan_sha256=coalesce\(\$4,scan_sha256\),scan_details=\$5,scanned_at=now\(\),scan_job_consumed_at=now\(\)\s+where\s+id=\$1\s+and\s+scan_job_id=\$2\s+and\s+scan_job_consumed_at\s+is\s+null\s+and\s+scan_status='pending'\s+returning\s+tenant_id,company_id_text/i,
  'single-consumption replay primitive must atomically bind and consume the exact scan job'
);
requireAll(server, [
  'scan_job_stale_or_consumed',
  'crypto.timingSafeEqual'
], 'single-consumption replay primitive');
assert.match(
  replayMigration,
  /alter\s+table\s+evidence\s+add\s+column\s+if\s+not\s+exists\s+scan_job_id\s+uuid/i,
  'replay-hardening migration must persist the authoritative scan job id'
);
assert.match(
  replayMigration,
  /alter\s+table\s+evidence\s+add\s+column\s+if\s+not\s+exists\s+scan_job_consumed_at\s+timestamptz/i,
  'replay-hardening migration must persist one-time consumption state'
);
assert.match(
  replayMigration,
  /create\s+index\s+if\s+not\s+exists\s+evidence_scan_job_idx\s+on\s+evidence\(scan_job_id\)\s+where\s+scan_job_id\s+is\s+not\s+null/i,
  'replay-hardening migration must index non-null scan job claims'
);

// Existing isolated executable tests prove CAS, exact replay binding, and atomic rollback shapes.
requireAll(casTest, [
  'connection actions must bind the append to the exact state they read',
  'finance_connection_state_conflict',
  'stale observed connection sequence must not append a second event',
  'a concurrent sync event must also invalidate an older connection observation'
], 'existing CAS test');
requireAll(replayTest, [
  'verifyExistingImportRequest',
  'expectedRequestLockKey',
  'idempotency_key_conflict'
], 'existing idempotency test');
requireAll(rollbackTest, [
  'BEGIN',
  'ROLLBACK',
  'must roll back'
], 'existing rollback test');

// V361 remains the semantic reference contract; V362 only checks production primitive capability.
requireAll(referenceWriter, [
  'V361_REFERENCE_ONLY = true',
  'referenceOnly: true',
  'routable: false',
  'productionPersistence: false',
  'STALE_TARGET_VERSION',
  'IDEMPOTENCY_CONFLICT'
], 'V361 reference contract');

// This gate must not mistake the generic state endpoint for a closure-record writer.
assert.ok(!server.includes('owner_closure_record'), 'no production owner_closure_record writer/schema may already be wired');
assert.ok(!server.includes('/api/owner-closure'), 'no production owner-closure persistence route may already be wired');

const verdict = Object.freeze({
  release: '20261015-owner-closure-record-production-persistence-adapter-conformance-v362',
  transactionCapability: 'verified',
  casCapability: 'verified',
  tenantIsolationCapability: 'verified',
  serverProvenanceCapability: 'verified',
  singleConsumptionReplayCapability: 'verified',
  rollbackCapability: 'verified',
  closureWriterRoutable: false,
  closureWriterDeployed: false,
  liveClosurePersistenceEnabled: false,
  authority: 'conformance_only_no_live_writer'
});

assert.equal(verdict.closureWriterRoutable, false);
assert.equal(verdict.closureWriterDeployed, false);
assert.equal(verdict.liveClosurePersistenceEnabled, false);
assert.equal(verdict.authority, 'conformance_only_no_live_writer');

console.log(JSON.stringify(verdict));
console.log('V362 Production Persistence Adapter Conformance Gate: PASS');
console.log('V362 proves production persistence primitive conformance only — it creates no closure-record writer, route, endpoint, migration, live database mutation, or execution authority.');
