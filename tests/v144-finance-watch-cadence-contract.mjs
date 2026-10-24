import assert from "node:assert/strict";import fs from "node:fs";
const loop=fs.readFileSync("cloudflare/src/finance-watch-durable-loop.js","utf8"),worker=fs.readFileSync("cloudflare/src/worker.js","utf8"),wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
assert.doesNotMatch(loop,/hourly:3600000/,"Finance Watch must not advertise unsupported hourly cadence");
assert.match(loop,/const ms=\{daily:86400000,weekly:604800000\}\[cadence\]/);
assert.match(loop,/code:"invalid_observation_cadence"/,"unsupported legacy cadence must fail closed");
const scheduled=worker.slice(worker.indexOf("async scheduled(event,env,ctx)"));
assert.match(scheduled,/summary\.financeWatch=await runDueFinanceWatchTasks\(env,\{limit:25\}\)/);
assert.match(wrangler,/crons = \["15 6 \* \* \*", "15 16 \* \* \*", "\* \* \* \* \*"\]/);
// Minute dispatch recovery is isolated before base.scheduled; it must never
// promote Finance Watch beyond its supported daily/weekly cadence.
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
assert.match(entry,/if\(event\.cron==="\* \* \* \* \*"\)\{\s*ctx\.waitUntil\(runEmployeeDispatchSweep[\s\S]*?return;\s*\}\s*ctx\.waitUntil\(runDueInternalAutonomy/);
assert.doesNotMatch(entry,/runDueFinanceWatchTasks\(/);
console.log("v144 Finance Watch cadence contract passed");
