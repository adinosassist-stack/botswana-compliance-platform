import assert from "node:assert/strict";
import fs from "node:fs";
import {handleReliabilityAdvisorRequest} from "../cloudflare/src/agent-reliability-api.js";

const source=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const apiBoundary='if(url.pathname.startsWith("/api/")){\n      const a=await auth(req,env);';
const authIndex=source.indexOf(apiBoundary);
assert.ok(authIndex>=0,"central authenticated API boundary exists");
for(const gate of [
  "requestOriginAllowed(req,env)",
  "mutationCsrfOk(req,a)",
  "workspaceSessionRole(a)",
  "restrictedWorkspaceReadAllowed(url.pathname,a.role)"
])assert.ok(source.indexOf(gate,authIndex)>authIndex,`worker must preserve ${gate}`);
// This is an isolation guard, not a route integration test. Future routing must
// add dedicated positive authorization checks before this guard is removed.
assert.ok(!source.includes('handleReliabilityAdvisorRequest(req,{auth:a,env})'),"advisor must not be publicly routed before security review");
const owner={tenant_id:"tenant-A",role:"owner"};
const request=new Request("https://thebe.example/api/ai/operator/reliability");
const disabled=await handleReliabilityAdvisorRequest(request,{auth:owner,env:{}});
assert.equal(disabled.status,404,"feature must be disabled by default");
console.log("reliability pre-integration isolation checks passed");
