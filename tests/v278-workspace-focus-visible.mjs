import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

const source=fs.readFileSync('public/js/workspace-focus-visible-v278.js','utf8');
assert.match(source,/20261004-workspace-focus-visible-v278/,'V278 release identity must be explicit');
assert.match(source,/#appShell/,'workspace shell must be covered');
assert.match(source,/#thebeAiDock/,'Thebe dock controls must be covered');
assert.match(source,/#thebeAiDockPill:focus-visible/,'collapsed Thebe entry control must be covered');
assert.match(source,/:focus-visible/,'keyboard modality must use :focus-visible');
assert.doesNotMatch(source,/:focus(?!-visible)/,'guard must not force focus rings for generic mouse focus');
assert.match(source,/forced-colors:active/,'high-contrast forced-colors mode must be supported');
assert.match(source,/outline:3px solid #ffffff!important/,'two-tone focus treatment must include a light inner ring');
assert.match(source,/box-shadow:0 0 0 6px #075985!important/,'two-tone focus treatment must include a dark outer ring');

const sha='a'.repeat(40);
const html='<!doctype html><html><head></head><body><main>Workspace</main></body></html>';
const decorated=versionReleaseAssets(html,sha,{includeWorkspaceFixes:true});
assert.match(decorated,new RegExp(`workspace-focus-visible-v278\\.js\\?release=${sha}`),'workspace HTML must load the focus guard with release identity');
assert.equal((decorated.match(/workspace-focus-visible-v278\.js/g)||[]).length,1,'focus guard must be injected exactly once');
assert.equal(versionReleaseAssets(decorated,sha,{includeWorkspaceFixes:true}),decorated,'focus guard injection must remain idempotent');

const publicOnly=versionReleaseAssets(html,sha);
assert.doesNotMatch(publicOnly,/workspace-focus-visible-v278\.js/,'focus guard must stay scoped to workspace/app surfaces');

console.log('PASS: V278 release-bound focus-visible guard covers workspace and Thebe keyboard controls without generic mouse-focus styling');
