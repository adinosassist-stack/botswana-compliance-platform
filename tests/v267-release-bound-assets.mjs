import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';
const a='1'.repeat(40),b='2'.repeat(40);
const html='<html><head><link rel="stylesheet" href="/assets/workspace-inline-styles-old.css?v=old"><script src="/js/workspace-runtime-old.js?v=old" defer></script><script src="https://external.example/script.js"></script></head><body><a href="/app/">Workspace</a></body></html>';
const fresh=versionReleaseAssets(html,a);
assert(fresh.includes('workspace-runtime-old.js?v=old&amp;release='+a));
assert(fresh.includes('workspace-inline-styles-old.css?v=old&amp;release='+a));
assert(fresh.includes('thebe-dock-recovery-geometry-v269.js?release='+a));
assert.equal((fresh.match(/thebe-dock-recovery-geometry-v269\.js/g)||[]).length,1,'V269 recovery guard is injected once');
assert(fresh.includes('src="https://external.example/script.js"'));
assert(fresh.includes('<a href="/app/">'));
assert.equal(versionReleaseAssets(fresh,a),fresh,'identity decoration is idempotent');
const next=versionReleaseAssets(fresh,b);assert(!next.includes(a),'new release removes all old asset identities');
assert.equal((next.match(/name="thebe-assets-release"/g)||[]).length,1);
assert.equal(versionReleaseAssets(html,'invalid'),html);
for(const path of ['/','/app/','/auth/','/pricing/']){
 const response=await applyAssetReleaseIdentity(new Request('https://thebedesk.com'+path),new Response(html,{headers:{'content-type':'text/html','etag':'old','content-length':'100'}}));
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('content-length'),null);const body=await response.text();assert(body.includes('thebe-assets-release'));assert(body.includes('thebe-dock-recovery-geometry-v269.js'));
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
console.log('PASS: release-specific script/style/fragment URLs, V269 recovery guard delivery, idempotence, external URL preservation, HTML cache policy, HEAD and all three fragment transports');
