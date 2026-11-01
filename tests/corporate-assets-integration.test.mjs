import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {injectOwnerCommandCentreAssets,injectPublicThebeAssets} from '../cloudflare/src/production-entry.js';
const worker=readFileSync('cloudflare/src/worker.js','utf8');
const client=readFileSync('public/js/corporate-assets.js','utf8');
test('asset route inherits canonical authenticated origin, CSRF and role boundary',()=>{
 const at=worker.indexOf('const corporateAssetsResponse=await handleCorporateAssets');assert.ok(at>worker.indexOf('const a=await auth(req,env);',worker.indexOf('if(url.pathname.startsWith("/api/"))')));
 for(const guard of ['if(!requestOriginAllowed(req,env))','if(!mutationCsrfOk(req,a))','!restrictedWorkspaceMutationAllowed'])assert.ok(worker.indexOf(guard)<at);
 assert.match(readFileSync('cloudflare/src/agentic-entry.js','utf8'),/guardPausedWorkspaceWrites/);
 assert.match(readFileSync('cloudflare/wrangler.toml','utf8'),/^THEBE_CORPORATE_ASSETS_ENABLED = "false"$/m);
});
test('Assets uses shared workspace injection once and does not enter public marketing',()=>{
 const html='<!doctype html><html><head></head><body></body></html>';
 const result=injectOwnerCommandCentreAssets(injectOwnerCommandCentreAssets(html));
 assert.equal(result.split('/js/corporate-assets.js').length-1,1);assert.equal(result.split('/assets/corporate-assets.css').length-1,1);
 assert.ok(!injectPublicThebeAssets(html).includes('/js/corporate-assets.js'));
 assert.doesNotMatch(client,/localStorage|sessionStorage|<iframe|innerHTML|safeHTML/);
 assert.match(client,/whenThebeWorkspaceReady/);assert.match(client,/thebe:workspace-view-change/);
});
