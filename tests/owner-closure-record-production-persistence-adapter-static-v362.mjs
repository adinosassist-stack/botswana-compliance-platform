import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'ea792a27e20f9fcf9f505a382feefc6167a75f1c';
const EXPECTED = [
  '.github/workflows/v362-production-persistence-adapter-conformance-boundary.yml',
  'tests/owner-closure-record-production-persistence-adapter-conformance-v362.mjs',
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V362 must change only its two tests and exact-head workflow');

for (const path of changed) {
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
for (const pattern of forbidden) assert.ok(!pattern.test(combined), `V362 must remain capability-only/non-routable: ${pattern}`);

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
