import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'aa2c20a533cbfcac390da101aa36b34ca76e5858';
const EXPECTED = [
  '.github/workflows/v367-owner-closure-record-server-integration-boundary.yml',
  'server/owner-closure-record-server-integration-v367.js',
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs',
  'tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-static-v364.mjs',
  'tests/owner-closure-record-production-writer-core-static-v366.mjs',
  'tests/owner-closure-record-schema-foundation-v365.mjs',
  'tests/owner-closure-record-server-integration-static-v367.mjs',
  'tests/owner-closure-record-server-integration-v367.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V367 must remain the exact disabled server-integration delta plus narrowly scoped ancestor guards');

const integration = fs.readFileSync('server/owner-closure-record-server-integration-v367.js', 'utf8');
const runtime = fs.readFileSync('tests/owner-closure-record-server-integration-v367.mjs', 'utf8');
const server = fs.readFileSync('server/server.js', 'utf8');
const worker = fs.readFileSync('cloudflare/src/worker.js', 'utf8');

for (const token of [
  "import { z } from 'zod'",
  "OwnerClosureWriterError",
  'createOwnerClosureServerIntegration',
  "enabled = false",
  ".strict()",
  "namespace: z.literal('operations')",
  "kind: z.literal('owner_decision_note')",
  "z.enum(['Close', 'Keep open', 'Hold'])",
  "req?.auth?.tenant_id",
  "req?.auth?.user_id",
  "req?.auth?.role !== 'owner'",
  'resolveWorkspace',
  "workspaceResolution: 'trusted_server_resolver_not_client_body'",
  "featureGate: 'constructor_enabled_true_required_default_false'",
  "intendedPath: '/api/owner-closure-records'",
  "requiredUpstreamMiddleware: Object.freeze(['auth', 'roles(owner)', 'requireEntitlement'])",
  "originAndCsrfProtection: 'existing_auth_middleware_required_on_registration'",
  'routeRegistered: false',
  'serverEntryPointModified: false',
  'uiTriggerAdded: false',
  'workerWritePathAdded: false',
  'deploymentActivated: false',
  'liveProductionPersistenceEnabled: false',
  "authority: 'disabled_unregistered_server_integration_only'"
]) assert.ok(integration.includes(token), `V367 integration contract missing ${token}`);

for (const token of [
  'client scope/provenance injection must fail',
  "{ error: 'not_found' }",
  "{ error: 'server_request_context_missing' }",
  "workspace_resolution_failed",
  "authorization_binding_mismatch",
  "authorization_not_current",
  "idempotency_conflict",
  "stale_target_version",
  "scope_mismatch",
  "duplicate_target_conflict",
  "persistence_unavailable",
  "response must not echo authorization token",
  "response must not echo idempotency key",
  "response must not expose server fingerprint",
  "status: 'already_committed'"
]) assert.ok(runtime.includes(token), `V367 runtime proof missing ${token}`);

const forbiddenIntegration = [
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
  /wrangler/i
];
for (const pattern of forbiddenIntegration) assert.ok(!pattern.test(integration), `V367 adapter must remain dependency-injected/unregistered: ${pattern}`);

assert.ok(!server.includes('owner-closure-record-server-integration-v367'), 'Node entry point must not import/register V367 integration adapter');
assert.ok(!server.includes('/api/owner-closure-records'), 'Node entry point must not expose V367 route');
assert.ok(!worker.includes('owner-closure-record-server-integration-v367'), 'Worker must not import V367 integration adapter');
assert.ok(!worker.includes('/api/owner-closure-records'), 'Worker must not expose V367 route');

console.log('V367 Controlled Server Integration / Route Readiness static boundary: PASS');
console.log('V367 remains disabled and unregistered — no live route, UI trigger, Worker write path, deployment activation, or live production persistence authority.');
