import fs from 'node:fs';
import assert from 'node:assert/strict';

const dock=fs.readFileSync('public/assets/thebe-spatial-dock-v246.css','utf8');
const property=fs.readFileSync('public/js/property-visibility-v230.js','utf8');

assert.match(dock,/V269: reserve the assistant lane at the workspace-shell boundary/);
assert.match(dock,/body\.thebe-ai-dock-open #appShell[\s\S]*padding-right:calc\(var\(--thebe-spatial-width\) \+ 32px\)!important/);
assert.match(dock,/body\.thebe-ai-dock-open #appShell main[\s\S]*width:100%!important/);
assert.match(property,/PROPERTY_PANES=new Set\(\["today","properties","analyse","operations","optimise","compare"\]\)/);
for(const asset of ['property-operations-v262.css','property-optimise-v263.css','property-compare-v264.css']) assert.ok(property.includes(asset),`missing Property workspace asset ${asset}`);
for(const release of ['property-operations-v262','property-optimise-v263','property-compare-v264']) assert.ok(property.includes(release),`missing Property release marker ${release}`);
console.log('V269 dock rail and Property refresh regression passed');
