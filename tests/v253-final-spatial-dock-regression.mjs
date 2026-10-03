import fs from "node:fs";
import assert from "node:assert/strict";

const spatial=fs.readFileSync("public/assets/thebe-spatial-dock-v246.css","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

assert.match(spatial,/V253 pre-release workspace lane closure/,
  "V253 final-loaded spatial stylesheet must own the medium-desktop dock lane");
assert.match(spatial,/@media\(min-width:1024px\) and \(max-width:1199px\)\{[\s\S]*?--thebe-spatial-width:256px[\\s\\S]*?body\\.thebe-ai-expanded\\{--thebe-spatial-width:324px\}/,
  "medium desktop must keep the normal and expanded Thebe dock compact");
assert.match(spatial,/body\.thebe-ai-dock-open #mainContent \.global-search\{[\s\S]*?min-width:0!important;[\s\S]*?max-width:260px!important;[\s\S]*?flex:1 1 220px!important;/,
  "workspace search must remain shrinkable inside the reserved final dock lane");
assert.match(spatial,/body\.thebe-ai-dock-open #appShell main,body\.thebe-ai-dock-open\.thebe-ai-expanded #appShell main\{[\s\S]*?margin-right:calc\\(var\\(--thebe-spatial-width\\) \\+ (?:28|32)px\\)!important;[\\s\\S]*?width:calc\\(100% - var\\(--thebe-spatial-width\\) - (?:28|32)px\\)!important;/,
  "final-loaded stylesheet must reserve rather than overlay the workspace content lane");
assert.match(spatial,/body \.modal\.open,body \.commandshade\.open\{z-index:1000!important\}/,
  "governed business dialogs must remain above the resident assistant");
assert.match(production,/thebe-spatial-dock-v246\.css\?v=20261002-v253/g,
  "both public and authenticated asset injectors must cache-bust the V253 final spatial stylesheet");
assert.equal((production.match(/thebe-spatial-dock-v246\.css\?v=20261002-v253/g)||[]).length,2,
  "public and authenticated surfaces must receive the same V253 spatial asset identity");
assert(packageJson.scripts["test:release-regressions"].includes("tests/v253-final-spatial-dock-regression.mjs"),
  "V253 final spatial guard must execute before release");

console.log("PASS: V253 guards the final-loaded dock lane before production and preserves medium-desktop workspace width.");
