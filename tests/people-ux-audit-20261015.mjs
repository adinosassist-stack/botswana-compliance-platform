import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('public/assets/people-ux-audit-20261015.css','utf8');
const js=fs.readFileSync('public/js/people-directory-ux-20261015.js','utf8');
const historical=fs.readFileSync('public/assets/people-infographics-20261003.css','utf8');
const injector=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');

assert.match(historical,/#e2a342/i,'historical People infographic asset remains immutable');
assert.match(css,/--people-ink:#18375a/,'People uses current workspace navy');
assert.match(css,/--people-accent:#3377bd/,'People uses current workspace blue accent');
assert.match(css,/--people-muted:#526a86/,'People uses current workspace muted blue');
assert.match(css,/--people-line:#dce7f5/,'People uses current workspace border blue');
assert.match(css,/--people-soft:#edf3fb/,'People uses current workspace soft blue');
assert.doesNotMatch(css,/#(?:d92d20|b42318|8f1d16|c7ef32)/i,'People live override must not restore red or lime accents');
assert.doesNotMatch(css,/\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i,'People live override must not introduce decorative gradients');
assert.match(css,/\.people-reporting-pulse\{[\s\S]*?border-left:4px solid var\(--people-accent\)/,'reporting health receives clear priority treatment');
assert.match(css,/\.people-info-dot\.pending,[\s\S]*?background:var\(--people-accent\)/,'legacy amber pending marker is normalized to the blue palette');
assert.match(css,/@media\(max-width:430px\)[\s\S]*?\.people-status-strip\{grid-template-columns:1fr!important\}/,'very narrow mobile status cards stack instead of crowding');
assert.match(css,/\.employee-directory-tools-v20261015\{/,'employee directory search toolbar has a styled contract');
assert.match(css,/:is\(button,input,select,summary\):focus-visible/,'People and employee controls preserve visible keyboard focus');

assert.match(js,/type="search"/,'directory UX mounts a native search input');
assert.match(js,/querySelectorAll\(":scope > \.item"\)/,'directory search is scoped to rendered employee cards only');
assert.match(js,/item\.hidden=!match/,'directory search filters locally without mutating employee data');
assert.match(js,/role","status"/,'directory search result count is announced accessibly');
assert.match(js,/MutationObserver/,'directory filtering stays correct when employee cards hydrate later');
assert.doesNotMatch(js,/fetch\s*\(|XMLHttpRequest|\/api\//,'directory search adds no network or backend data path');

const audit=injector.indexOf('/assets/workspace-audit-refinements-20261013.css');
const peopleCss=injector.indexOf('/assets/people-ux-audit-20261015.css');
const peopleJs=injector.indexOf('/js/people-directory-ux-20261015.js');
assert(audit>=0&&peopleCss>audit,'People CSS loads after the legacy workspace audit so the current palette wins');
assert(peopleJs>=0,'People directory UX script is injected');
const fixesBlock=injector.indexOf('if(options?.includeWorkspaceFixes===true){');
const fixesBlockEnd=injector.indexOf('\n  }',fixesBlock);
assert(fixesBlock>=0&&peopleCss>fixesBlock&&peopleCss<fixesBlockEnd,'People CSS remains app-only inside includeWorkspaceFixes');
assert(peopleJs>0&&injector.lastIndexOf('includeWorkspaceFixes===true',peopleJs)>0,'People directory UX remains gated to the app workspace');

console.log('PASS People UX audit: current palette, responsive hierarchy and local employee search are protected');
