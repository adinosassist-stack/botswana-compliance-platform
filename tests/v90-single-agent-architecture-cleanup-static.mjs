import assert from "node:assert/strict";
import fs from "node:fs";

const policy=fs.readFileSync("cloudflare/src/agent-policy.js","utf8");
const authority=fs.readFileSync("cloudflare/src/agentic-authority-core.js","utf8");
const doc=fs.readFileSync("V81_AGENTIC_BUSINESS_OS.md","utf8");
const delegatedTest=fs.readFileSync("tests/v81-delegated-authority-static.mjs","utf8");

assert.doesNotMatch(policy,/export function requestedCapability\(/,"unused requestedCapability export must stay removed");
assert.match(policy,/export const THEBE_AGENTS = Object\.freeze\(\{\s*thebe:/s,"Thebe must remain the canonical agent identity");
assert.match(policy,/export const LEGACY_AGENT_CAPABILITY/,"legacy key map must remain explicit compatibility code");
assert.match(authority,/resolveAgentKey/,"authority boundary must still canonicalize legacy keys");
assert.match(authority,/agentCanRouteAction/,"authority boundary must still preserve capability/action routing");
assert.match(doc,/one canonical Thebe agent/,"architecture documentation must describe one canonical Thebe agent");
assert.match(doc,/Tender work is a compliance capability, not a separate agent/,"tender must remain a capability boundary");
assert.doesNotMatch(doc,/five governed agents/i,"stale five-agent architecture language must not return");
assert.doesNotMatch(doc,/Core Five/i,"stale Core Five product language must not return");
assert.doesNotMatch(doc,/specialised agents may operate bounded internal workflows/i,"maturity guidance must not silently reintroduce separate agents");
assert.match(delegatedTest,/agent_key:"thebe"/,"delegated-authority canonical fixture must use Thebe");
assert.match(delegatedTest,/agentKey:"thebe"/,"delegated-authority evaluations must primarily exercise the canonical Thebe key");
assert.match(delegatedTest,/agentKey:"management"[\s\S]*delegation_agent_mismatch/,"legacy-key mismatch must remain explicitly tested below the compatibility layer");

console.log("v90 single-agent dead-code and architecture cleanup checks passed");
