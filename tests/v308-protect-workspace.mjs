import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/protect-workspace-v308.js','utf8');
const recovery=fs.readFileSync('public/js/protect-lazy-hydration-v528.js','utf8');
const canonicalShard=fs.readFileSync('public/assets/workspace-view-fragments-20261001a-10.json','utf8');
const recoveryShard=fs.readFileSync('public/assets/workspace-view-fragments-20261016a-10.json','utf8');
const recoveryPayload=JSON.parse(recoveryShard);
const assetIdentity=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
const sha='8'.repeat(40);

assert.match(source,/20261007-protect-workspace-v308/,'explicit V308 release identity');
assert.match(source,/obligations:'\/api\/obligations'/,'Protect reads existing compliance obligations');
assert.match(source,/calendar:'\/api\/statutory-calendar'/,'Protect reads the existing statutory calendar');
assert.match(source,/actions:'\/api\/next-actions'/,'Protect reads the existing next-action proof queue');
assert.match(source,/globalThis\.BW\?\.api\?\.createClient/,'Protect uses the centralized authenticated API client');
assert.match(source,/client\(\)\.request\(path,\{method:'GET'\}\)/,'Protect uses centralized read transport');
assert.doesNotMatch(source,/\bfetch\s*\(/,'V308 must not bypass the centralized API transport');
assert.doesNotMatch(source,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'V308 must not introduce compliance writes');
assert.match(source,/Fix action gaps/,'obligations are exposed as deterministic work');
assert.match(source,/Meet filing dates/,'statutory dates are exposed as deterministic work');
assert.match(source,/Close proof gaps/,'evidence gaps are exposed as deterministic work');
assert.match(source,/Do not interpret this state as compliant, current or complete/,'full source failure fails closed');
assert.match(source,/unavailable sources are shown as unknown/,'partial source failure remains explicit');
assert.match(source,/does not declare legal compliance, file returns, approve evidence or change an obligation/,'authority boundary is visible');
assert.match(source,/Explain with Thebe/,'AI remains secondary interpretation');
assert.match(source,/Do not claim legal compliance, invent deadlines, file returns, approve evidence or change any obligation/,'AI prompt preserves compliance authority boundary');
assert.match(source,/@media\(max-width:620px\)/,'phone-specific layout exists');
assert.match(source,/min-height:44px/,'V308 preserves touch target floor');
assert.match(source,/:focus-visible/,'keyboard focus is explicit');
assert.match(source,/@media\(forced-colors:active\)/,'forced-colors accessibility is preserved');
assert.match(source,/MutationObserver/,'lazy workspace fragments are enhanced after insertion');
assert.match(source,/root\.classList\.contains\('active'\)/,'Protect data is fetched only when Protect is active unless explicitly refreshed');
assert.doesNotMatch(source,/\.innerHTML\s*=/,'V308 uses safe DOM construction');
assert.match(source,/replaceChildren/,'V308 replaces workspace views with DOM nodes');

for(const forbidden of ['propertyCalculator','property-calculator','calculator-shell','--thebe-spatial-width','thebe-ai-voice-main','thebe-particle-core']){
  assert.equal(source.includes(forbidden),false,`V308 must not alter protected Property/dock contract: ${forbidden}`);
}

assert.equal(recoveryShard,canonicalShard,'V528 recovery shard is an exact immutable copy of the canonical current shard');
assert.equal(recoveryPayload.schema,2,'V528 recovery shard preserves workspace fragment schema');
assert.equal(recoveryPayload.shard,10,'V528 recovery shard preserves deterministic shard identity');
assert.equal(typeof recoveryPayload.views?.protecthub,'string','V528 recovery shard contains Protect markup');
assert(recoveryPayload.views.protecthub.trim().length>0,'V528 recovery Protect markup is non-empty');
assert.match(recovery,/20261016-protect-lazy-hydration-v528/,'V528 recovery has explicit release identity');
assert.match(recovery,/workspace-view-fragments-20261016a-10\.json/,'V528 uses a fresh immutable Protect shard path');
assert.match(recovery,/globalThis\.BW\?\.api\?\.createClient/,'V528 recovery uses centralized API transport');
assert.match(recovery,/client\.request\(releaseBoundAsset\(\),\{method:'GET',cache:'reload'\}\)/,'V528 recovery forces shard revalidation');
assert.match(recovery,/globalThis\.BW\?\.dom\?\.renderMarkup/,'V528 recovery requires the DOM safety layer');
assert.match(recovery,/root\.dataset\.lazyHydrated='1'/,'V528 marks Protect hydrated only after safe rendering');
assert.match(recovery,/root\.removeAttribute\('data-lazy-view'\)/,'V528 removes the lazy marker after successful recovery');
assert.match(recovery,/delete root\.dataset\.lazyError/,'V528 clears stale lazy failure only after successful recovery');
assert.doesNotMatch(recovery,/\.innerHTML\s*=/,'V528 recovery does not bypass safe DOM rendering');
assert.doesNotMatch(recovery,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'V528 recovery remains read-only');

assert.match(assetIdentity,/PROTECT_LAZY_HYDRATION_SRC='\/js\/protect-lazy-hydration-v528\.js'/,'V528 recovery is release-bound');
assert.match(assetIdentity,/PROTECT_WORKSPACE_SRC='\/js\/protect-workspace-v308\.js'/,'V308 is release-bound');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(PROTECT_LAZY_HYDRATION_SRC\)/,'V528 recovery is scoped to workspace-fix delivery');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(PROTECT_WORKSPACE_SRC\)/,'V308 is scoped to workspace-fix delivery');

