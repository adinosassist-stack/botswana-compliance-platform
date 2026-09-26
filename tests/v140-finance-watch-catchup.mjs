import assert from "node:assert/strict";import {__financeWatchDurableLoopTest as t} from "../cloudflare/src/finance-watch-durable-loop.js";
const task=cadence=>({trigger_spec_json:JSON.stringify({cadence})});
let r=t.nextRunAt(task("hourly"),"2026-09-26T00:00:00.000Z",{now:new Date("2026-09-26T06:15:00.000Z")});
assert.equal(r.nextRunAt,"2026-09-26T07:00:00.000Z");assert.equal(r.skippedOccurrences,6);
r=t.nextRunAt(task("daily"),"2026-09-20T06:15:00.000Z",{now:new Date("2026-09-26T06:15:00.000Z")});
assert.equal(r.nextRunAt,"2026-09-27T06:15:00.000Z");assert.equal(r.skippedOccurrences,6);
r=t.nextRunAt(task("weekly"),"2026-09-20T06:15:00.000Z",{now:new Date("2026-09-26T06:15:00.000Z")});
assert.equal(r.nextRunAt,"2026-09-27T06:15:00.000Z");assert.equal(r.skippedOccurrences,0);
console.log("v140 Finance watch catch-up policy passed");
