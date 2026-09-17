import assert from 'node:assert/strict';
import releaseMetadata from '../release/production.json' with {type:'json'};
import {
  CLIENT_TRANSPORT_IMPLEMENTATION,
  applyClientRuntimeIdentity,
  clientRuntimeRelease,
  releaseSourceSha,
  runtimeScriptUrl
} from '../cloudflare/src/client-runtime-identity.js';

const expectedSha=String(releaseMetadata.sourceSha||'').toLowerCase();
assert.match(expectedSha,/^[0-9a-f]{40}$/,'release source SHA must be immutable');
assert.equal(releaseSourceSha(),expectedSha,'runtime identity must derive from release source SHA');
assert.equal(CLIENT_TRANSPORT_IMPLEMENTATION,'transport-fallback-race-v2','transport implementation label drifted');
assert.equal(clientRuntimeRelease(),`transport-fallback-race-v2-${expectedSha.slice(0,12)}`,'runtime release must bind implementation to exact source SHA');

const old='<html><body><script src="/js/api-client.js?v=stale-release" defer></script></body></html>';
const rewritten=runtimeScriptUrl(old);
assert.ok(rewritten.includes(`/js/api-client.js?v=${clientRuntimeRelease()}`),'api-client query must be replaced with release-derived runtime identity');
assert.ok(!rewritten.includes('stale-release'),'stale runtime query must be removed');

const request=new Request('https://thebedesk.com/auth.html?runtime-test=1');
const response=new Response(old,{status:200,headers:{'content-type':'text/html; charset=utf-8','etag':'stale'}});
const decorated=await applyClientRuntimeIdentity(request,response);
assert.equal(decorated.headers.get('x-thebe-client-release'),clientRuntimeRelease(),'auth HTML response must expose runtime identity');
assert.equal(decorated.headers.get('x-thebe-client-implementation'),CLIENT_TRANSPORT_IMPLEMENTATION,'auth HTML response must expose implementation identity');
assert.match(decorated.headers.get('cache-control')||'',/no-store/,'auth HTML response must be non-cacheable');
assert.equal(decorated.headers.get('etag'),null,'runtime-versioned auth HTML must not retain stale ETag');
assert.ok((await decorated.text()).includes(`/js/api-client.js?v=${clientRuntimeRelease()}`),'auth HTML response must load the exact runtime identity');

const workspaceResponse=await applyClientRuntimeIdentity(
  new Request('https://thebedesk.com/?workspace-shell=1'),
  new Response(old,{status:200,headers:{'content-type':'text/html; charset=utf-8'}})
);
assert.equal(workspaceResponse.headers.get('x-thebe-client-release'),clientRuntimeRelease(),'internal workspace shell must preserve runtime identity');

const publicHome=await applyClientRuntimeIdentity(
  new Request('https://thebedesk.com/home.html'),
  new Response('<html><body>public</body></html>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}})
);
assert.equal(publicHome.headers.get('x-thebe-client-release'),null,'public-only home asset must not carry private app client identity');
assert.equal(await publicHome.text(),'<html><body>public</body></html>','public-only home asset must remain untouched');

const assetResponse=await applyClientRuntimeIdentity(
  new Request('https://thebedesk.com/js/api-client.js'),
  new Response('client',{status:200,headers:{'content-type':'application/javascript'}})
);
assert.equal(assetResponse.headers.get('x-thebe-client-release'),clientRuntimeRelease(),'worker-served API client must expose matching identity');
assert.match(assetResponse.headers.get('cache-control')||'',/no-store/,'worker-served API client must be non-cacheable');

const unrelated=new Response('ok',{headers:{'content-type':'text/plain'}});
const unrelatedResult=await applyClientRuntimeIdentity(new Request('https://thebedesk.com/robots.txt'),unrelated);
assert.equal(await unrelatedResult.text(),'ok','unrelated responses must be unchanged');

console.log(`CLIENT_RUNTIME_IDENTITY_PASS ${clientRuntimeRelease()}`);
