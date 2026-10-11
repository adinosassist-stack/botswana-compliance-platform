import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/owner-focus-strip-v296.js','utf8');
assert.match(source,/20261007-owner-focus-v(?:2-v296|3-v303)/,'historical compatible Owner Focus release identity must remain explicit');
assert.match(source,/20261011-owner-focus-canonical-v327/,'canonical payload-driven release identity must be explicit');
assert.match(source,/SHELL_ID="ownerCommandCentre"/,'strip must remain owner-command-centre scoped');
assert.match(source,/ATTENTION_ID="ownerAttentionPanel"/,'rendering and navigation must remain scoped to the governed attention panel');

assert.match(source,/global\.apiJson\("\/api\/daily-brief"\)/,'Owner Focus truth must come from the authenticated Daily Brief canonical payload');
assert.match(source,/dailyResult\?\.value\?\.ownerAttention/,'Owner Focus must consume the server-built Owner Attention projection directly');
assert.doesNotMatch(source,/global\.apiJson\("\/api\/agentic\/runs"\)/,'browser must not reconstruct approval truth from a second API');
assert.doesNotMatch(source,/global\.apiJson\("\/api\/agentic\/outcomes"\)/,'browser must not reconstruct outcome truth from a second API');
assert.doesNotMatch(source,/global\.apiJson\("\/api\/business-context\/brief"\)/,'browser must not reconstruct recommendation truth from a second API');
assert.doesNotMatch(source,/daily\?\.status\?\.openWork/,'browser must not reconstruct action counts from Daily Brief fields outside the canonical projection');
assert.match(source,/Owner Focus never recomputes authoritative queue facts in the browser/,'browser business-truth boundary must be explicit');
assert.match(source,/owner_attention_missing/,'missing canonical projection must fail closed');
assert.match(source,/owner_attention_ready_counts_invalid/,'malformed ready counts must fail closed');
assert.match(source,/value==null\?"—":String\(value\)/,'unavailable authoritative counts must render unknown rather than zero');
assert.match(source,/Priority data incomplete — retry to verify/,'incomplete canonical data must be explicit');

assert.match(source,/\.owner-review-inbox > \.owner-review-row/,'rendered approvals must remain available for filter-aware navigation');
assert.match(source,/\.owner-outcome-loop > \.owner-outcome-row/,'rendered outcomes must remain available for filter-aware navigation');
assert.match(source,/\.owner-attention-list > \.owner-attention-item/,'rendered actions must remain available for filter-aware navigation');
assert.match(source,/applyFilter\(activeFilter===key\?"all":key/,'metric controls must toggle exact queue filters');
assert.match(source,/data-owner-focus-filter/,'queue filtering must stay local to the governed attention panel');
assert.match(source,/aria-controls/,'metric controls must announce the governed queue they control');
assert.match(source,/aria-pressed/,'active queue state must be keyboard and screen-reader discoverable');
assert.match(source,/panelObserver\.observe\(observedPanel,\{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:\["datetime","data-created-at","data-updated-at"\]\}\)/,'live rendering resync must remain scoped to bounded attention-panel evidence');
assert.doesNotMatch(source,/observe\(document\.body/,'Owner Focus must not attach a global body MutationObserver');
assert.match(source,/requestAnimationFrame/,'observer-driven refreshes must remain frame-debounced');
assert.match(source,/priority queue unavailable/i,'unavailable rendered queue state must remain explicit');
assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/,'Owner Focus must use the existing secure API transport rather than bypassing it');
assert.doesNotMatch(source,/\/api\/ai\/operator\/queue/,'strip must not duplicate the governed AI queue request');
assert.match(source,/FILTERS\[activeFilter\]\?\.prompt/,'Ask Thebe must receive queue-aware context without duplicating backend authority');
assert.match(source,/thebeAiDock/,'Ask Thebe must reuse the existing dock');
assert.match(source,/@media\(max-width:760px\)/,'strip must retain a compact mobile layout');
assert.doesNotMatch(source,/propertyCalculator|property-calculator|calculator-shell/i,'Owner Focus must not modify Property calculator placement or logic');

const sha='b'.repeat(40);
const html='<!doctype html><html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha,{includeWorkspaceFixes:true});
assert.match(decorated,new RegExp(`owner-focus-strip-v296\\.js\\?release=${sha}`),'workspace HTML must load V296 asset path with release identity');
assert.equal((decorated.match(/owner-focus-strip-v296\.js/g)||[]).length,1,'Owner Focus asset must be injected exactly once');
assert.doesNotMatch(decorated,/owner-focus-strip-v295\.js/,'workspace HTML must not inject the superseded V295 strip');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'Owner Focus injection must remain idempotent');
assert.doesNotMatch(versionReleaseAssets(html,sha),/owner-focus-strip-v296\.js/,'Owner Focus must not load on public surfaces');

console.log('PASS: Owner Focus preserves scoped navigation while consuming only canonical Owner Attention backend truth');