import assert from "node:assert/strict";
import {evaluateToolTrust,trustedToolDefinition,validatePersistentTaskAllowedTools} from "../cloudflare/src/agent-tool-trust-registry.js";
import {normalizePersistentTask} from "../cloudflare/src/agentic-persistent-tasks.js";

const finance=evaluateToolTrust({actionKey:"financial_position.read",requestedToolId:"thebe.financial_position",requestedTransport:"internal"});
assert.equal(finance.allowed,true);
assert.equal(finance.executionAllowed,false);
assert.equal(finance.tool.externalSideEffect,false);
assert.equal(finance.tool.discoveryAuthority,"none");
assert.equal(finance.tool.executionAuthority,"none");

assert.equal(evaluateToolTrust({actionKey:"payment.execute"}).allowed,false);
assert.equal(evaluateToolTrust({actionKey:"__proto__"}).allowed,false);
assert.equal(evaluateToolTrust({actionKey:"financial_position.read",requestedToolId:"evil.tool"}).code,"tool_identity_mismatch");
assert.equal(evaluateToolTrust({actionKey:"financial_position.read",requestedTransport:"mcp"}).code,"tool_transport_mismatch");

const trusted=validatePersistentTaskAllowedTools(["financial_position.read","finance_data_quality.read","financial_position.read"]);
assert.deepEqual([...trusted.tools],["financial_position.read","finance_data_quality.read"]);
assert.equal(validatePersistentTaskAllowedTools(["financial_position.read","payment.execute"]).valid,false);
assert.equal(validatePersistentTaskAllowedTools(["unknown.read"]).valid,false);

assert.equal(normalizePersistentTask({objective:"Watch finance certainty",allowedTools:["financial_position.read","finance_data_quality.read"]}).error,undefined);
assert.equal(normalizePersistentTask({objective:"Move money",allowedTools:["payment.execute"]}).error,"untrusted_allowed_tool");

console.log("v118 tool trust registry adversarial checks passed");
