import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const authBoundary='if(url.pathname.startsWith("/api/")){\n      const a=await auth(req,env);';
const reliabilityDispatch='if(url.pathname==="/api/ai/operator/reliability")return handleReliabilityAdvisorRequest(req,{auth:a,env});';
const operatorDispatch='if(isOwnerOperatorPath(url.pathname))return handleOwnerOperatorRequest(req,{auth:a});';

assert.match(source,/import \{handleReliabilityAdvisorRequest\} from "\.\/agent-reliability-api\.js";/);
const authIndex=source.indexOf(authBoundary);
const reliabilityIndex=source.indexOf(reliabilityDispatch);
const operatorIndex=source.indexOf(operatorDispatch);
assert.ok(authIndex>=0,"central authenticated API boundary must exist");
assert.ok(reliabilityIndex>authIndex,"reliability dispatch must occur after central session authentication");
assert.ok(operatorIndex>reliabilityIndex,"generic operator routing must occur after reliability-specific routing");
assert.match(source.slice(authIndex,reliabilityIndex),/requestOriginAllowed\(req,env\)/,"origin validation must precede reliability dispatch");
assert.match(source.slice(authIndex,reliabilityIndex),/mutationCsrfOk\(req,a\)/,"central CSRF gate must precede reliability dispatch");
assert.match(source.slice(authIndex,reliabilityIndex),/workspaceSessionRole\(a\)/,"workspace-role gate must precede reliability dispatch");
assert.match(source.slice(authIndex,reliabilityIndex),/restrictedWorkspaceReadAllowed\(url\.pathname,a\.role\)/,"read authorization must precede reliability dispatch");
console.log("agent reliability worker routing tests passed");
