import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/owner-focus-strip-v294.js','utf8');
assert.match(source,/20261007-owner-focus-strip-v294/,'release identity must be explicit');
assert.match(source,/#ownerCommandCentre/,'strip must stay scoped to the owner command centre');
assert.match(source,/#ownerAttentionPanel|ATTENTION_ID="ownerAttentionPanel"/,'metrics must derive from the governed attention panel');
assert.match(source,/\.owner-panel-head \.badge/,'needs-action count must use the governed queue total instead of the truncated visual list');
assert.match(source,/Math\.max\(0,total-approvals\)/,'needs-action count must separate approvals from the governed total');
assert.match(source,/\.owner-review-inbox > \.owner-review-row/,'approvals must be counted from rendered governed reviews');
assert.match(source,/\.owner-outcome-loop > \.owner-outcome-row/,'pending outcomes must be counted separately');
assert.match(source,/node&&node\.textContent!==next/,'metric writes must not create MutationObserver feedback loops');
assert.match(source,/priority queue unavailable/i,'unavailable governed data must be represented explicitly');
assert.doesNotMatch(source,/fetch\s*\(|\/api\/ai\/operator\/queue/,'strip must not duplicate the governed queue API request');
assert.match(source,/thebeAiDock/,'Ask Thebe must reuse the existing dock');
assert.match(source,/@media\(max-width:760px\)/,'strip must have a mobile layout');

const sha='a'.repeat(40);
const html='<!doctype html><html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha,{includeWorkspaceFixes:true});
assert.match(decorated,new RegExp(`owner-focus-strip-v294\\.js\\?release=${sha}`),'workspace HTML must load the strip with release identity');
assert.equal((decorated.match(/owner-focus-strip-v294\.js/g)||[]).length,1,'strip must be injected exactly once');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'strip injection must remain idempotent');
assert.doesNotMatch(versionReleaseAssets(html,sha),/owner-focus-strip-v294\.js/,'strip must not load on public surfaces');

console.log('PASS: V294 owner focus strip is governed, app-scoped, mobile-ready, idempotent, accurate, observer-stable, and reuses the existing Thebe dock');
