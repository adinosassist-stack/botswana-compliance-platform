import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const databaseId = String(process.env.D1_DATABASE_ID || '').trim();
const migrationPath = 'cloudflare/migrations/043_v78_session_inventory_hardening.sql';
const expectedGitBlobSha = 'ab6f41c79af501ee04226a120d98f699964e502f';

function fail(message) {
  throw new Error(`Production D1 migration 043 refused: ${message}`);
}

if (!token) fail('CLOUDFLARE_API_TOKEN is empty');
if (!/^[0-9a-fA-F]{32}$/.test(accountId)) fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) fail('D1_DATABASE_ID is invalid');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

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

function safe(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
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

async function columns(table) {
  const rows = await query(`PRAGMA table_info(${table})`);
  return new Set(rows.map(row => String(row.name || '')));
}

async function objectNames(type) {
  const rows = await query('SELECT name FROM sqlite_master WHERE type=?', [type]);
  return new Set(rows.map(row => String(row.name || '')));
}

async function inspect() {
  const tables = await objectNames('table');
  const indexes = await objectNames('index');
  const triggers = await objectNames('trigger');
  const requiredTables = [
    'executive_control_replacement_governance', 'auth_rate_limits', 'deletion_tombstones',
    'platform_scheduled_runs', 'api_idempotency', 'users', 'sessions', 'deletion_requests',
    'payment_events', 'daily_employee_reports', 'daily_report_revisions'
  ];
  const missing = requiredTables.filter(name => !tables.has(name)).map(name => `table:${name}`);
  if (missing.length) return {missing, tables, indexes, triggers};

  const users = await columns('users');
  const sessions = await columns('sessions');
  const deletionRequests = await columns('deletion_requests');
  const paymentEvents = await columns('payment_events');

  if (!users.has('session_generation')) missing.push('column:users.session_generation');
  if (!sessions.has('session_generation')) missing.push('column:sessions.session_generation');
  for (const name of ['processing_token', 'processing_started_at']) {
    if (!deletionRequests.has(name)) missing.push(`column:deletion_requests.${name}`);
  }
  for (const name of ['payment_order_id', 'processing_token', 'processing_started_at', 'processing_attempts']) {
    if (!paymentEvents.has(name)) missing.push(`column:payment_events.${name}`);
  }
  if (!triggers.has('daily_employee_reports_revision_snapshot')) missing.push('trigger:daily_employee_reports_revision_snapshot');
  if (!indexes.has('daily_report_revisions_report_revision_uq')) missing.push('index:daily_report_revisions_report_revision_uq');

  return {missing, tables, indexes, triggers, sessions};
}

const migration = await readFile(migrationPath, 'utf8');
const gitBlobSha = createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if (gitBlobSha !== expectedGitBlobSha) fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before = await inspect();
if (before.missing.length) fail(`earlier schema prerequisites are missing: ${before.missing.join(', ')}`);
if (before.sessions.has('public_id')) {
  if (!before.indexes.has('sessions_public_id_uq') || !before.indexes.has('sessions_user_generation_live_idx')) {
    fail('sessions.public_id already exists but migration 043 indexes are incomplete; refusing partial replay');
  }
  console.log('Production D1 migration 043 already present; no mutation required.');
  process.exit(0);
}

const bookmarkBody = await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`, {method: 'GET'});
const bookmark = String(bookmarkBody?.result?.bookmark || '').trim();
if (!bookmark) fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

console.log('Applying reviewed forward-only migration 043 to production D1.');
await query(migration);

const after = await inspect();
if (after.missing.length) fail(`post-migration earlier schema prerequisites unexpectedly missing: ${after.missing.join(', ')}`);
if (!after.sessions.has('public_id')) fail('sessions.public_id is still missing after migration');
if (!after.indexes.has('sessions_public_id_uq')) fail('sessions_public_id_uq is missing after migration');
if (!after.indexes.has('sessions_user_generation_live_idx')) fail('sessions_user_generation_live_idx is missing after migration');

const nullRows = await query("SELECT COUNT(*) AS count FROM sessions WHERE public_id IS NULL OR trim(public_id)='' ");
const nullCount = Number(nullRows?.[0]?.count || 0);
if (nullCount !== 0) fail(`session public_id backfill incomplete count=${nullCount}`);

console.log('Production D1 migration 043 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
