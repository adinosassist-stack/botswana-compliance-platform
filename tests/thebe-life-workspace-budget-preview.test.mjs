import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../public/js/thebe-life-workspace-preview.js',import.meta.url),'utf8');
test('Life preview stays an explicitly mounted, offline-only workspace module',()=>{
  assert.doesNotThrow(()=>new vm.Script(code));
  assert.match(code,/ThebeLifeWorkspacePreview=Object\.freeze/);
  assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|navigator\.sendBeacon/);
});
test('overview and household display the same derived demo budget, not a hardcoded balance',()=>{
  assert.match(code,/const budget=\(\)=>/);
  assert.match(code,/remainingMinor:incomeMinor-spentMinor-commitmentMinor/);
  assert.match(code,/format\(budget\(\)\.remainingMinor\/100\)/);
  assert.match(code,/not bank balance/);
});