const appHtml=versionReleaseAssets('<html><head></head><body><main>App</main></body></html>',sha,{includeWorkspaceFixes:true});
assert(appHtml.includes('/js/protect-lazy-hydration-v528.js?release='+sha),'app workspace receives SHA-bound V528 recovery asset');
assert(appHtml.includes('/js/protect-workspace-v308.js?release='+sha),'app workspace receives SHA-bound V308 asset');
assert(appHtml.indexOf('protect-lazy-hydration-v528.js')<appHtml.indexOf('protect-workspace-v308.js'),'V528 recovery is delivered before the V308 Protect enhancer');
assert.equal((appHtml.match(/protect-lazy-hydration-v528\.js/g)||[]).length,1,'V528 recovery injection is idempotent within one decoration');
assert.equal((appHtml.match(/protect-workspace-v308\.js/g)||[]).length,1,'V308 injection is idempotent within one decoration');
assert.equal(versionReleaseAssets(appHtml,sha,{includeWorkspaceFixes:true}),appHtml,'Protect decoration remains idempotent');
const publicHtml=versionReleaseAssets('<html><head></head><body>Public</body></html>',sha,{includeWorkspaceFixes:false});
assert.equal(publicHtml.includes('protect-lazy-hydration-v528.js'),false,'public surface does not receive private Protect recovery');
assert.equal(publicHtml.includes('protect-workspace-v308.js'),false,'public surface does not receive private Protect enhancement');

const base='<html><head></head><body>Surface</body></html>';
const appResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/app/'),new Response(base,{headers:{'content-type':'text/html'}}));
const appResponseText=await appResponse.text();
assert(appResponseText.includes('protect-lazy-hydration-v528.js'),'real /app response receives V528 recovery');
assert(appResponseText.includes('protect-workspace-v308.js'),'real /app response receives V308');
const homeResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/'),new Response(base,{headers:{'content-type':'text/html'}}));
const homeResponseText=await homeResponse.text();
assert.equal(homeResponseText.includes('protect-lazy-hydration-v528.js'),false,'real public root excludes V528 recovery');
assert.equal(homeResponseText.includes('protect-workspace-v308.js'),false,'real public root excludes V308');

console.log('PASS: V308 Protect workspace and V528 fresh-shard recovery are deterministic-first, read-only, safe-DOM, app-scoped and release-bound');
