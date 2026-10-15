import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const BASE = '5aefd271b40563df098bcc9451de2461a124363c';
const MIGRATION = 'db/migrations/033_v365_owner_closure_records.sql';
const EXPECTED = [
  '.github/workflows/v365-owner-closure-record-schema-foundation-boundary.yml',
  MIGRATION,
  'tests/owner-closure-record-production-persistence-adapter-static-v362.mjs',
  'tests/owner-closure-record-production-writer-adapter-design-static-v363.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-static-v364.mjs',
  'tests/owner-closure-record-production-writer-adapter-implementation-readiness-v364.mjs',
  'tests/owner-closure-record-schema-foundation-v365.mjs'
].sort();

const changed = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, EXPECTED, 'V365 must change only migration 033, its runtime proof/workflow, and the exact V362/V363/V364 descendant guards required for this approved schema layer');

const migration = fs.readFileSync(MIGRATION, 'utf8');
const server = fs.readFileSync('server/server.js', 'utf8');
const worker = fs.readFileSync('cloudflare/src/worker.js', 'utf8');

for (const token of [
  'create table if not exists owner_closure_records',
  'tenant_id uuid not null references tenants(id) on delete cascade',
  'workspace_id text not null',
  'actor_user_id uuid not null',
  'namespace text not null',
  'kind text not null',
  'source_key text not null',
  'disposition text not null',
  'wording text not null',
  "residual_carryover jsonb not null default '[]'::jsonb",
  'expected_target_version integer not null',
  'authorization_token_id text not null',
  'idempotency_key text not null',
  'request_fingerprint text not null',
  'record_version integer not null default 1',
  'owner_closure_records_idempotency_unique unique(tenant_id,workspace_id,idempotency_key)',
  "request_fingerprint ~ '^[0-9a-f]{64}$'",
  "jsonb_typeof(residual_carryover) = 'array'",
  'create or replace function reject_owner_closure_record_update()',
  'before update on owner_closure_records',
  "raise exception 'owner_closure_records_are_append_only' using errcode = '55000'"
]) assert.ok(migration.includes(token), `missing V365 migration contract: ${token}`);

assert.ok(!server.includes('owner_closure_records'), 'V365 must not add a Node closure-record writer');
assert.ok(!server.includes('/api/owner-closure'), 'V365 must not add a Node owner-closure route');
assert.ok(!worker.includes('owner_closure_records'), 'V365 must not add a Worker closure-record writer');
assert.ok(!worker.includes('/api/owner-closure'), 'V365 must not add a Worker owner-closure route');

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for the V365 runtime proof');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const expectPgError = async (fn, code, label) => {
  let caught = null;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught, `${label} must fail`);
  assert.equal(caught.code, code, `${label} must fail with PostgreSQL code ${code}`);
};

const tenantId = randomUUID();
const actorUserId = randomUUID();
const baseRecord = {
  tenantId,
  workspaceId: 'workspace-v365-a',
  actorUserId,
  namespace: 'operations',
  kind: 'owner_decision_note',
  sourceKey: 'decision-v365',
  disposition: 'Close',
  wording: 'Owner confirmed the exact closure record wording.',
  residualCarryover: JSON.stringify(['retain verified safeguard note']),
  expectedTargetVersion: 7,
  authorizationTokenId: 'authorization-v365',
  idempotencyKey: 'idem-v365',
  requestFingerprint: 'a'.repeat(64)
};

const insertRecord = (record) => pool.query(
  `insert into owner_closure_records(
    tenant_id,workspace_id,actor_user_id,namespace,kind,source_key,disposition,wording,
    residual_carryover,expected_target_version,authorization_token_id,idempotency_key,request_fingerprint
  ) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
  returning id,record_version,recorded_at`,
  [
    record.tenantId, record.workspaceId, record.actorUserId, record.namespace, record.kind,
    record.sourceKey, record.disposition, record.wording, record.residualCarryover,
    record.expectedTargetVersion, record.authorizationTokenId, record.idempotencyKey,
    record.requestFingerprint
  ]
);

try {
  const migrationRow = await pool.query('select 1 from schema_migrations where version=$1', ['033_v365_owner_closure_records.sql']);
  assert.equal(migrationRow.rowCount, 1, 'V365 migration must be applied by the normal migration runner');

  const tableRow = await pool.query("select 1 from information_schema.tables where table_schema='public' and table_name='owner_closure_records'");
  assert.equal(tableRow.rowCount, 1, 'owner_closure_records table must exist');

  const columns = await pool.query("select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name='owner_closure_records'");
  const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
  for (const column of ['tenant_id','workspace_id','actor_user_id','namespace','kind','source_key','disposition','wording','residual_carryover','expected_target_version','authorization_token_id','idempotency_key','request_fingerprint','record_version','recorded_at']) {
    assert.equal(byName.get(column)?.is_nullable, 'NO', `${column} must be NOT NULL`);
  }
  assert.ok(!byName.has('updated_at'), 'append-only closure records must not expose an updated_at mutation surface');

  const uniqueConstraint = await pool.query(
    `select 1 from pg_constraint c
      join pg_class t on t.oid=c.conrelid
      where t.relname='owner_closure_records'
        and c.contype='u'
        and pg_get_constraintdef(c.oid) ilike '%tenant_id, workspace_id, idempotency_key%'`
  );
  assert.equal(uniqueConstraint.rowCount, 1, 'database must enforce tenant/workspace-scoped idempotency uniqueness');

  await pool.query('insert into tenants(id,name) values($1,$2)', [tenantId, 'V365 Schema Runtime']);
  const inserted = await insertRecord(baseRecord);
  assert.equal(inserted.rows[0].record_version, 1, 'closure records start at immutable record version 1');

  await expectPgError(() => insertRecord(baseRecord), '23505', 'same tenant/workspace idempotency replay');

  const otherWorkspace = await insertRecord({ ...baseRecord, workspaceId: 'workspace-v365-b' });
  assert.equal(otherWorkspace.rowCount, 1, 'same idempotency key may be scoped independently to another workspace');

  await expectPgError(
    () => insertRecord({ ...baseRecord, workspaceId: 'workspace-v365-c', idempotencyKey: 'idem-invalid-fingerprint', requestFingerprint: 'not-a-sha256' }),
    '23514',
    'invalid request fingerprint'
  );

  await expectPgError(
    () => insertRecord({ ...baseRecord, workspaceId: 'workspace-v365-d', idempotencyKey: 'idem-invalid-residual', residualCarryover: JSON.stringify({ bad: true }) }),
    '23514',
    'non-array residual carryover'
  );

  await expectPgError(
    () => pool.query('update owner_closure_records set wording=$1 where id=$2', ['mutated wording', inserted.rows[0].id]),
    '55000',
    'in-place closure-record update'
  );

  await pool.query('delete from tenants where id=$1', [tenantId]);
  const afterTenantDelete = await pool.query('select count(*)::int as count from owner_closure_records where tenant_id=$1', [tenantId]);
  assert.equal(afterTenantDelete.rows[0].count, 0, 'tenant lifecycle cascade must remain compatible with closure records');
} finally {
  await pool.query('delete from owner_closure_records where tenant_id=$1', [tenantId]).catch(() => {});
  await pool.query('delete from tenants where id=$1', [tenantId]).catch(() => {});
  await pool.end();
}

console.log('V365 Owner Closure Record Schema Foundation: PASS');
console.log('V365 adds schema/constraints only — no writer, route, UI trigger, live closure persistence, decision closure, or execution authority.');
