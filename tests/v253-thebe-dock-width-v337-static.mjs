import assert from "node:assert/strict";
import fs from "node:fs";

const interactionCss=fs.readFileSync("public/assets/workspace-interactions-v318.css","utf8");
const spatialCss=fs.readFileSync("public/assets/thebe-spatial-dock-v246.css","utf8");

assert.match(interactionCss,/V337: make the existing expand\/restore control a useful workspace-width choice/,
  "V337 workspace dock width contract must be present");
assert.match(interactionCss,/@media \(min-width:1200px\)[\s\S]*--thebe-spatial-width:380px!important[\s\S]*--thebe-spatial-width:480px!important/,
  "wide desktop workspace dock must offer 380px default and 480px expanded widths");
assert.match(interactionCss,/@media \(min-width:1024px\) and \(max-width:1199px\)[\s\S]*--thebe-spatial-width:320px!important[\s\S]*--thebe-spatial-width:380px!important/,
  "medium desktop workspace dock must stay bounded at 320px default and 380px expanded");
assert.match(interactionCss,/#thebeAiDock\[data-surface="workspace"\]/,
  "width override must be scoped to the signed-in workspace surface");
assert.doesNotMatch(interactionCss,/V337[\s\S]{0,1200}@media \(max-width:1023px\)[\s\S]{0,300}--thebe-spatial-width/,
  "V337 must not alter the mobile dock width contract");

assert.match(spatialCss,/width:var\(--thebe-spatial-width\)!important/,
  "spatial dock must consume the shared width variable");
assert.match(spatialCss,/padding-right:calc\(var\(--thebe-spatial-width\) \+ 32px\)!important/,
  "workspace shell must reserve the same width used by the dock");
assert.match(spatialCss,/body\.thebe-ai-expanded\{--thebe-spatial-width:/,
  "existing expand/restore state must remain the adjustment control");

console.log("v253 Thebe dock width v337 static checks passed");
