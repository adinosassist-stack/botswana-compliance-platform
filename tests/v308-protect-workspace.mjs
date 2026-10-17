import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/protect-workspace-v308.js','utf8');
const recovery=fs.readFileSync('public/js/protect-lazy-hydration-v528.js','utf8');
const accountRecovery=fs.readFileSync('public/js/account-lazy-hydration-v532.js','utf8');
const genericRecovery=fs.readFileSync('public/js/workspace-lazy-hydration-recovery-v533.js','utf8');
const canonicalShard=fs.readFileSync('public/assets/workspace-view-fragments-20261001a-10.json','utf8');
const recoveryShard=fs.readFileSync('public/assets/workspace-view-fragments-20261016a-10.json','utf8');
const recoveryPayload=JSON.parse(recoveryShard);
const legacyAccountShard=JSON.parse(fs.readFileSync('public/assets/workspace-view-fragments-20260929g-4.json','utf8'));
const fragmentManifest=JSON.parse(fs.readFileSync('public/assets/workspace-view-fragments-20261001a.json','utf8'));
const fragmentShards=Array.from({length:12},(_,i)=>JSON.parse(fs.readFileSync(`public/assets/workspace-view-fragments-20261001a-${i}.json`,'utf8')));
const production=fs.readFileSync('cloudflare/src/production-entry.js','utf8');
const assetIdentity=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
const sha='8'.repeat(40);

const expectedLazyRouteShards=Object.freeze({
  protecthub:10,
  propertyintelligence:4,
  tenderhub:5,
  accounthub:4,
  employer:3,
  employees:1,
  dailyreports:6,
  privacy:8,
  tender:0,
  events:1,
  manufacturing:6,
  sources:4,
  taxprofile:6,
  bwreadiness:1,
  corporate:9,
  employmentcontrols:2,
  publishing:7,
  calendar:10,
  vault:10,
  documents:8,
  changes:3,
  audit:7,
  rules:3,
  expert:10,
  security:4,
  integrations:11,
  billing:3,
  accountsocial:2,
  accountsecurity:5,
  accountdata:7,
  tenderready:7,
  protectionengine:7,
  employershield:4,
  companysecretary:3,
  compliancepassport:1,
  licenceos:1,
  partnerportal:4,
  workflowhub:2,
  aiservices:10,
  aicontrols:6,
  notifications:0,
  recurringautomation:4,
  servicesmarketplace:9,
  payments:5,
  entitlements:2,
  regulatoryintel:2,
  regulatoryobligations:9,
  inspectionreadiness:6,
  datadeletion:8,
  evidenceintegrity:10,
  controlcenter:10,
  riskengine:1,
  portfolioRisk:11,
  industryintel:0,
  assurancefreshness:4,
  auditintegrity:6,
  controllineage:2,
  regulatorygovernance:6,
  statutorycalendar:1,
  businessevents:5,
  partneractioncenter:7,
  profile:1
});
const viewShard=id=>{let hash=0;for(const ch of String(id||''))hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;return hash%12};
const lazyConstant=(production.match(/const WORKSPACE_LAZY_VIEW_IDS=Object\.freeze\((\[[^\n]+\])\);/)||[])[1];
assert.ok(lazyConstant,'production lazy workspace route inventory must remain parseable');
const productionLazyViews=JSON.parse(lazyConstant);
assert.equal(fragmentManifest.schema,1,'canonical all-view manifest must preserve schema 1 for systemic fallback');
assert.deepEqual(productionLazyViews.slice().sort(),Object.keys(expectedLazyRouteShards).sort(),'every production lazy workspace route must have an explicit expected shard regression fixture');
assert.deepEqual(Object.keys(fragmentManifest.views||{}).sort(),Object.keys(expectedLazyRouteShards).sort(),'fragment manifest must cover exactly the expected lazy workspace routes');
for(const [id,expectedShard] of Object.entries(expectedLazyRouteShards)){
  assert.equal(viewShard(id),expectedShard,`lazy workspace route ${id} must resolve to expected shard ${expectedShard}`);
  assert.equal(fragmentShards[expectedShard]?.shard,expectedShard,`expected shard payload identity mismatch for ${id}`);
  assert.equal(Object.prototype.hasOwnProperty.call(fragmentShards[expectedShard]?.views||{},id),true,`lazy workspace route ${id} is missing from expected shard ${expectedShard}`);
  assert.equal(fragmentShards[expectedShard].views[id],fragmentManifest.views[id],`lazy workspace route ${id} markup drifted from canonical manifest`);
  for(let shard=0;shard<fragmentShards.length;shard++){
    if(shard===expectedShard)continue;
    assert.equal(Object.prototype.hasOwnProperty.call(fragmentShards[shard]?.views||{},id),false,`lazy workspace route ${id} must not appear in shard ${shard}`);
  }
}
assert.equal(expectedLazyRouteShards.protecthub,10,'Protect must remain pinned to its deterministic shard 10 route');
assert.equal(expectedLazyRouteShards.accounthub,4,'Settings must remain pinned to deterministic shard 4');
assert.equal(expectedLazyRouteShards.audit,7,'Activity history must remain pinned to deterministic shard 7');
assert.equal(typeof fragmentManifest.views?.audit,'string','systemic fallback manifest must contain Activity history markup');
assert(fragmentManifest.views.audit.trim().length>0,'systemic fallback Activity history markup must be non-empty');
assert.equal(legacyAccountShard.schema,2,'Release 532 Settings recovery source must preserve workspace fragment schema');
assert.equal(legacyAccountShard.shard,4,'Release 532 Settings recovery source must remain shard 4');
assert.equal(legacyAccountShard.views?.accounthub,fragmentManifest.views?.accounthub,'Release 532 Settings recovery markup must exactly match the current canonical Settings view');

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

