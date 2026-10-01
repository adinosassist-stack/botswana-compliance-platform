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
assert.match(ui,/Last check · \$\{businessGoalTime\(task\.last_run_at\)\}/,
  "goal cards must show the last observed run time without inventing progress");
assert.match(ui,/Stop watching/,
  "owners must have a compact way to cancel a persistent goal");
assert.match(ui,/taskStatus==="paused"\?"resume":"pause"/,
  "owners must be able to pause and resume existing goals");
assert.match(ui,/if\(canEdit\(\)\)\{/,
  "goal lifecycle controls must remain owner-edit gated");
assert.match(ui,/Thebe remains observe-and-recommend only/,
  "active goal state must preserve the no-autonomous-high-impact boundary");
assert.match(api,/persistent-tasks\/\(\[\^\/\]\+\)\/\(pause\|resume\|complete\|cancel\)/,
  "backend lifecycle route must still constrain transitions to known actions");
assert.match(api,/executionAllowed:false/,
  "persistent business goals must not gain execution authority");
assert.doesNotMatch(api,/maxExternalActions\s*:\s*[1-9]/,
  "business goals must keep zero external-action budget");

console.log("PASS: V239 exposes persistent goal lifecycle state without broadening execution authority.");
