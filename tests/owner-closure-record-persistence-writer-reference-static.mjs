import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('./owner-closure-record-persistence-writer-reference-v361.mjs', import.meta.url), 'utf8');
const lower = source.toLowerCase();

const must = [
  'V361_REFERENCE_ONLY = true',
  'referenceOnly: true',
  'routable: false',
  'deployed: false',
  'productionPersistence: false',
  'networkAccess: false',
  'environmentAccess: false',
  'productionDatabaseAccess: false',
  'AUTHORIZATION_BINDING_MISMATCH',
  'AUTHORIZATION_SCOPE_MISMATCH',
  'AUTHORIZATION_ACTOR_MISMATCH',
  'STALE_TARGET_VERSION',
  'DUPLICATE_TARGET_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INJECTED_TRANSACTION_FAILURE',
  'INJECTED_PERSISTENCE_FAILURE',
  "status: 'already_committed'",
  "status: 'committed'",
  'serverContext.actorId',
  'serverContext.requestId',
  'serverContext.now',
  "failpoint === 'after_idempotency_check'",
  "failpoint === 'after_stage_before_commit'"
];
for (const token of must) assert.ok(source.includes(token), `missing ${token}`);

for (const field of ['disposition','wording','namespace','kind','sourceKey','authorizationReference','idempotencyKey','expectedVersion','residualCarryover']) {
  assert.ok(source.includes(`'${field}'`), `binding field ${field} must be exact-bound`);
}

const forbidden = [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /process\.env/,
  /import\s+.*(?:express|fastify|koa|hono|postgres|pg|sqlite|d1|cloudflare)/i,
  /require\s*\(\s*["'](?:express|fastify|koa|hono|postgres|pg|sqlite)/i,
  /\bapp\.(?:post|put|patch|delete)\s*\(/i,
  /\brouter\.(?:post|put|patch|delete)\s*\(/i,
  /listen\s*\(/,
  /wrangler/i,
  /cloudflare/i,
  /DATABASE_URL/,
  /DB_URL/,
  /apiJson\s*\(/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/
];
for (const pattern of forbidden) assert.ok(!pattern.test(source), `reference module must remain non-routable/non-production: ${pattern}`);

assert.ok(lower.includes('structuredclone'), 'reference store must isolate state copies');
assert.ok(lower.includes('await previous'), 'reference transactions must serialize for race testing');
assert.ok(lower.includes('state = draft'), 'reference transaction must commit only after work returns');
assert.ok(!source.includes('public/js/'), 'reference module must not bind itself into browser runtime');

console.log('V361 Owner Closure Record Persistence Writer Reference static boundary: PASS');
