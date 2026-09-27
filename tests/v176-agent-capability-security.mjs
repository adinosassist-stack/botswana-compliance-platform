import assert from "node:assert/strict";
import {evaluateToolTrust,trustedToolDefinition} from "../cloudflare/src/agent-tool-trust-registry.js";
import {
  evaluateToolDataBoundary,issueToolCapabilityCredential,verifyToolCapabilityCredential,createEphemeralExecutionContext
} from "../cloudflare/src/agent-capability-security.js";

const tool=trustedToolDefinition("financial_position.read");
assert.ok(tool);
assert.equal(tool.egressPolicy.networkMode,"deny_by_default");
assert.deepEqual([...tool.egressPolicy.allowedDestinations],["internal"]);
assert.deepEqual([...tool.egressPolicy.allowedDataClasses],["finance"]);
assert.equal(tool.credentialPolicy.inheritable,false);
assert.equal(tool.credentialPolicy.reusable,false);
assert.equal(tool.executionIsolation.persistence,"ephemeral");
assert.equal(tool.executionIsolation.recoverySource,"verified_checkpoint_only");

assert.equal(evaluateToolDataBoundary({tool,destination:"internal",payloadDataClasses:["finance"],payloadBytes:1024}).allowed,true);
assert.equal(evaluateToolDataBoundary({tool,destination:"https://example.com",payloadDataClasses:["finance"],payloadBytes:1024}).code,"egress_destination_forbidden");
assert.equal(evaluateToolDataBoundary({tool,destination:"internal",payloadDataClasses:["finance","credential"],payloadBytes:1024}).code,"egress_data_class_forbidden");
assert.equal(evaluateToolDataBoundary({tool,destination:"internal",payloadDataClasses:["finance"],payloadBytes:300000}).code,"egress_payload_too_large");
assert.equal(evaluateToolTrust({actionKey:"financial_position.read",destination:"https://example.com"}).code,"egress_destination_forbidden");

const secret="test-only-capability-secret-32-bytes-minimum";
const now=Date.parse("2026-09-27T16:00:00Z");
const issued=await issueToolCapabilityCredential({
  secret,tenantId:"tenant-A",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-1",ttlSeconds:60,now,nonce:"nonce-1"
});
assert.equal(issued.payload.nonInheritable,true);
assert.equal(issued.payload.reusable,false);
assert.equal(issued.payload.expiresAt-issued.payload.issuedAt,60);

let verified=await verifyToolCapabilityCredential({
  secret,token:issued.token,tenantId:"tenant-A",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-1",now:now+30000
});
assert.equal(verified.valid,true);

verified=await verifyToolCapabilityCredential({
  secret,token:issued.token,tenantId:"tenant-B",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-1",now:now+30000
});
assert.equal(verified.code,"capability_scope_mismatch");

verified=await verifyToolCapabilityCredential({
  secret,token:issued.token,tenantId:"tenant-A",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-2",now:now+30000
});
assert.equal(verified.code,"capability_scope_mismatch");

verified=await verifyToolCapabilityCredential({
  secret,token:issued.token,tenantId:"tenant-A",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-1",now:now+61000
});
assert.equal(verified.code,"capability_expired");

const tampered=issued.token.slice(0,-1)+(issued.token.endsWith("A")?"B":"A");
verified=await verifyToolCapabilityCredential({
  secret,token:tampered,tenantId:"tenant-A",agentId:"THEBE-001",actionKey:"financial_position.read",
  toolId:"thebe.financial_position",executionEnvId:"env-1",now:now+30000
});
assert.equal(verified.valid,false);

const context=createEphemeralExecutionContext({tenantId:"tenant-A",runId:"run-1",executionEnvId:"env-1"});
assert.equal(context.persistence,"ephemeral");
assert.equal(context.inheritCredentials,false);
assert.equal(context.inheritProcessEnvironment,false);
assert.equal(context.inheritBrowserSession,false);
assert.equal(context.network,"deny_by_default");
assert.equal(context.destroyAfterRun,true);
assert.equal(context.recoverySource,"verified_checkpoint_only");

console.log("v176 agent capability security adversarial checks passed");
