import "./v304-workspace-bootstrap-contract.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const css=fs.readFileSync("public/assets/workspace-reference-shell-v237.css","utf8");

assert.match(production,/const WORKSPACE_REFERENCE_SHELL_V237_CSS_ASSET="\/assets\/workspace-reference-shell-v237\.css";/,
  "V237 must publish a cache-safe reference-shell stylesheet");
assert.match(production,/const workspaceReferenceShellV237CssHref=WORKSPACE_REFERENCE_SHELL_V237_CSS_ASSET;/,
  "V237 stylesheet must have a dedicated injected href");
assert.match(production,/if\(!source\.includes\(WORKSPACE_REFERENCE_SHELL_V237_CSS_ASSET\)\)source=injectBeforeFinalClosingTag\(source,"head",`<link rel="stylesheet" href="\$\{workspaceReferenceShellV237CssHref\}" \/>\\n`\);/,
  "authenticated workspace asset injection must include V237");

assert.match(css,/#mainContent \.global-search\{[\s\S]*min-width:220px!important;[\s\S]*max-width:280px!important;/,
  "desktop search must stop consuming a large share of the header");
assert.match(css,/#mainContent \.global-search \.searchhint\{[\s\S]*display:none!important;/,
  "redundant keyboard hint must stay out of the default header scan");
assert.match(css,/#dashboard \.home-thebe-agent-quick \.btn:nth-child\(n\+4\)\{[\s\S]*display:none!important;/,
  "Home must expose at most three Thebe quick actions on desktop");
assert.match(css,/#dashboard \.owner-today-detail\{[\s\S]*-webkit-line-clamp:1!important;/,
  "Home snapshot details must remain single-line scan copy");
assert.match(css,/@media\(max-width:620px\)\{[\s\S]*home-thebe-agent-quick \.btn:nth-child\(n\+3\)[\s\S]*display:none!important;/,
  "small phones must further reduce quick-action clutter");
assert.doesNotMatch(css,/\.notice[^}]*display\s*:\s*none/i,
  "V237 must not hide safety or fail-closed notices");

console.log("PASS: V237 declutters the reference shell while preserving workspace warnings and source drill-downs.");
