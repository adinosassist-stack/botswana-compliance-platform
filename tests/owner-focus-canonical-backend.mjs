import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-focus-strip-v296.js","utf8");

assert.match(source,/20261011-owner-focus-canonical-v326/);
assert.match(source,/global\.apiJson\("\/api\/daily-brief"\)/);
assert.match(source,/global\.apiJson\("\/api\/agentic\/runs"\)/);
assert.match(source,/global\.apiJson\("\/api\/agentic\/outcomes"\)/);
assert.match(source,/global\.apiJson\("\/api\/business-context\/brief"\)/);

assert.match(source,/daily\?\.status\?\.openWork/);
assert.match(source,/String\(item\?\.status\|\|"pending"\)==="pending"/);
assert.match(source,/proposal_id\|\|item\?\.proposalId/);
assert.match(source,/authoritativeKnown\?action\+approvals\+pendingOutcomes:null/);
assert.match(source,/recommendations:\"\/api\/business-context\/brief priorities \(non-authoritative\)\"/);

assert.doesNotMatch(source,/const approvals=qa\("\.owner-review-inbox > \.owner-review-row",panel\)\.length/);
assert.doesNotMatch(source,/const visibleActions=qa\("\.owner-attention-list > \.owner-attention-item",panel\)\.length/);
assert.doesNotMatch(source,/const outcomes=qa\("\.owner-outcome-loop > \.owner-outcome-row",panel\)\.length/);
assert.match(source,/DOM rows are navigation\/rendering evidence only and never define canonical Owner Focus counts/);

assert.match(source,/setMetric\(strip,"action",displayCount\(counts\.action\)\)/);
assert.match(source,/setMetric\(strip,"approvals",displayCount\(counts\.approvals\)\)/);
assert.match(source,/setMetric\(strip,"outcomes",displayCount\(counts\.outcomes\)\)/);
assert.match(source,/value==null\?"—":String\(value\)/);
assert.match(source,/canonicalSnapshot\.state!=="ready"/);
assert.match(source,/Priority data incomplete — retry to verify/);

assert.match(source,/await refreshCanonicalSnapshot\(\{force:true\}\)/);
assert.match(source,/refreshCanonical:refreshCanonicalSnapshot/);
assert.match(source,/canonicalSnapshot:\(\)=>canonicalSnapshot/);
assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);

console.log("owner-focus canonical backend contract: PASS");
