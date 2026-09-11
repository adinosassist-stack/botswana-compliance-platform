import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const preview=fs.readFileSync(new URL('../preview/preview-api.js',import.meta.url),'utf8');
test('standalone auth uses preview transport while production keeps the same runtime client alias',()=>{
  assert.match(html,/const runtimeApiClient=STANDALONE_PREVIEW\?.*BW\.preview\.request.*:productionApiClient/);
  assert.match(html,/runtimeApiClient\.request\(`\/api\/auth\/\$\{submittingMode\}`/);
  assert.match(html,/runtimeApiClient\.request\("\/api\/auth\/login"/);
  assert.match(html,/if\(STANDALONE_PREVIEW\)\{[\s\S]{0,1800}nextStore\.activeRole=role/);
});
test('preview exposes owner manager reviewer auditor and multi-workspace selection',()=>{
  for(const role of ['owner','manager','reviewer','auditor'])assert.ok(preview.includes(`${role}@preview.local`));
  assert.match(preview,/workspace_selection_required/);
  assert.match(preview,/preview-manager-workspace/);
});
test('standalone social auth cannot navigate into a nonexistent backend',()=>{
  assert.match(html,/STANDALONE_PREVIEW\|\|location\.protocol==="file:"/);
});
