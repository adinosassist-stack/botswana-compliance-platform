import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const css=fs.readFileSync("public/assets/workspace-home-command-v238.css","utf8");

assert.match(production,/const WORKSPACE_HOME_COMMAND_V238_CSS_ASSET="\/assets\/workspace-home-command-v238\.css";/,
  "V238 must publish a dedicated Home command-canvas stylesheet");
assert.match(production,/const workspaceHomeCommandV238CssHref=WORKSPACE_HOME_COMMAND_V238_CSS_ASSET;/,
  "V238 stylesheet must have a dedicated injected href");
assert.match(production,/if\(!source\.includes\(WORKSPACE_HOME_COMMAND_V238_CSS_ASSET\)\)source=injectBeforeFinalClosingTag\(source,"head",`<link rel="stylesheet" href="\$\{workspaceHomeCommandV238CssHref\}" \/>\\n`\);/,
  "authenticated workspace asset injection must include V238");

assert.match(css,/#dashboard\{[\s\S]*width:min\(100%,1180px\)!important;/,
  "Home content must have a readable maximum width");
assert.match(css,/#dashboard>.owner-command-hero\{[\s\S]*padding:22px 24px 54px!important;/,
  "hero must reserve visual space for the integrated command surface");
assert.match(css,/#dashboard \.home-thebe-agent\{[\s\S]*margin:-38px auto 12px!important;/,
  "Thebe command surface must visually bridge the hero and dashboard");
assert.match(css,/#dashboard \.home-thebe-agent-compose::before\{[\s\S]*background:#0b66d6!important;/,
  "Thebe command bar must retain a compact brand-presence cue without extra text");
assert.match(css,/@media\(max-width:620px\)\{[\s\S]*home-thebe-agent[\s\S]*margin:-25px auto 9px!important;/,
  "mobile command canvas must keep the overlap compact");
assert.doesNotMatch(css,/\.notice[^}]*display\s*:\s*none/i,
  "V238 must not hide fail-closed or safety notices");

console.log("PASS: V238 integrates Home greeting and Thebe into one compact command canvas.");