assert.match(accountRecovery,/20261016-account-lazy-hydration-v532/,'Release 532 Settings recovery has explicit release identity');
assert.match(accountRecovery,/ROOT_ID='accounthub'/,'Release 532 recovery is scoped to Settings');
assert.match(accountRecovery,/SHARD=4/,'Release 532 Settings recovery remains pinned to shard 4');
assert.match(accountRecovery,/workspace-view-fragments-20260929g-4\.json/,'Release 532 Settings recovery uses an alternate immutable shard-4 asset path');
assert.match(accountRecovery,/globalThis\.BW\?\.api\?\.createClient/,'Release 532 Settings recovery uses centralized API transport');
assert.match(accountRecovery,/client\.request\(releaseBoundAsset\(\),\{method:'GET',cache:'reload'\}\)/,'Release 532 Settings recovery forces alternate shard revalidation');
assert.match(accountRecovery,/globalThis\.BW\?\.dom\?\.renderMarkup/,'Release 532 Settings recovery requires the DOM safety layer');
assert.match(accountRecovery,/root\.dataset\.lazyHydrated='1'/,'Release 532 marks Settings hydrated only after safe rendering');
assert.match(accountRecovery,/root\.removeAttribute\('data-lazy-view'\)/,'Release 532 removes the Settings lazy marker after successful recovery');
assert.match(accountRecovery,/delete root\.dataset\.lazyError/,'Release 532 clears stale Settings lazy failure only after successful recovery');
assert.doesNotMatch(accountRecovery,/\.innerHTML\s*=/,'Release 532 Settings recovery does not bypass safe DOM rendering');
assert.doesNotMatch(accountRecovery,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'Release 532 Settings recovery remains read-only');

assert.match(genericRecovery,/20261016-workspace-lazy-hydration-recovery-v533/,'Release 533 systemic lazy recovery has explicit release identity');
assert.match(genericRecovery,/workspace-view-fragments-20261001a\.json/,'Release 533 systemic recovery uses the canonical all-view manifest fallback');
assert.match(genericRecovery,/globalThis\.BW\?\.api\?\.createClient/,'Release 533 systemic recovery uses centralized API transport');
assert.match(genericRecovery,/client\.request\(releaseBoundAsset\(\),\{method:'GET',cache:'reload'\}\)/,'Release 533 systemic recovery forces manifest revalidation');
assert.match(genericRecovery,/Number\(payload\?\.schema\)!==1/,'Release 533 systemic recovery validates fallback manifest schema');
assert.match(genericRecovery,/data-lazy-view=\\?"1\\?".*data-lazy-error=\\?"1\\?"/,'Release 533 systemic recovery targets failed lazy views rather than eager hydration');
assert.match(genericRecovery,/MutationObserver/,'Release 533 systemic recovery observes lazy failure transitions');
assert.match(genericRecovery,/globalThis\.BW\?\.dom\?\.renderMarkup/,'Release 533 systemic recovery requires the DOM safety layer');
assert.match(genericRecovery,/root\.dataset\.lazyHydrated='1'/,'Release 533 marks a recovered route hydrated only after safe rendering');
assert.match(genericRecovery,/root\.removeAttribute\('data-lazy-view'\)/,'Release 533 removes the lazy marker only after successful systemic recovery');
assert.match(genericRecovery,/delete root\.dataset\.lazyError/,'Release 533 clears the lazy error only after successful systemic recovery');
assert.match(genericRecovery,/globalThis\.showView\(id,\{lazyHydrated:true,preserveNavigationEpoch:true\}\)/,'Release 533 hands an active recovered route back to the normal showView lifecycle');
assert.doesNotMatch(genericRecovery,/\.innerHTML\s*=/,'Release 533 systemic recovery never bypasses safe DOM rendering');
assert.doesNotMatch(genericRecovery,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'Release 533 systemic recovery remains read-only');

