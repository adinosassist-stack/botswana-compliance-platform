import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../public/js/owner-command-centre.js",import.meta.url),"utf8");
const loop=fs.readFileSync(new URL("../cloudflare/src/business-goal-durable-loop.js",import.meta.url),"utf8");
const engine=fs.readFileSync(new URL("../cloudflare/src/agentic-persistent-tasks.js",import.meta.url),"utf8");

assert.match(ui,/Persistent objectives/);
assert.match(ui,/state:retryPending\?"Working":"Needs approval"/);
assert.match(ui,/state:"Needs approval".*paused/s);
assert.match(ui,/state:"Working".*first governed check/s);
assert.match(ui,/checkpoint\.changed===true\?"Completed"/);
assert.match(ui,/consequential actions still require an explicit governed approval path/);

assert.match(loop,/executionAllowed:false,externalActions:0/);
assert.match(engine,/executionAllowed:false/);
assert.match(engine,/maxExternalActions/);
assert.doesNotMatch(ui,/persistent objectives.*autonomously send/i);

console.log("PASS: persistent objective UI exposes Working / Needs approval / Completed without widening execution authority.");
