import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const harness=fs.readFileSync(new URL('../scripts/onboarding-mobile-matrix-2781.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/mobile-postdeploy-smoke.yml',import.meta.url),'utf8');

test('synthetic acceptance matrix exercises requested CSS widths and a separately labelled zoom approximation',()=>{
  assert.match(harness,/const widths=\[320,375,414,430,768\]/);
  assert.match(harness,/approxZoom\?Math\.floor\(width\/2\):width/);
  assert.match(harness,/actualBrowserZoomTested:false/);
  assert.match(harness,/realAndroidTested:false/);
  assert.match(harness,/productionSessionUsed:false/);
});
test('synthetic suite checks touch targets, focus order, occlusion and safe guide switching',()=>{
  for(const phrase of [
    "width>=44&&m.height>=44",
    "document.elementFromPoint",
    "page.keyboard.press('Tab')",
    "getAttribute('aria-pressed')",
    "ownerFirstDocumentSteps li",
    "scrollWidth-document.documentElement.clientWidth"
  ])assert.ok(harness.includes(phrase),phrase);
});
test('synthetic owner/manager/error scenarios are read-only and role-gated',()=>{
  assert.match(harness,/const syntheticUser=\{role:'owner'/);
  assert.match(harness,/const syntheticData=/);
  assert.match(harness,/role of \['manager','viewer'\]/);
  assert.match(harness,/window\.__fixture\.fail=true/);
  assert.match(harness,/window\.__fixture\.user\.role='manager'/);
  assert.match(harness,/assert\.equal\(x\.method,'GET'/);
  assert.doesNotMatch(harness,/https:\/\/thebedesk\.com|\/api\/quotation\/drafts|\/api\/invoice\/issue|CLOUDFLARE_API_TOKEN/);
});
test('workflow runs synthetic acceptance and labels evidence as synthetic',()=>{
  assert.ok(workflow.includes('node scripts/onboarding-mobile-matrix-2781.mjs'));
  assert.ok(workflow.includes('node --test tests/onboarding-mobile-matrix-2781-static.test.mjs'));
  assert.ok(workflow.includes('onboarding-2781-synthetic'));
  assert.match(workflow,/actions\/upload-artifact@v4/);
});