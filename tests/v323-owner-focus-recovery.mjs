import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-focus-strip-v296.js","utf8");

assert.match(source,/20261011-owner-focus-recovery-v322/);
assert.match(source,/20261007-owner-focus-v3-v303/);
assert.match(source,/Retry priorities/);
assert.match(source,/async function retryPriorities\(\)/);
assert.match(source,/global\.ThebeOwnerCommandCentre\?\.refresh/);
assert.match(source,/Retrying priority queue…/);
assert.match(source,/retry\.hidden=loading/);
assert.match(source,/retry\.hidden=true/);
assert.match(source,/dataset\.lastReadyAt/);
assert.match(source,/lastReadyAt:\(\)=>lastReadyAt/);
assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
assert.match(source,/Retry priority queue without changing approval or execution authority/);

console.log("v323 owner priority recovery contract: PASS");
