import fs from "node:fs";
import assert from "node:assert/strict";

const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const api=fs.readFileSync("cloudflare/src/agentic-persistent-tasks.js","utf8");

assert.match(ui,/request\("\/api\/agentic\/persistent-tasks"\)/,
  "Goals & Ideas must read the tenant-scoped persistent goal list");
assert.match(ui,/\["active","paused"\]\.includes\(String\(task\?\.status\|\|""\)\)/,
  "Goals & Ideas must surface current active and paused goals");
assert.match(ui,/Currently watching/,
  "current governed goals must be visibly separated from available templates");
assert.match(ui,/Last · \$\{businessGoalTime\(task\.last_run_at\)\} · Next ·/,
  "goal cards must show the last observed run and next scheduled state without inventing progress");
assert.match(ui,/Stop watching/,
  "owners must have a compact way to cancel a persistent goal");
assert.match(ui,/taskStatus==="paused"\?"resume":"pause"/,
  "owners must be able to pause and resume existing goals");
assert.match(ui,/if\(canEdit\(\)\)\{/,
  "goal lifecycle controls must remain owner-edit gated");
assert.match(ui,/Authority boundary · Observe → reason → recommend/,
  "Goals & Ideas must preserve a visible no-autonomous-high-impact authority boundary");
assert.match(api,/const m=path\.match\([\s\S]*pause\|resume\|complete\|cancel/,
  "backend lifecycle route must still constrain transitions to known actions");
assert.match(api,/executionAllowed:false/,
  "persistent business goals must not gain execution authority");
assert.doesNotMatch(api,/maxExternalActions\s*:\s*[1-9]/,
  "business goals must keep zero external-action budget");

console.log("PASS: V239 exposes persistent goal lifecycle state without broadening execution authority.");
