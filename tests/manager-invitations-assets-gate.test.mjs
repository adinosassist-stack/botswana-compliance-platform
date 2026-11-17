import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const wrangler=fs.readFileSync(new URL('../cloudflare/wrangler.toml',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('manager invitation HTML cannot bypass Worker via static assets',()=>{
 const section=wrangler.slice(wrangler.indexOf('[assets]'),wrangler.indexOf('[triggers]'));
 assert.match(section,/run_worker_first\s*=\s*\[/);
 assert.match(section,/"\/manager-invite\/\*"/);
 const i=worker.indexOf("if(url.pathname.startsWith('/manager-invite/'))");
 assert.ok(i>0);
 const block=worker.slice(i,i+1300);
 assert.match(block,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
 assert.match(block,/APP_ENV/);
 assert.match(block,/return json\(\{error:'not_found'\},404\)/);
});
test('production default has no manager invitation activation switch',()=>{
 assert.match(wrangler,/APP_ENV\s*=\s*"production"/);
 assert.doesNotMatch(wrangler,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED\s*=\s*"true"/);
});
