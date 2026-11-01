import test from "node:test";
import assert from "node:assert/strict";
import {createAgentAuditEvent} from "../server/agentic/agent-audit-event.mjs";
const base={tenantId:"t",agentId:"a",actorId:"owner",requestId:"r",type:"admission_denied",occurredAt:"2026-10-29T12:00:00Z"};
test("audit digest is deterministic",()=>{const a=createAgentAuditEvent(base);assert.equal(a.digest,createAgentAuditEvent(base).digest);assert.equal(a.digest.length,64)});
test("sensitive details are never included",()=>{const a=createAgentAuditEvent({...base,details:{reason:"disabled",password:"secret",bankAccount:"1234",prompt:"private"}});assert.deepEqual(a.details,{reason:"disabled"});assert.equal(JSON.stringify(a).includes("secret"),false)});
test("unknown event types rejected",()=>assert.throws(()=>createAgentAuditEvent({...base,type:"payment_executed"}),TypeError));
test("missing identity rejected",()=>assert.throws(()=>createAgentAuditEvent({...base,tenantId:""}),TypeError));
test("unsafe detail objects rejected",()=>assert.throws(()=>createAgentAuditEvent({...base,details:[]}),TypeError));
