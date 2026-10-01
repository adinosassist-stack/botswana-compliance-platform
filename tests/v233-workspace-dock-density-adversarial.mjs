import fs from "node:fs";
import assert from "node:assert/strict";

const dock=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");
const workspace=fs.readFileSync("public/assets/workspace-command-center-v231.css","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");

assert.match(production,/const THEBE_AI_DOCK_RELEASE="20261001-spatial-voice-v246";/,
  "V233 must rotate the dock stylesheet cache identity");

assert.match(dock,/V233 adversarial workspace density closure/);
assert.match(dock,/@media\(min-width:1180px\)\{[\s\S]*?--thebe-dock-w:376px[\s\S]*?margin-left:400px!important[\s\S]*?margin-left:524px!important/,
  "wide desktop must reserve only the compact dock lane and its explicit expanded lane");
assert.match(dock,/@media\(min-width:1024px\) and \(max-width:1179px\)\{[\s\S]*?--thebe-dock-w:320px[\s\S]*?margin-left:344px!important/,
  "medium desktop dock width must fit inside the reserved 344px workspace lane");
assert.match(dock,/#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-mode-button>small\{display:none\}/,
  "default desktop dock must suppress secondary mode prose");
assert.match(dock,/#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-quick button small\{display:none\}/,
  "default desktop dock must suppress quick-action helper prose");
assert.match(dock,/body\.thebe-ai-expanded #thebeAiDock\[data-surface="workspace"\] \.thebe-ai-mode-button>small,[\s\S]*?button small\{display:block\}/,
  "explicit expansion may reveal secondary command detail");
assert.match(dock,/#thebeAiDock\[data-surface="workspace"\] \.thebe-ai-orb-button\{[\s\S]*?width:68px!important[\s\S]*?height:68px!important/,
  "desktop voice affordance must stay compact rather than dominate the command surface");

assert.match(workspace,/V233 adversarial alignment closure/);
assert.match(workspace,/\.simplified-hub :is\(\.outcome-card,\.people-outcome-card,\.hub-card\)\{[\s\S]*?display:flex!important[\s\S]*?flex-direction:column!important/,
  "action cards must align their content and CTAs consistently");
assert.match(workspace,/body\.thebe-ai-dock-open #mainContent \.global-search\{[\s\S]*?min-width:min\(30vw,360px\)!important/,
  "top search must shrink inside the dock-safe workspace lane");
assert.doesNotMatch(workspace,/V233 adversarial alignment closure[\s\S]*?\.notice[^}]*display\s*:\s*none/i,
  "V233 must not hide workspace notices or safety boundaries");
assert.doesNotMatch(dock,/V233 adversarial workspace density closure[\s\S]*?gradient\(/i,
  "V233 dock closure must preserve the flat command-surface language");

console.log("PASS: V233 removes desktop dock overlap, reduces command-surface density and aligns workspace cards without hiding governed boundaries.");
