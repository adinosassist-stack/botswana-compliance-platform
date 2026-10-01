import fs from "node:fs";
import assert from "node:assert/strict";

const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const css=fs.readFileSync("public/assets/workspace-home-density-v234.css","utf8");
const html=fs.readFileSync("public/index.html","utf8");

assert.match(production,/const WORKSPACE_RUNTIME_RELEASE="20261001-home-live-brief-v234";/,
  "V234 must rotate the workspace runtime cache identity");
assert.match(production,/WORKSPACE_HOME_DENSITY_V234_CSS_ASSET="\/assets\/workspace-home-density-v234\.css"/,
  "V234 must publish a unique cache-safe Home density stylesheet");
assert.match(production,/const workspaceHomeDensityV234CssHref=WORKSPACE_HOME_DENSITY_V234_CSS_ASSET;/,
  "V234 workspace CSS must have a dedicated injected href");
assert.match(production,/if\(!source\.includes\(WORKSPACE_HOME_DENSITY_V234_CSS_ASSET\)\)source=injectBeforeFinalClosingTag\(source,"head",`<link rel="stylesheet" href="\$\{workspaceHomeDensityV234CssHref\}" \/>\\n`\);/,
  "authenticated workspace asset injection must include the V234 density layer");

assert.match(html,/class="owner-today-grid"/);
assert.match(html,/class="home-status-strip daily-status-strip"/);
assert.match(css,/#dashboard \.home-status-strip\{[\s\S]*display:none!important/,
  "the duplicate six-chip Home metric strip must be removed from the default visual scan");
assert.doesNotMatch(css,/#dashboard \.owner-today-grid[^}]*display\s*:\s*none/i,
  "the primary five-card business snapshot must remain visible");
assert.match(css,/body\.thebe-ai-dock-open #dashboard \.owner-today-grid\{[\s\S]*repeat\(3,minmax\(0,1fr\)\)/,
  "dock-constrained medium desktops must reflow the owner snapshot instead of squeezing five cards");
assert.match(css,/body\.thebe-ai-dock-open #dashboard \.home-decision-grid\{[\s\S]*grid-template-columns:1fr/,
  "dock-constrained medium desktops must stack the decision bento rather than compress it");
assert.doesNotMatch(css,/\.notice[^}]*display\s*:\s*none/i,
  "V234 must not hide fail-closed notices or warnings");
assert.match(css,/#dashboard>\.owner-command-hero\{[\s\S]*min-height:164px!important/,
  "Home hero must have stronger first-screen presence without adding content");
assert.match(css,/#dashboard #ownerGreeting\{[\s\S]*font-size:clamp\(28px,2\.7vw,40px\)!important/,
  "owner greeting must read as the primary first-screen question");
assert.match(css,/#dashboard \.home-thebe-agent-compose\{[\s\S]*border-radius:999px!important/,
  "Talk to Thebe must use a prominent pill command surface");
assert.match(css,/#dashboard \.home-thebe-agent-compose \.btn\{[\s\S]*border-radius:50%!important/,
  "Talk to Thebe submit control must remain compact and visually distinct");
assert.match(css,/#dashboard \.home-decision-grid\{[\s\S]*minmax\(0,1\.1fr\) minmax\(300px,\.9fr\)/,
  "priorities and business snapshot must share a balanced desktop bento row");

assert.match(runtime,/let ownerBriefRefreshInFlight=false;/);
assert.match(runtime,/async function refreshLiveOwnerBrief\(\)/);
assert.match(runtime,/ownerBriefRefreshInFlight\|\|document\.visibilityState!==\"visible\"/);
assert.match(runtime,/!window\.__THEBE_WORKSPACE_READY__/);
assert.match(runtime,/!document\.getElementById\(\"dashboard\"\)\?\.classList\.contains\(\"active\"\)/);
assert.match(runtime,/!\[\"owner\",\"manager\"\]\.includes\(currentWorkspaceRole\(\)\)/);
assert.match(runtime,/setInterval\(\(\)=>void refreshLiveOwnerBrief\(\),60000\)/,
  "Home live brief must refresh at a bounded one-minute cadence");
assert.match(runtime,/window\.addEventListener\(\"focus\",\(\)=>void refreshLiveOwnerBrief\(\)\)/);
assert.match(runtime,/visibilitychange[\s\S]*refreshLiveOwnerBrief/);
assert.match(runtime,/if\(ownerBriefLastGoodAt\)[\s\S]*last confirmed; refresh failed/,
  "live refresh must preserve the last confirmed brief on transient failure");

console.log("PASS: V235 sharpens the Home command hierarchy while V234 keeps the live brief, density and dock-safe layout guarantees.");
