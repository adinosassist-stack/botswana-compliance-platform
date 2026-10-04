import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets,applyAssetReleaseIdentity} from '../cloudflare/src/asset-release-identity.js';

const guard=fs.readFileSync('public/js/workspace-text-layout-guard-v276.js','utf8');
const releaseSource=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');

assert.match(guard,/workspace-text-layout-v276/);
assert.match(guard,/#mainContent/,'guard must stay scoped to workspace content');
assert.match(guard,/min-width:0/,'grid and flex children must be allowed to shrink');
assert.match(guard,/overflow-wrap:anywhere/,'long workspace copy must wrap safely');
assert.match(guard,/-webkit-line-clamp:unset!important/,'information copy must not remain line-clamped');
assert.match(guard,/overflow:visible!important/,'information copy must remain visible');
assert.match(guard,/white-space:normal!important/,'information copy must wrap instead of clipping');
assert.match(guard,/@media\(max-width:620px\)/,'phone layout must have an explicit compact breakpoint');
assert.match(guard,/grid-template-columns:minmax\(0,1fr\)!important/,'dense phone grids must stack without min-content overflow');
assert.doesNotMatch(guard,/(?:^|\n)\s*\*\s*\{/,'guard must not use a top-level universal style reset');
assert.doesNotMatch(guard,/thebeLiveVoice|thebe-dock|spatial-dock/i,'guard must not alter dock or voice geometry');
assert.doesNotMatch(guard,/position\s*:\s*(?:fixed|absolute)/i,'guard must not introduce overlay geometry');

assert.match(releaseSource,/WORKSPACE_TEXT_LAYOUT_SRC='\/js\/workspace-text-layout-guard-v276\.js'/);
assert.match(releaseSource,/includeWorkspaceFixes/);

const sha='a'.repeat(40);
const html='<html><head></head><body><main id="mainContent"></main></body></html>';
const decorated=versionReleaseAssets(html,sha,{includeWorkspaceFixes:true});
assert.match(decorated,new RegExp('workspace-text-layout-guard-v276\\.js\\?release='+sha));
assert.equal((decorated.match(/workspace-text-layout-guard-v276\.js/g)||[]).length,1,'guard is injected once');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'guard injection remains idempotent');

const appResponse=await applyAssetReleaseIdentity(
  new Request('https://thebedesk.com/app'),
  new Response(html,{headers:{'content-type':'text/html'}})
);
assert.match(await appResponse.text(),/workspace-text-layout-guard-v276\.js/,'workspace app receives V276 guard');

for(const path of ['/','/pricing/','/auth/']){
  const response=await applyAssetReleaseIdentity(
    new Request('https://thebedesk.com'+path),
    new Response(html,{headers:{'content-type':'text/html'}})
  );
  assert.doesNotMatch(await response.text(),/workspace-text-layout-guard-v276\.js/,`${path} must not receive workspace-only guard`);
}

console.log('V276_WORKSPACE_TEXT_LAYOUT_GUARD_PASS: app-only guard removes information clipping without touching dock geometry');
