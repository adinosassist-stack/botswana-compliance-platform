import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import stage from '../cloudflare/src/manager-invitations-private-staging-entry.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('isolated staging config has no routes, no previews, and only synthetic D1',()=>{
 const c=read('cloudflare/wrangler.manager-invitations-staging.toml');
 assert.match(c,/name = "bw-manager-invitations-private-staging"/);
 assert.match(c,/workers_dev = false/);
 assert.match(c,/preview_urls = false/);
 assert.match(c,/keep_vars = false/);
 assert.match(c,/database_name = "bw-manager-invitations-synthetic-staging"/);
 assert.match(c,/database_id = "518a9e33-b2ba-4204-ac52-aae4150a7b52"/);
 assert.match(c,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED = "false"/);
 assert.match(c,/REGISTRATION_MODE = "hold"/);
 assert.doesNotMatch(c,/^\s*\[\[routes\]\]/m);
 assert.doesNotMatch(c,/^\s*custom_domain\s*=/m);
 assert.doesNotMatch(c,/^\s*\[assets\]/m);
 assert.doesNotMatch(c,/bw-compliance-os"/);
});
test('isolated Worker remains 404-only with no auth or data side effects',async()=>{
 const r=await stage.fetch(new Request('https://test.invalid/api/auth/manager-invite/accept',{method:'POST'}));
 assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');
 const src=read('cloudflare/src/manager-invitations-private-staging-entry.js');
 assert.doesNotMatch(src,/\.DB\.|\.prepare\(|\.batch\(|\bfetch\(request,/);
});