assert.match(assetIdentity,/WORKSPACE_LAZY_HYDRATION_RECOVERY_SRC='\/js\/workspace-lazy-hydration-recovery-v533\.js'/,'Release 533 systemic recovery is release-bound');
assert.match(assetIdentity,/ACCOUNT_LAZY_HYDRATION_SRC='\/js\/account-lazy-hydration-v532\.js'/,'Release 532 Settings recovery remains release-bound');
assert.match(assetIdentity,/PROTECT_LAZY_HYDRATION_SRC='\/js\/protect-lazy-hydration-v528\.js'/,'V528 recovery remains release-bound');
assert.match(assetIdentity,/PROTECT_WORKSPACE_SRC='\/js\/protect-workspace-v308\.js'/,'V308 is release-bound');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(WORKSPACE_LAZY_HYDRATION_RECOVERY_SRC\)/,'Release 533 systemic recovery is scoped to workspace-fix delivery');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(ACCOUNT_LAZY_HYDRATION_SRC\)/,'Release 532 Settings recovery is scoped to workspace-fix delivery');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(PROTECT_LAZY_HYDRATION_SRC\)/,'V528 recovery is scoped to workspace-fix delivery');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(PROTECT_WORKSPACE_SRC\)/,'V308 is scoped to workspace-fix delivery');

const appHtml=versionReleaseAssets('<html><head></head><body><main>App</main></body></html>',sha,{includeWorkspaceFixes:true});
assert(appHtml.includes('/js/workspace-lazy-hydration-recovery-v533.js?release='+sha),'app workspace receives SHA-bound Release 533 systemic recovery asset');
assert(appHtml.includes('/js/account-lazy-hydration-v532.js?release='+sha),'app workspace receives SHA-bound Release 532 Settings recovery asset');
assert(appHtml.includes('/js/protect-lazy-hydration-v528.js?release='+sha),'app workspace receives SHA-bound V528 recovery asset');
assert(appHtml.includes('/js/protect-workspace-v308.js?release='+sha),'app workspace receives SHA-bound V308 asset');
assert(appHtml.indexOf('workspace-lazy-hydration-recovery-v533.js')<appHtml.indexOf('account-lazy-hydration-v532.js'),'Release 533 systemic recovery is delivered before legacy route-specific recovery layers');
assert(appHtml.indexOf('account-lazy-hydration-v532.js')<appHtml.indexOf('protect-lazy-hydration-v528.js'),'Release 532 Settings recovery is delivered before Protect recovery');
assert(appHtml.indexOf('protect-lazy-hydration-v528.js')<appHtml.indexOf('protect-workspace-v308.js'),'V528 recovery is delivered before the V308 Protect enhancer');
assert.equal((appHtml.match(/workspace-lazy-hydration-recovery-v533\.js/g)||[]).length,1,'Release 533 systemic recovery injection is idempotent within one decoration');
assert.equal((appHtml.match(/account-lazy-hydration-v532\.js/g)||[]).length,1,'Release 532 Settings recovery injection is idempotent within one decoration');
assert.equal((appHtml.match(/protect-lazy-hydration-v528\.js/g)||[]).length,1,'V528 recovery injection is idempotent within one decoration');
assert.equal((appHtml.match(/protect-workspace-v308\.js/g)||[]).length,1,'V308 injection is idempotent within one decoration');
assert.equal(versionReleaseAssets(appHtml,sha,{includeWorkspaceFixes:true}),appHtml,'workspace recovery decoration remains idempotent');
const publicHtml=versionReleaseAssets('<html><head></head><body>Public</body></html>',sha,{includeWorkspaceFixes:false});
assert.equal(publicHtml.includes('workspace-lazy-hydration-recovery-v533.js'),false,'public surface does not receive private systemic lazy recovery');
assert.equal(publicHtml.includes('account-lazy-hydration-v532.js'),false,'public surface does not receive private Settings recovery');
assert.equal(publicHtml.includes('protect-lazy-hydration-v528.js'),false,'public surface does not receive private Protect recovery');
assert.equal(publicHtml.includes('protect-workspace-v308.js'),false,'public surface does not receive private Protect enhancement');

const base='<html><head></head><body>Surface</body></html>';
const appResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/app/'),new Response(base,{headers:{'content-type':'text/html'}}));
const appResponseText=await appResponse.text();
assert(appResponseText.includes('workspace-lazy-hydration-recovery-v533.js'),'real /app response receives Release 533 systemic lazy recovery');
assert(appResponseText.includes('account-lazy-hydration-v532.js'),'real /app response receives Release 532 Settings recovery');
assert(appResponseText.includes('protect-lazy-hydration-v528.js'),'real /app response receives V528 recovery');
assert(appResponseText.includes('protect-workspace-v308.js'),'real /app response receives V308');
const homeResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/'),new Response(base,{headers:{'content-type':'text/html'}}));
const homeResponseText=await homeResponse.text();
assert.equal(homeResponseText.includes('workspace-lazy-hydration-recovery-v533.js'),false,'real public root excludes Release 533 systemic lazy recovery');
assert.equal(homeResponseText.includes('account-lazy-hydration-v532.js'),false,'real public root excludes Release 532 Settings recovery');
assert.equal(homeResponseText.includes('protect-lazy-hydration-v528.js'),false,'real public root excludes V528 recovery');
assert.equal(homeResponseText.includes('protect-workspace-v308.js'),false,'real public root excludes V308');

console.log('PASS: V308 Protect workspace, V528 shard-10 recovery, Release 532 Settings recovery, Release 533 systemic lazy recovery, and exhaustive lazy route shard regression are deterministic-first, read-only, safe-DOM, app-scoped and release-bound');
