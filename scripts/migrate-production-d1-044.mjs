import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const databaseId = String(process.env.D1_DATABASE_ID || '').trim();
const migrationPath = 'cloudflare/migrations/044_v79_finance_reconciliation.sql';
const expectedGitBlobSha = 'ce23a0c8b8b653c82f9fff4a537fe1fbc0a0f32b';
const targetTables = [
  'finance_accounts','finance_import_batches','finance_transactions','finance_reconciliation_runs','finance_lineage'
];
const targetIndexes = [
  'finance_accounts_tenant_idx','finance_transactions_period_idx','finance_reconciliation_tenant_idx','finance_lineage_entity_idx'
];

function fail(message) {
  throw new Error(`Production D1 migration 044 refused: ${message}`);
}

if (!token) fail('CLOUDFLARE_API_TOKEN is empty');
if (!/^[0-9a-fA-F]{32}$/.test(accountId)) fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) fail('D1_DATABASE_ID is invalid');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

function safe(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
}

async function cf(path, options = {}) {
  const response = await fetch(`${API}${path}`, {...options, headers: {...headers, ...(options.headers || {})}});
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors) ? body.errors.map(e => `${e?.code ?? 'unknown'}:${e?.message ?? 'unknown'}`).join(' | ') : safe(text);
    throw new Error(`Cloudflare API ${path} failed HTTP ${response.status}: ${errors}`);
  }
  return body;
}

async function query(sql, params = []) {
  const body = await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({sql, params})
  });
  const results = Array.isArray(body?.result) ? body.result : [];
  if (!results.length || results.some(r => r?.success === false)) fail(`D1 query failed: ${safe(sql)}`);
  return results.flatMap(r => Array.isArray(r?.results) ? r.results : []);
}

async function names(type) {
  const rows = await query('SELECT name FROM sqlite_master WHERE type=?', [type]);
  return new Set(rows.map(row => String(row.name || '')));
}

async function inspect() {
  const tables = await names('table');
  const indexes = await names('index');
  const prerequisiteTables = ['tenants','users','sessions','executive_control_replacement_governance','auth_rate_limits','api_idempotency'];
  const missingPrerequisites = prerequisiteTables.filter(name => !tables.has(name));
  if (missingPrerequisites.length) fail(`earlier schema prerequisites are missing: ${missingPrerequisites.join(', ')}`);
  const sessionColumns = await query('PRAGMA table_info(sessions)');
  const sessionNames = new Set(sessionColumns.map(row => String(row.name || '')));
  if (!sessionNames.has('public_id')) fail('migration 043 prerequisite sessions.public_id is missing');
  return {
    tables,indexes,
    presentTables: targetTables.filter(name => tables.has(name)),
    presentIndexes: targetIndexes.filter(name => indexes.has(name))
  };
}

function targetComplete(state) {
  return state.presentTables.length === targetTables.length && state.presentIndexes.length === targetIndexes.length;
}

function targetAbsent(state) {
  return state.presentTables.length === 0 && state.presentIndexes.length === 0;
}

const migration = await readFile(migrationPath, 'utf8');
const gitBlobSha = createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if (gitBlobSha !== expectedGitBlobSha) fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before = await inspect();
if (targetComplete(before)) {
  console.log('Production D1 migration 044 already present; no mutation required.');
  process.exit(0);
}
if (!targetAbsent(before)) {
  fail(`partial migration detected tables=${before.presentTables.join(',') || 'none'} indexes=${before.presentIndexes.join(',') || 'none'}`);
}

const bookmarkBody = await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`, {method: 'GET'});
const bookmark = String(bookmarkBody?.result?.bookmark || '').trim();
if (!bookmark) fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

console.log('Applying reviewed forward-only migration 044 to production D1.');
await query(migration);

const after = await inspect();
if (!targetComplete(after)) {
  fail(`post-migration verification incomplete tables=${after.presentTables.join(',')} indexes=${after.presentIndexes.join(',')}`);
}
const foreignKeyViolations = await query('PRAGMA foreign_key_check');
if (foreignKeyViolations.length) fail(`foreign key verification failed with ${foreignKeyViolations.length} violation(s)`);

console.log('Production D1 migration 044 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
