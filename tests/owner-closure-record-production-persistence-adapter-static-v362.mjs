import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'ea792a27e20f9fcf9f505a382feefc6167a75f1c';
const QUALIFIED_HEAD = 'c4d435793e6aa8f2f9dd0c8e6baa57401c37752b';
const EXPECTED = [
  '.github/workflows/v362-production-persistence-adapter-conformance-boundary.yml',
  'tests/owner-closure-record-production-persistence-adapter-conformance-v362.mjs',
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs'
].sort();
const ALLOWED_SCHEMA_DESCENDANT = new Set([
  'db/migrations/033_v365_owner_closure_records.sql'
]);

const filesBetween = (base, head) => execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();

// Preserve the exact frozen V362 qualification proof even when this boundary runs from a stacked descendant.
const qualifiedChanged = filesBetween(BASE, QUALIFIED_HEAD);
assert.deepEqual(qualifiedChanged, EXPECTED, 'frozen V362 head must change only its two tests and exact-head workflow');

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== QUALIFIED_HEAD) {
  execFileSync('git', ['merge-base', '--is-ancestor', QUALIFIED_HEAD, head]);
  const descendantChanged = filesBetween(QUALIFIED_HEAD, head);
  assert.ok(descendantChanged.length > 0, 'stacked V362 descendant must contain an explicit descendant delta');
  for (const path of descendantChanged) {
    const safe = path.startsWith('tests/') || path.startsWith('.github/workflows/') || ALLOWED_SCHEMA_DESCENDANT.has(path);
    assert.ok(safe, `stacked descendant changed unauthorized runtime/production path: ${path}`);
  }
}

for (const path of qualifiedChanged) {
  assert.ok(path.startsWith('tests/') || path.startsWith('.github/workflows/'), `runtime/production path changed: ${path}`);
}

const conformance = fs.readFileSync('tests/owner-closure-record-production-persistence-adapter-conformance-v362.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/v362-production-persistence-adapter-conformance-boundary.yml', 'utf8');
const combined = `${conformance}\n${workflow}`;

const forbidden = [
  /\bapp\.(?:post|put|patch|delete)\s*\(/i,
  /\brouter\.(?:post|put|patch|delete)\s*\(/i,
  /express\s*\(/i,
  /listen\s*\(/i,
  /new\s+Pool\s*\(/,
  /new\s+Client\s*\(/,
  /DATABASE_URL/,
  /process\.env/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /wrangler/i,
  /owner_closure_record\s*\(/i,
  /CREATE\s+TABLE\s+owner_closure/i,
  /ALTER\s+TABLE\s+owner_closure/i
];
for (const pattern of forbidden) assert.ok(!pattern.test(combined), `V362 frozen capability proof must remain non-routable: ${pattern}`);

for (const token of [
  'closureWriterRoutable: false',
  'closureWriterDeployed: false',
  'liveClosurePersistenceEnabled: false',
  "authority: 'conformance_only_no_live_writer'",
  'creates no closure-record writer, route, endpoint, migration, live database mutation, or execution authority'
]) assert.ok(conformance.includes(token), `missing V362 authority boundary: ${token}`);

assert.ok(workflow.includes('Checkout exact PR head'), 'V362 workflow must checkout exact PR head');
assert.ok(workflow.includes('Verify exact checkout'), 'V362 workflow must verify exact PR head');
assert.ok(workflow.includes('node-version-file: ".nvmrc"') || workflow.includes("node-version-file: '.nvmrc'"), 'V362 workflow must use pinned Node');
assert.ok(workflow.includes('owner-closure-record-production-persistence-adapter-conformance-v362.mjs'), 'V362 workflow must run capability conformance');
assert.ok(workflow.includes('owner-closure-record-production-persistence-adapter-static-v362.mjs'), 'V362 workflow must run static boundary');

console.log('V362 Production Persistence Adapter static boundary: PASS');
