import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/owner-focus-strip-v296.js','utf8');
assert.match(source,/20261007-owner-focus-v2-v296/,'release identity must be explicit');
assert.match(source,/SHELL_ID="ownerCommandCentre"/,'strip must remain owner-command-centre scoped');
assert.match(source,/ATTENTION_ID="ownerAttentionPanel"/,'metrics must remain derived from the governed attention panel');
assert.match(source,/\.owner-panel-head \.badge/,'needs-action count must use the governed queue total instead of the truncated visual list');
assert.match(source,/Math\.max\(0,total-approvals\)/,'needs-action count must separate approvals from the governed total');
assert.match(source,/\.owner-review-inbox > \.owner-review-row/,'approvals must be counted from rendered governed reviews');
assert.match(source,/\.owner-outcome-loop > \.owner-outcome-row/,'pending outcomes must be counted from unresolved outcome rows only');
assert.match(source,/applyFilter\(activeFilter===key\?"all":key/,'metric controls must toggle exact queue filters');
assert.match(source,/data-owner-focus-filter/,'queue filtering must stay local to the governed attention panel');
assert.match(source,/aria-controls/,'metric controls must announce the governed queue they control');
assert.match(source,/aria-pressed/,'active queue state must be keyboard and screen-reader discoverable');
assert.match(source,/panelObserver\.observe\(observedPanel,\{childList:true,subtree:true,characterData:true\}\)/,'live resync must observe the attention panel only');
assert.doesNotMatch(source,/observe\(document\.body/,'V296 must not attach a global body MutationObserver');
assert.match(source,/requestAnimationFrame/,'observer-driven refreshes must be coalesced before rescanning');
assert.match(source,/priority queue unavailable/i,'unavailable governed data must remain explicit');
assert.doesNotMatch(source,/fetch\s*\(|\/api\/ai\/operator\/queue/,'strip must not duplicate the governed queue API request');
assert.match(source,/FILTERS\[activeFilter\]\?\.prompt/,'Ask Thebe must receive queue-aware context without duplicating backend authority');
assert.match(source,/thebeAiDock/,'Ask Thebe must reuse the existing dock');
assert.match(source,/@media\(max-width:760px\)/,'strip must retain a compact mobile layout');
assert.doesNotMatch(source,/propertyCalculator|property-calculator|calculator-shell/i,'Owner Focus must not modify Property calculator placement or logic');

const sha='b'.repeat(40);
const html='<!doctype html><html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha,{includeWorkspaceFixes:true});
assert.match(decorated,new RegExp(`owner-focus-strip-v296\\.js\\?release=${sha}`),'workspace HTML must load V296 with release identity');
assert.equal((decorated.match(/owner-focus-strip-v296\.js/g)||[]).length,1,'V296 must be injected exactly once');
assert.doesNotMatch(decorated,/owner-focus-strip-v295\.js/,'workspace HTML must not inject the superseded V295 strip');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'V296 injection must remain idempotent');
assert.doesNotMatch(versionReleaseAssets(html,sha),/owner-focus-strip-v296\.js/,'V296 must not load on public surfaces');

console.log('PASS: V296 Owner Focus v2 adds exact queue views, scoped/debounced observation, contextual Thebe handoff, app-only injection and preserves Property calculator placement');
