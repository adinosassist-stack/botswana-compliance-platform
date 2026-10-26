import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const s=readFileSync(new URL('../public/js/thebe-dock-recovery-geometry-v269.js',import.meta.url),'utf8');
test('floating dock only enables on healthy desktop workspace surface',()=>{
  assert.match(s,/dock\.dataset\.surface==="workspace"&&viewportWidth\(\)>=1024&&spatialStylesheetHealthy\(dock\)/);
  assert.match(s,/viewportWidth\(\)<1024\|\|dock\.dataset\.surface!=="workspace"/);
});
test('drag persistence can be reset and position clamps to viewport',()=>{
  assert.match(s,/WORKSPACE_POSITION_KEY/);
  assert.match(s,/setPointerCapture/);
  assert.match(s,/pointercancel/);
  assert.match(s,/removeItem\?\.\(WORKSPACE_POSITION_KEY\)/);
  assert.match(s,/Math\.max\(8,Math\.min\(Math\.round\(position\.x\)/);
});
