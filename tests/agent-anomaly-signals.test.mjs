import test from "node:test";
import assert from "node:assert/strict";
import {classifyAgentAnomaly} from "../cloudflare/src/agent-anomaly-signals.js";
const base={tenantId:"tenant-1",agentId:"agent-1",correlationId:"trace-1"};
test("critical cross-tenant attempts recommend suspension but never execution",()=>{const r=classifyAgentAnomaly({...base,signal:"cross_tenant_attempt"});assert.equal(r.severity,"critical");assert.equal(r.recommendSuspension,true);assert.equal(r.executionAllowed,false);});
test("repeated denials escalate to owner review",()=>{assert.equal(classifyAgentAnomaly({...base,signal:"authorization_denied",count:2}).requiresOwnerReview,false);assert.equal(classifyAgentAnomaly({...base,signal:"authorization_denied",count:3}).requiresOwnerReview,true);});
test("invalid and spoofed inputs fail closed",()=>{for(const v of [{...base,signal:"unknown"},{...base,tenantId:" tenant-1",signal:"audit_unavailable"},{...base,signal:"budget_threshold",count:-1},null])assert.equal(classifyAgentAnomaly(v).executionAllowed,false);});
