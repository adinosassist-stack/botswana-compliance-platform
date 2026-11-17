import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('manager staging dashboard requires dedicated reporting schema and denies missing D1 tables',()=>{
 const source=read('cloudflare/src/manager-invitations-scoped-read.js');
 const canonical=read('cloudflare/schema.sql');
 assert.match(source,/FROM daily_employee_reports r/);
 assert.match(source,/scoped_access_unavailable/);
 assert.match(canonical,/CREATE TABLE IF NOT EXISTS daily_employee_reports\(/);
 assert.match(canonical,/FOREIGN KEY\(employee_id\) REFERENCES employees\(id\)/);
});
test('staging bootstrap cannot silently claim complete reporting readiness',()=>{
 const draft=read('db/drafts/manager-invitations-2578-synthetic-bootstrap.sql');
 const conf=read('cloudflare/wrangler.manager-invitations-staging.toml');
 assert.doesNotMatch(draft,/CREATE TABLE IF NOT EXISTS daily_employee_reports/);
 assert.match(conf,/MANAGER_INVITATIONS_SCHEMA_READY = "false"/);
 assert.match(conf,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED = "false"/);
 assert.match(conf,/workers_dev = false/);
 assert.match(conf,/preview_urls = false/);
});
