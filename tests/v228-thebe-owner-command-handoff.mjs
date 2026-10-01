import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const dock=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const css=fs.readFileSync("public/assets/thebe-ai-dock.css","utf8");
const html=fs.readFileSync("public/index.html","utf8");

assert.match(production,/const THEBE_LIVE_VOICE_RELEASE="20261001-owner-command-handoff-v228";/);
assert.match(production,/const THEBE_AI_DOCK_RELEASE="20261001-workspace-density-v233";/);
assert.match(dock,/const RELEASE="20261001-owner-command-handoff-v228";/);
assert.match(dock,/const DOCK_RELEASE="20261001-owner-command-handoff-v228";/);

assert.match(html,/<button[^>]*class="active nav-primary"[^>]*data-view="dashboard"[^>]*>[\s\S]*?<span>Home<\/span><\/button>/,
  "workspace Home must remain the dashboard route used by the handoff");
assert.match(html,/class="home-decision-center" id="homeDecisionCenter"/,
  "Owner Command Centre must retain its Home decision-centre mount");

assert.match(dock,/function ownerCommandActionDescriptor\(\)/);
assert.match(dock,/\["owner","manager"\]\.includes\(commandCentreRole\(\)\)/,
  "Command Centre handoff must stay role-gated");
assert.match(dock,/if\(reviews\)return \{label:"Review"/,
  "pending reviews must surface one concise review handoff");
assert.match(dock,/if\(approved\)return \{label:"Open tasks"/);
assert.match(dock,/if\(open\)return \{label:"Open tasks"/);
assert.match(dock,/runtimeKillSwitch===true\)return \{label:"Inspect guard"/,
  "a locked Runtime Guard must route to inspection rather than execution");
assert.match(dock,/missionAction\.hidden=!action/,
  "the handoff control must remain absent when there is nothing governed to open");

const handoffStart=dock.indexOf("function openOwnerCommandCentre()");
const handoffEnd=dock.indexOf("function syncMission()",handoffStart);
assert(handoffStart>=0&&handoffEnd>handoffStart,"Owner Command Centre handoff helper must exist");
const handoff=dock.slice(handoffStart,handoffEnd);
assert.match(handoff,/openView\("dashboard"\)/,
  "handoff must navigate through the canonical Home route");
assert.match(handoff,/getElementById\("ownerAgenticPanel"\)\|\|document\.getElementById\("ownerCommandCentre"\)/,
  "handoff must focus the existing governed control centre");
assert.doesNotMatch(handoff,/\bapi\s*\(/,
  "navigation handoff must not call application APIs");
assert.doesNotMatch(handoff,/method\s*:\s*"POST"|approve|grant|execute/i,
  "navigation handoff must not approve, grant or execute work");

assert.match(dock,/missionAction=el\("button","thebe-ai-mission-action","Open Command Centre"\)/);
assert.match(dock,/openCommandCentre:\(\)=>openOwnerCommandCentre\(\)/,
  "dock API may expose only the safe navigation handoff");

assert.match(css,/V228 Owner Command Centre handoff/);
assert.match(css,/\.thebe-ai-mission-action\{/);
assert.match(css,/\.thebe-ai-mission-action\[hidden\]\{display:none!important\}/);
assert.doesNotMatch(css,/V228 Owner Command Centre handoff[\s\S]*linear-gradient|V228 Owner Command Centre handoff[\s\S]*radial-gradient/i,
  "V228 must preserve the compact flat command-surface language");

console.log("PASS: V228 Thebe mission rail hands governed work to the existing Owner Command Centre without execution authority.");
