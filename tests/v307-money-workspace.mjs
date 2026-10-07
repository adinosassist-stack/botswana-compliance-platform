import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/money-workspace-v307.js','utf8');
const assetIdentity=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
const sha='7'.repeat(40);

assert.match(source,/20261007-money-workspace-v307/,'explicit V307 release identity');
assert.match(source,/const API='\/api\/finance\/summary'/,'Money reads the canonical aggregate finance summary');
assert.match(source,/globalThis\.BW\?\.api\?\.createClient/,'Money uses the centralized authenticated API client');
assert.match(source,/financeApiClient\(\)\.request\(API,\{method:'GET'\}\)/,'finance summary uses centralized read transport');
assert.doesNotMatch(source,/\bfetch\s*\(/,'V307 must not bypass the centralized API transport');
assert.match(source,/method:'GET'/,'V307 finance request is read-only');
assert.doesNotMatch(source,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,'V307 must not introduce finance writes');
assert.match(source,/Reconcile cash/,'cash reconciliation is a deterministic work lane');
assert.match(source,/Collect customer money/,'receivables are exposed as deterministic work');
assert.match(source,/Pay suppliers deliberately/,'payables are exposed as deterministic work');
assert.match(source,/overdueMinor/,'overdue monetary exposure is shown');
assert.match(source,/due7dMinor/,'near-term due exposure is shown');
assert.match(source,/moneyV307Freshness/,'last-confirmed finance state is visible');
assert.match(source,/Do not interpret missing cash, receivables, payables or reconciliation figures as zero/,'unavailable data cannot masquerade as zero');
assert.match(source,/payables\?\.available===false/,'payables unavailability is explicit');
assert.match(source,/Explain with Thebe/,'AI remains available as interpretation');
assert.match(source,/Start from the canonical ledger.*before asking AI/s,'deterministic finance work precedes AI interpretation');
assert.match(source,/@media\(max-width:620px\)/,'phone-specific layout exists');
assert.match(source,/min-height:44px/,'V307 preserves touch target floor');
assert.match(source,/:focus-visible/,'keyboard focus is explicit');
assert.match(source,/@media\(forced-colors:active\)/,'forced-colors accessibility is preserved');
assert.match(source,/MutationObserver/,'lazy workspace fragments are enhanced after insertion');
assert.match(source,/root\.classList\.contains\('active'\)/,'finance data is fetched only when Money is active unless explicitly refreshed');
assert.doesNotMatch(source,/\.innerHTML\s*=/,'V307 uses safe DOM construction');
assert.match(source,/replaceChildren/,'V307 replaces finance views with DOM nodes');

for(const forbidden of ['propertyCalculator','property-calculator','calculator-shell','--thebe-spatial-width','thebe-ai-voice-main','thebe-particle-core']){
  assert.equal(source.includes(forbidden),false,`V307 must not alter protected Property/dock contract: ${forbidden}`);
}

assert.match(assetIdentity,/MONEY_WORKSPACE_SRC='\/js\/money-workspace-v307\.js'/,'V307 is release-bound');
assert.match(assetIdentity,/includeWorkspaceFixes===true&&!source\.includes\(MONEY_WORKSPACE_SRC\)/,'V307 is scoped to workspace-fix delivery');

const appHtml=versionReleaseAssets('<html><head></head><body><main>App</main></body></html>',sha,{includeWorkspaceFixes:true});
assert(appHtml.includes('/js/money-workspace-v307.js?release='+sha),'app workspace receives SHA-bound V307 asset');
assert.equal((appHtml.match(/money-workspace-v307\.js/g)||[]).length,1,'V307 injection is idempotent within one decoration');
assert.equal(versionReleaseAssets(appHtml,sha,{includeWorkspaceFixes:true}),appHtml,'V307 decoration remains idempotent');
const publicHtml=versionReleaseAssets('<html><head></head><body>Public</body></html>',sha,{includeWorkspaceFixes:false});
assert.equal(publicHtml.includes('money-workspace-v307.js'),false,'public surface does not receive private Money workspace enhancement');

const base='<html><head></head><body>Surface</body></html>';
const appResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/app/'),new Response(base,{headers:{'content-type':'text/html'}}));
assert((await appResponse.text()).includes('money-workspace-v307.js'),'real /app response receives V307');
const homeResponse=await applyAssetReleaseIdentity(new Request('https://thebedesk.com/'),new Response(base,{headers:{'content-type':'text/html'}}));
assert.equal((await homeResponse.text()).includes('money-workspace-v307.js'),false,'real public root excludes V307');

console.log('PASS: V307 Money workspace is deterministic-first, read-only, fail-closed, mobile-accessible, app-scoped and release-bound');
