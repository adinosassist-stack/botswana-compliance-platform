import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';
import {externalizeWorkspaceRuntime,externalizeWorkspaceHeadStyles,externalizeWorkspaceViews,injectFirstPartyRegistrationClient} from '../cloudflare/src/production-entry.js';
const a='1'.repeat(40),b='2'.repeat(40);
const html='<html><head><link rel="stylesheet" href="/assets/workspace-inline-styles-old.css?v=old"><script src="/js/workspace-runtime-old.js?v=old" defer></script><script src="https://external.example/script.js"></script></head><body><a href="/app/">Workspace</a></body></html>';
const fresh=versionReleaseAssets(html,a);
assert(fresh.includes('workspace-runtime-old.js?v=old&amp;release='+a));
assert(fresh.includes('workspace-inline-styles-old.css?v=old&amp;release='+a));
assert(fresh.includes('thebe-dock-recovery-geometry-v269.js?release='+a));
assert(fresh.includes('thebe-live-preview-fallback-v272.js?release='+a));
assert.equal((fresh.match(/thebe-dock-recovery-geometry-v269\.js/g)||[]).length,1,'V269 recovery guard is injected once');
assert.equal((fresh.match(/thebe-live-preview-fallback-v272\.js/g)||[]).length,1,'V272 preview bridge is injected once');
assert(fresh.includes('src="https://external.example/script.js"'));
assert(fresh.includes('<a href="/app/">'));
assert.equal(versionReleaseAssets(fresh,a),fresh,'identity decoration is idempotent');
const next=versionReleaseAssets(fresh,b);assert(!next.includes(a),'new release removes all old asset identities');
assert.equal((next.match(/name="thebe-assets-release"/g)||[]).length,1);
assert.equal(versionReleaseAssets(html,'invalid'),html);
for(const path of ['/','/app/','/auth/','/pricing/']){
 const response=await applyAssetReleaseIdentity(new Request('https://thebedesk.com'+path),new Response(html,{headers:{'content-type':'text/html','etag':'old','content-length':'100'}}));
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('content-length'),null);const body=await response.text();assert(body.includes('thebe-assets-release'));assert(body.includes('thebe-dock-recovery-geometry-v269.js'));assert(body.includes('thebe-live-preview-fallback-v272.js'));
}
const head=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/',{method:'HEAD'}),new Response(html,{headers:{'content-type':'text/html'}}));assert.equal(await head.text(),'');
const json=new Response('{}',{headers:{'content-type':'application/json'}});assert.equal(await applyAssetReleaseIdentity(new Request('https://thebedesk.com/api/state'),json),json);
for(const file of ['public/js/workspace-runtime-20261001b.js','public/index.html','cloudflare/src/production-entry.js']){
 const source=fs.readFileSync(file,'utf8');
 const start=source.indexOf('async function fetchWorkspaceViewShard(asset,shard){');
 const end=source.indexOf('\n}',start)+2;assert(start>=0);
 const urls=[];
 const context=vm.createContext({URL,window:{location:{origin:'https://thebedesk.com'}},document:{querySelector:()=>({content:b})},workspaceFragmentClient:{request:async url=>{urls.push(url);return {schema:2,shard:4,views:{propertyintelligence:'Property'}}}}});
 vm.runInContext(source.slice(start,end),context);
 await vm.runInContext('fetchWorkspaceViewShard("/assets/workspace-view-fragments-old-4.json?v=old",4)',context);
 assert.equal(urls[0],'/assets/workspace-view-fragments-old-4.json?v=old&release='+b,file+' must bind dynamically loaded fragments to release identity');
}
assert.match(fs.readFileSync('cloudflare/src/release-governance-entry.js','utf8'),/next=await applyAssetReleaseIdentity\(request,next\)/);
await import('./v269-emergency-dock-geometry.mjs');
console.log('PASS: release-specific assets, V269 recovery guard and V272 preview bridge delivery remain idempotent with no-store HTML and fragment identity');

// Reproduce the actual Worker security -> production extraction -> release decoration order.
const workerSource=fs.readFileSync('cloudflare/src/worker.js','utf8');
const nonceContext=vm.createContext({});
for(const name of ['nonceInlineScripts','nonceInlineStyles','nonceHtmlExecutableBlocks']){
 const line=workerSource.split('\n').find(line=>line.startsWith(`function ${name}(`));
 assert(line,`Worker nonce function ${name} exists`);vm.runInContext(line,nonceContext);
}
const canonical=fs.readFileSync('public/index.html','utf8');
const secured=nonceContext.nonceHtmlExecutableBlocks(canonical,'workspace-test-nonce');
for(const input of [canonical,secured]){
 const extracted=externalizeWorkspaceViews(externalizeWorkspaceHeadStyles(externalizeWorkspaceRuntime(injectFirstPartyRegistrationClient(input))));
 assert(!extracted.includes('id="thebe-workspace-runtime-inline"'),'nonce does not prevent runtime extraction');
 assert(extracted.includes('id="thebe-workspace-runtime" src="/js/workspace-runtime-20261001b.js'),'external runtime retained');
 const delivered=versionReleaseAssets(extracted,a);
 assert(delivered.includes('id="appShell"')&&delivered.includes('peopleInfographicsMount'),'workspace shell and People survive delivery');
 for(const block of delivered.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\btype=["']application\//.test(block[1])||!block[2].trim())continue;
  assert.doesNotThrow(()=>new vm.Script(block[2]),'delivered executable inline scripts must parse');
 }
}
// The printable compliance document contains closing head/body tags inside runtime text.
const decorated=versionReleaseAssets(secured,a);
const runtimeBlock=decorated.match(/<script\b[^>]*id="thebe-workspace-runtime-inline"[^>]*>([\s\S]*?)<\/script>/)[1];
assert(!runtimeBlock.includes('<script src="/js/thebe-dock-recovery'),'dock injection stays outside executable script');
assert.doesNotThrow(()=>new vm.Script(runtimeBlock),'release decoration cannot break inline fallback runtime');
assert.equal(versionReleaseAssets(decorated,a),decorated,'real workspace decoration is idempotent');
console.log('PASS: nonce-bearing production workspace extraction and embedded printable-document delivery');
