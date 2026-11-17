import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('functional manager staging config is isolated, unrouteable and disabled by default',()=>{
 const candidate=read('cloudflare/wrangler.manager-invitations-functional-staging.toml');
 const production=read('cloudflare/wrangler.toml');
 const inert=read('cloudflare/wrangler.manager-invitations-staging.toml');
 assert.match(candidate,/main = "src\/worker.js"/);
 assert.match(candidate,/name = "bw-manager-invitations-functional-private-staging"/);
 assert.match(candidate,/APP_ENV = "staging"/);
 for(const k of ['MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED','MANAGER_INVITATIONS_SCHEMA_READY','MANAGER_INVITATIONS_ACCESS_READY','EVIDENCE_UPLOADS_ENABLED','THEBE_GENERAL_AI_ENABLED','THEBE_AI_EXPORTS_ENABLED','POP_UPLOAD_STAGING_ENABLED'])
  assert.match(candidate,new RegExp('^'+k+' = "false"$','m'));
 assert.match(candidate,/REGISTRATION_MODE = "hold"/);
 assert.match(candidate,/PAYMENT_PROVIDER = "none"/);
 assert.match(candidate,/workers_dev = false/);
 assert.match(candidate,/preview_urls = false/);
 assert.match(candidate,/keep_vars = false/);
 assert.doesNotMatch(candidate,/^\s*\[\[routes\]\]|^\s*custom_domain\s*=|^\s*route\s*=|^\s*\[triggers\]|^\s*crons\s*=/m);
 assert.doesNotMatch(candidate,/bw-compliance-os|thebedesk\.com|bw-compliance-evidence/);
 assert.match(candidate,/database_id = "518a9e33-b2ba-4204-ac52-aae4150a7b52"/);
 assert.match(candidate,/binding = "DB"/);
 assert.match(candidate,/binding = "ASSETS"/);
 assert.match(candidate,/directory = "\.\.\/public"/);
 assert.match(candidate,/run_worker_first = \["\/auth"/);
 assert.match(production,/main = "src\/release-governance-entry.js"/);
 assert.match(inert,/main = "src\/manager-invitations-private-staging-entry.js"/);
});
test('functional candidate binds no external integrations, customer secrets or public origin',()=>{
 const config=read('cloudflare/wrangler.manager-invitations-functional-staging.toml');
 assert.doesNotMatch(config,/^\s*\[\[r2_buckets\]\]|^\s*\[ai\]|^\s*\[secrets\]/m);
 assert.match(config,/PUBLIC_ORIGIN = ""/);
 assert.match(config,/PUBLIC_APP_URL = ""/);
});
