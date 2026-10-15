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
assert.match(override,/--property-ink:#18375a/,'V312 uses the current workspace navy ink');
assert.match(override,/--property-muted:#526a86/,'V312 uses the current workspace muted blue');
assert.match(override,/--property-line:#dce7f5/,'V312 uses the current workspace border blue');
assert.match(override,/--property-accent:#3377bd/,'V312 uses the current workspace blue accent');
assert.match(override,/--property-accent-soft:#edf3fb/,'V312 uses the current workspace soft blue');
assert.doesNotMatch(override,/#d92d20/i,'V312 must not introduce the rejected red accent');
assert.doesNotMatch(override,/#c7ef32/i,'V312 must not restore the retired lime Property accent');
assert.match(override,/\.property-yield-ring-v261/,'V312 overrides the Today yield ring');
assert.match(override,/\.property-ops-ring-v262/,'V312 overrides the Operations readiness ring');
assert.match(override,/background:\s*var\(--property-accent,#3377bd\)!important/,'V312 uses the workspace blue accent as a solid infographic fill');
assert.match(override,/background-image:\s*none/,'V312 explicitly removes historical gradient images');
assert.match(override,/\.property-hero-compact,[\s\S]*?min-height:112px!important[\s\S]*?background:#fff!important/,'Property hero is compact and uses a light solid surface');
assert.match(override,/data-property-active-pane="today"[\s\S]*?\.property-analysis-tools-v272,[\s\S]*?data-property-active-pane="operations"[\s\S]*?\.property-analysis-tools-v272\{display:none!important\}/,'analysis sub-navigation is hidden outside Analyse modes');
assert.match(override,/data-property-active-pane="analyse"[\s\S]*?nth-child\(1\)[\s\S]*?data-property-active-pane="optimise"[\s\S]*?nth-child\(2\)[\s\S]*?data-property-active-pane="compare"[\s\S]*?nth-child\(3\)/,'analysis sub-navigation exposes the active mode visually');
assert.match(override,/data-property-active-pane="today"[\s\S]*?property-overview-actions-v261[\s\S]*?nth-child\(4\)\{display:none!important\}/,'Today removes the duplicate Compare shortcut');
assert.match(override,/data-property-active-pane="today"[\s\S]*?property-overview-actions-v261[\s\S]*?nth-child\(2\)[\s\S]*?background:var\(--property-accent\)!important/,'Today makes Analyse the clear next action');
assert.match(override,/data-property-active-pane="optimise"[\s\S]*?data-property-pane="optimise"/,'Optimise pane is isolated from sibling panes');
assert.match(override,/data-property-active-pane="compare"[\s\S]*?data-property-pane="compare"/,'Compare pane is isolated from sibling panes');
assert.match(override,/:is\(input,select,textarea\):focus[\s\S]*?border-color:var\(--property-accent\)/,'Property form controls expose a visible focus state');
assert.match(override,/property-yield-value-v261,[\s\S]*?property-ops-readiness-value-v262\{color:var\(--property-ink\)!important\}/,'light KPI centres keep readable dark values');
assert.match(override,/@media\(max-width:760px\)[\s\S]*?property-analysis-tools-v272[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,'analysis sub-navigation remains compact on mobile');
assert.match(override,/@media\(max-width:760px\)[\s\S]*?property-overview-metrics-v261\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/,'Today metrics reflow to two columns on mobile');

const v309=injector.indexOf("/assets/workspace-infographics-v309.css");
const v311=injector.indexOf("/assets/workspace-shell-alignment-v311.css");
const v312=injector.indexOf("/assets/property-solid-surfaces-v312.css");
assert(v309>=0&&v311>v309&&v312>v311,'V312 stylesheet is injected after V309 and V311 workspace styles');
const fixesBlock=injector.indexOf('if(options?.includeWorkspaceFixes===true){');
const fixesBlockEnd=injector.indexOf('\n  }',fixesBlock);
assert(fixesBlock>=0&&v312>fixesBlock&&v312<fixesBlockEnd,'V312 remains app-only inside includeWorkspaceFixes');

console.log('PASS V312: Property matches the workspace palette, uses a clear analysis hierarchy, and preserves pane isolation without mutating historical assets');
