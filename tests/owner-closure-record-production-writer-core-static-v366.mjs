import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = '4e26d7062592b311433fdc94209a2ebe4eaef569';
const EXPECTED = [
  '.github/workflows/v366-owner-closure-record-production-writer-core-boundary.yml',
  'server/owner-closure-record-writer-v366.js',
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs',
  'tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-static-v364.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-v364.mjs',
  'tests/owner-closure-record-production-writer-core-static-v366.mjs',
  'tests/owner-closure-record-production-writer-core-v366.mjs',
  'tests/owner-closure-record-schema-foundation-v365.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V366 must remain the exact non-routable writer-core delta plus narrowly scoped ancestor guards');

const writerPath = 'server/owner-closure-record-writer-v366.js';
const writer = fs.readFileSync(writerPath, 'utf8');
const runtime = fs.readFileSync('tests/owner-closure-record-production-writer-core-v366.mjs', 'utf8');
const server = fs.readFileSync('server/server.js', 'utf8');
const worker = fs.readFileSync('cloudflare/src/worker.js', 'utf8');
const migration = fs.readFileSync('db/migrations/033_v365_owner_closure_records.sql', 'utf8');

for (const token of [
  'createOwnerClosureRecordWriter',
  'fingerprintOwnerClosureRequest',
  'canonicalizeOwnerClosureValue',
  "'BEGIN'",
  "'COMMIT'",
  "'ROLLBACK'",
  'pg_advisory_xact_lock',
  'hashtextextended',
  'verifyAuthorization',
  'loadTarget',
  'AUTHORIZATION_BINDING_MISMATCH',
  'AUTHORIZATION_STALE_OR_REVOKED',
  'IDEMPOTENCY_CONFLICT',
  'STALE_TARGET_VERSION',
  'TENANT_SCOPE_MISMATCH',
  'WORKSPACE_SCOPE_MISMATCH',
  'DUPLICATE_TARGET_CONFLICT',
  'PERSISTENCE_TRANSACTION_ABORTED',
  'SAVEPOINT owner_closure_insert',
  'ROLLBACK TO SAVEPOINT owner_closure_insert',
  'insert into owner_closure_records',
  'insert into audit_events',
  "'OWNER_CLOSURE_RECORD_PERSISTED'",
  "productionPersistenceCore: true",
  'routable: false',
  'routeAdded: false',
  'uiTriggerAdded: false',
  'workerWritePathAdded: false',
  'deploymentActivated: false',
  'liveProductionPersistenceEnabled: false',
  "authority: 'non_routable_writer_core_only'",
  "auditAtomicity: 'closure_record_and_audit_event_same_transaction_or_fail'",
  "rollbackSemantics: 'zero_partial_effects_on_any_failure'",
  "successSemantics: 'durable_success_only_after_commit'"
]) assert.ok(writer.includes(token), `V366 writer contract missing ${token}`);

const forbiddenWriter = [
  /from ['"]express['"]/i,
  /\bexpress\s*\(/i,
  /\bapp\.(?:post|put|patch|delete)\s*\(/i,
  /\brouter\.(?:post|put|patch|delete)\s*\(/i,
  /\blisten\s*\(/i,
  /new\s+Pool\s*\(/,
  /DATABASE_URL/,
  /process\.env/,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /wrangler/i,
  /\/api\/owner-closure/i
];
for (const pattern of forbiddenWriter) assert.ok(!pattern.test(writer), `V366 writer must remain dependency-injected/non-routable: ${pattern}`);

assert.ok(migration.includes('owner_closure_records_idempotency_unique'), 'V366 must inherit database idempotency uniqueness from V365');
assert.ok(migration.includes('before update on owner_closure_records'), 'V366 must inherit append-only update rejection from V365');
assert.ok(!server.includes('owner-closure-record-writer-v366'), 'Node entry point must not import/register V366 writer');
assert.ok(!server.includes('/api/owner-closure'), 'Node entry point must not expose owner-closure route');
assert.ok(!worker.includes('owner-closure-record-writer-v366'), 'Worker must not import V366 writer');
assert.ok(!worker.includes('/api/owner-closure'), 'Worker must not expose owner-closure route');

// Prove invocation order inside the actual write() body rather than matching helper declarations elsewhere.
const writeStart = writer.indexOf('async write({ request, serverContext } = {}) {');
const writeEnd = writer.indexOf('\n    }\n  });', writeStart);
assert.ok(writeStart >= 0 && writeEnd > writeStart, 'V366 write() body must be discoverable for order proof');
const writeBody = writer.slice(writeStart, writeEnd);
const verifyIndex = writeBody.indexOf('const authorization = await verifyAuthorization');
const replayIndex = writeBody.indexOf('classifyReplay(await findReplay(client, scope, normalized.idempotencyKey), fingerprint)');
const targetIndex = writeBody.indexOf('const currentTarget = await loadTarget');
const insertIndex = writeBody.indexOf('record = await insertClosureRecord');
const auditIndex = writeBody.indexOf('await insertAuditEvent');
const commitAfterAuditIndex = writeBody.indexOf("await client.query('COMMIT')", auditIndex);
for (const [label, index] of Object.entries({ verifyIndex, replayIndex, targetIndex, insertIndex, auditIndex, commitAfterAuditIndex })) {
  assert.ok(index >= 0, `V366 write() order proof must locate ${label}`);
}
assert.ok(verifyIndex < replayIndex, 'write-time authorization must precede replay classification');
assert.ok(replayIndex < targetIndex, 'idempotency replay classification must precede target CAS for deterministic retry');
assert.ok(targetIndex < insertIndex, 'authoritative target reread/CAS must precede persistence');
assert.ok(insertIndex < auditIndex, 'closure insert must precede same-transaction audit insert');
assert.ok(auditIndex < commitAfterAuditIndex, 'audit insert must precede durable commit');

for (const token of [
  'caller fingerprint must be ignored',
  'same idempotency key with changed material semantics',
  'STALE_TARGET_VERSION',
  'AUTHORIZATION_BINDING_MISMATCH',
  'AUTHORIZATION_STALE_OR_REVOKED',
  'TENANT_SCOPE_MISMATCH',
  'WORKSPACE_SCOPE_MISMATCH',
  'PERSISTENCE_TRANSACTION_ABORTED',
  'exactly one concurrent target closure may commit',
  "'DUPLICATE_TARGET_CONFLICT'",
  '{ closure: 0, audit: 0 }',
  '{ closure: 1, audit: 1 }'
]) assert.ok(runtime.includes(token), `V366 adversarial runtime proof missing ${token}`);

console.log('V366 Non-Routable Production Closure Writer Core static boundary: PASS');
console.log('V366 exposes no route, UI trigger, Worker write path, deployment activation, or live production persistence authority.');
