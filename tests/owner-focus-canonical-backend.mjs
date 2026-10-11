import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-focus-strip-v296.js","utf8");

assert.match(source,/20261011-owner-focus-canonical-v327/);
assert.match(source,/global\.apiJson\("\/api\/daily-brief"\)/);
assert.match(source,/dailyResult\?\.value\?\.ownerAttention/);
assert.match(source,/canonicalSnapshotFromDailyResult/);
assert.match(source,/Owner Focus never recomputes authoritative queue facts in the browser/);

assert.doesNotMatch(source,/global\.apiJson\("\/api\/agentic\/runs"\)/);
assert.doesNotMatch(source,/global\.apiJson\("\/api\/agentic\/outcomes"\)/);
assert.doesNotMatch(source,/global\.apiJson\("\/api\/business-context\/brief"\)/);
assert.doesNotMatch(source,/daily\?\.status\?\.openWork/);
assert.doesNotMatch(source,/String\(item\?\.status\|\|"pending"\)==="pending"/);
assert.doesNotMatch(source,/proposal_id\|\|item\?\.proposalId/);

assert.match(source,/\["ready","loading","unavailable"\]\.includes\(state\)/);
assert.match(source,/owner_attention_missing/);
assert.match(source,/owner_attention_counts_invalid/);
assert.match(source,/owner_attention_ready_counts_invalid/);
assert.match(source,/action:knownCount\(rawCounts\.action\)/);
assert.match(source,/approvals:knownCount\(rawCounts\.approvals\)/);
assert.match(source,/outcomes:knownCount\(rawCounts\.outcomes\)/);
assert.match(source,/total:knownCount\(rawCounts\.total\)/);
assert.match(source,/value==null\?"—":String\(value\)/);
assert.match(source,/canonicalSnapshot\?\.state==="loading"/);
assert.match(source,/canonicalSnapshot\.state!=="ready"/);
assert.match(source,/Priority data incomplete — retry to verify/);

assert.doesNotMatch(source,/const approvals=qa\("\.owner-review-inbox > \.owner-review-row",panel\)\.length/);
assert.doesNotMatch(source,/const visibleActions=qa\("\.owner-attention-list > \.owner-attention-item",panel\)\.length/);
assert.doesNotMatch(source,/const outcomes=qa\("\.owner-outcome-loop > \.owner-outcome-row",panel\)\.length/);

assert.match(source,/setMetric\(strip,"action",displayCount\(counts\.action\)\)/);
assert.match(source,/setMetric\(strip,"approvals",displayCount\(counts\.approvals\)\)/);
assert.match(source,/setMetric\(strip,"outcomes",displayCount\(counts\.outcomes\)\)/);
assert.match(source,/await refreshCanonicalSnapshot\(\{force:true\}\)/);
assert.match(source,/refreshCanonical:refreshCanonicalSnapshot/);
assert.match(source,/canonicalSnapshot:\(\)=>canonicalSnapshot/);
assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);

console.log("owner-focus canonical payload consumption contract: PASS");
