import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const databaseId = String(process.env.D1_DATABASE_ID || '').trim();
const schemaPath = 'cloudflare/schema.sql';
const expectedSchemaBlobSha = '54499918620d18160efa4ff0cf6d3be434ef5539';

function fail(message) {
  throw new Error(`Production D1 initialization refused: ${message}`);
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
    const errors = Array.isArray(body?.errors)
      ? body.errors.map(e => `${e?.code ?? 'unknown'}:${e?.message ?? 'unknown'}`).join(' | ')
      : String(text || '').replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(`Cloudflare API ${path} failed HTTP ${response.status}: ${errors}`);
  }
  return body;
}

async function query(sql) {
  const body = await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({sql})
  });
  const results = Array.isArray(body?.result) ? body.result : [];
  if (!results.length || results.some(r => r?.success === false)) fail(`D1 inspection query failed: ${sql}`);
  return results.flatMap(r => Array.isArray(r?.results) ? r.results : []);
}

const schema = await readFile(schemaPath, 'utf8');
const schemaBlobSha = createHash('sha1').update(`blob ${Buffer.byteLength(schema)}\0`).update(schema).digest('hex');
if (schemaBlobSha !== expectedSchemaBlobSha) {
  fail(`reviewed schema blob changed expected=${expectedSchemaBlobSha} actual=${schemaBlobSha}`);
}

const applicationObjects = await query(`
  SELECT type,name
  FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '_cf_%'
    AND name NOT LIKE 'd1_%'
  ORDER BY type,name
`);

if (applicationObjects.length) {
  const summary = applicationObjects.slice(0, 40).map(row => `${row.type}:${row.name}`).join(', ');
  fail(`database is not empty; found application schema objects: ${summary}`);
}

const bookmarkBody = await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`, {method: 'GET'});
const bookmark = String(bookmarkBody?.result?.bookmark || '').trim();
if (!bookmark) fail('could not capture a pre-initialization Time Travel bookmark');

console.log('Production D1 confirmed empty of application schema objects.');
console.log(`Reviewed schema Git blob verified: ${schemaBlobSha}`);
console.log(`Pre-initialization Time Travel bookmark captured: ${bookmark}`);
