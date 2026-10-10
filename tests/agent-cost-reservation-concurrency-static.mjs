import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const reservation=readFileSync(new URL("../cloudflare/src/agent-cost-reservations.js",import.meta.url),"utf8");
const schema=readFileSync(new URL("../cloudflare/experimental/agent_cost_accounting.sql",import.meta.url),"utf8");

// These are guardrail checks, NOT a substitute for a real concurrent D1 test.
// Atomic admission must be enforced in SQL, not by a preceding SELECT alone.
assert.match(reservation,/Database triggers atomically enforce budget admission/);
assert.match(reservation,/env\.DB\.batch\(/);
assert.match(reservation,/cost_reservation_conflict/);
assert.match(schema,/UNIQUE\(tenant_id,agent_id,run_id\)/);
assert.match(schema,/CHECK\(spent_minor\+reserved_minor<=budget_minor\)/);
assert.match(reservation,/status='reserved' AND estimate_minor=\?/);
assert.match(reservation,/status='reserved' AND changes\(\)=1/);
assert.match(reservation,/changes\(\)=1/);
console.log("Agent reservation concurrency prerequisites present (static only)");
