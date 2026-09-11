import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
assert.match(html,/v68 — full-viewport responsive layout hardening/);
for (const selector of ['.marketingnav,','.marketinghero,','.marketingsection,','.peopleproof,','.marketingfooter{']) {
  assert.ok(html.includes(selector),`missing full-width selector ${selector}`);
}
assert.match(html,/max-width:none!important;[\s\S]*margin-left:0!important;[\s\S]*margin-right:0!important;/);
assert.match(html,/main\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;/);
assert.match(html,/@media\(min-width:2200px\)/);
assert.match(html,/@media\(max-width:650px\)[\s\S]*--page-gutter:16px/);
assert.match(html,/\.featuregrid,.pricinggrid,.planmatrix\{grid-template-columns:1fr!important\}/);
console.log('full-viewport layout static checks passed');
