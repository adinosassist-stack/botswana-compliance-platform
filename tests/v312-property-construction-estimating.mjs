import fs from "node:fs";
import assert from "node:assert/strict";

const base=fs.readFileSync("public/js/property-construction-v311.js","utf8");
const workflow=fs.readFileSync("public/js/property-construction-workflow-v312.js","utf8");
const baseCss=fs.readFileSync("public/assets/property-construction-v311.css","utf8");
const workflowCss=fs.readFileSync("public/assets/property-construction-workflow-v312.css","utf8");
const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");

assert.match(base,/20261010-property-construction-v311/);
assert.match(base,/Construction and development estimator/);
assert.match(base,/Confirmed construction rate \(P\/m²\)/);
assert.match(base,/No market rate is invented for you/);
assert.match(base,/VAT \/ tax assumption/);
assert.match(base,/A 10% construction-rate stress/);
assert.match(base,/This is the product coverage foundation, not a claim that full Africa-wide live intelligence is already available/);
assert.doesNotMatch(base,/fetch\(|XMLHttpRequest/,
  "Property construction presentation must not invent a backend data path");
assert.doesNotMatch(base,/\.innerHTML\s*=/,
  "Property construction presentation must preserve the DOM-safety boundary");

assert.match(workflow,/20261010-property-construction-workflow-v312/);
assert.match(workflow,/data-property-construction-tab/);
assert.match(workflow,/Estimating/);
assert.match(workflow,/Scope \/ takeoff/);
assert.match(workflow,/Itemized BOQ/);
assert.match(workflow,/Material \/ unit/);
assert.match(workflow,/Labor \/ unit/);
assert.match(workflow,/Quote \/ tender total/);
assert.match(workflow,/Projected gross margin/);
assert.match(workflow,/Approved for handoff/);
assert.match(workflow,/openView\("workhub"\)/);
assert.match(workflow,/openView\("moneyhub"\)/);
assert.match(workflow,/Prepare takeoff checklist with Thebe/);
assert.match(workflow,/Prepare quote \/ tender/);
assert.match(workflow,/Build project handoff/);
assert.match(workflow,/Do not infer quantities from drawings you cannot access/);
assert.match(workflow,/Supplier quotes, purchase orders, invoices, payments and contracts are not created by this panel/);
assert.doesNotMatch(workflow,/fetch\(|XMLHttpRequest|apiJson/,
  "Estimating workflow must not pretend supplier, procurement or finance writes exist");
assert.doesNotMatch(workflow,/\.innerHTML\s*=/,
  "Estimating workflow must use safe DOM construction");

assert.match(readiness,/property-construction-v311\.js/);
assert.match(readiness,/property-construction-workflow-v312\.js/);
assert.match(readiness,/\.then\(\(\)=>import/,
  "V312 workflow must load only after the V311 construction base");

assert.match(baseCss,/\.property-construction-v311/);
assert.match(workflowCss,/#propertyintelligence\[data-property-construction-mode="estimating"\]/);
assert.match(workflowCss,/construction-boq-row-v312/);
assert.match(workflowCss,/construction-workflow-metrics-v312/);
assert.match(workflowCss,/@media\(max-width:640px\)/);
assert.doesNotMatch(workflowCss,/linear-gradient|radial-gradient/,
  "Property estimating containers should remain flat and gradient-free");

console.log("PASS: V312 keeps construction estimating nested under Property, adds truthful itemized BOQ/quote/margin/project handoff support, and preserves safe non-fabricated data boundaries.");
