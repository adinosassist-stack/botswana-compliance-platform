import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const assetsDir='public/assets';
const visibility=fs.readFileSync(path.join(assetsDir,'property-visibility-v230.css'),'utf8');
const operations=fs.readFileSync(path.join(assetsDir,'property-operations-v262.css'),'utf8');
const override=fs.readFileSync(path.join(assetsDir,'property-solid-surfaces-v312.css'),'utf8');
const injector=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');

assert.match(visibility,/\.property-yield-ring-v261\{[\s\S]*?background:conic-gradient\(/,'V230 historical yield-ring contract remains immutable');
assert.match(operations,/\.property-ops-ring-v262\{[\s\S]*?background:conic-gradient\(/,'V262 historical readiness-ring contract remains immutable');

const gradient=/\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i;
assert.equal(gradient.test(override),false,'V312 override must not introduce gradients');
assert.match(override,/--property-accent:#d92d20/,'V312 uses the current Thebe red accent');
assert.doesNotMatch(override,/#c7ef32/,'V312 must not restore the retired lime Property accent');
assert.doesNotMatch(override,/#[0-9a-f]*8b[0-9a-f]*/i,'V312 must not introduce a purple accent');
assert.match(override,/\.property-yield-ring-v261/,'V312 overrides the Today yield ring');
assert.match(override,/\.property-ops-ring-v262/,'V312 overrides the Operations readiness ring');
assert.match(override,/background:\s*var\(--property-accent,#d92d20\)!important/,'V312 uses the Property red accent as a solid infographic fill');
assert.match(override,/background-image:\s*none/,'V312 explicitly removes historical gradient images');
assert.match(override,/\.property-hero-compact,[\s\S]*?background:#fff!important/,'Property hero is a light solid surface');
assert.match(override,/\[data-property-tool\]\[aria-pressed="true"\]/,'active Property tools receive an explicit selected state');
assert.match(override,/data-property-active-pane="optimise"[\s\S]*?data-property-pane="optimise"/,'Optimise pane is isolated from sibling panes');
assert.match(override,/data-property-active-pane="compare"[\s\S]*?data-property-pane="compare"/,'Compare pane is isolated from sibling panes');
assert.match(override,/:is\(input,select,textarea\):focus[\s\S]*?border-color:var\(--property-accent\)/,'Property form controls expose a visible focus state');

const v309=injector.indexOf("/assets/workspace-infographics-v309.css");
const v311=injector.indexOf("/assets/workspace-shell-alignment-v311.css");
const v312=injector.indexOf("/assets/property-solid-surfaces-v312.css");
assert(v309>=0&&v311>v309&&v312>v311,'V312 stylesheet is injected after V309 and V311 workspace styles');
const fixesBlock=injector.indexOf('if(options?.includeWorkspaceFixes===true){');
const fixesBlockEnd=injector.indexOf('\n  }',fixesBlock);
assert(fixesBlock>=0&&v312>fixesBlock&&v312<fixesBlockEnd,'V312 remains app-only inside includeWorkspaceFixes');

console.log('PASS V312: Property uses solid light/red surfaces and isolates all runtime panes without mutating historical assets');
