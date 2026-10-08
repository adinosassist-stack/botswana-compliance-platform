import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const assetsDir='public/assets';
const propertyCss=fs.readdirSync(assetsDir)
  .filter(name=>/^property.*\.css$/i.test(name))
  .sort();

assert(propertyCss.length>=6,'expected Property CSS assets');
const gradient=/\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i;
const violations=[];
for(const name of propertyCss){
  const source=fs.readFileSync(path.join(assetsDir,name),'utf8');
  if(gradient.test(source))violations.push(name);
}
assert.deepEqual(violations,[],'Property CSS must use solid fills only; gradient declarations found in: '+violations.join(', '));

const visibility=fs.readFileSync(path.join(assetsDir,'property-visibility-v230.css'),'utf8');
const operations=fs.readFileSync(path.join(assetsDir,'property-operations-v262.css'),'utf8');
const compact=fs.readFileSync(path.join(assetsDir,'property-calculator-compact-v223.css'),'utf8');
assert.match(visibility,/\.property-yield-ring-v261\{[\s\S]*background:var\(--property-accent/,'Today yield ring stays a solid accent ring');
assert.match(operations,/\.property-ops-ring-v262\{[\s\S]*background:var\(--property-accent/,'Operations readiness ring stays a solid accent ring');
assert.match(compact,/#propertyintelligence\.property-compact-v260[\s\S]*background-image:none!important/,'Property solid-fill override remains present');

console.log(`PASS V312: ${propertyCss.length} Property CSS assets contain no gradient declarations; Today and Operations KPI rings use solid fills`);
