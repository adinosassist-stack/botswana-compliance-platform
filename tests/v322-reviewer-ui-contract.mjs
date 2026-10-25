import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync("public/assets/workspace-interactions-v318.css","utf8");

assert.match(css,/--thebe-control-accent:#0b66d6/);
assert.doesNotMatch(css,/--thebe-control-accent:#b42318/);
assert.match(css,/\.money-v307-shell\{[\s\S]*container-type:inline-size/);
assert.match(css,/@container \(max-width:900px\)[\s\S]*\.money-v307-work-grid[\s\S]*grid-template-columns:1fr!important/);
assert.match(css,/\.money-v307-badge\{[\s\S]*white-space:normal!important/);
assert.match(css,/\.money-v307-row>strong\{[\s\S]*white-space:normal!important/);
assert.match(css,/#thebeAiDock button[\s\S]*white-space:normal/);
assert.match(css,/html:has\(meta\[name="bw-runtime-mode"\]\[content="production"\]\)[\s\S]*\[data-bw-onclick\^="resetDemo\("\][\s\S]*display:none!important/);

console.log("v322 reviewer UI contract: PASS");
