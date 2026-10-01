import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");

function block(name,nextName){
  const start=production.indexOf("function "+name+"(");
  assert(start>=0,name+" must exist");
  const end=nextName?production.indexOf("function "+nextName+"(",start+1):production.length;
  assert(end>start,name+" boundary missing");
  return production.slice(start,end);
}

const publicAssets=block("injectPublicThebeAssets","externalizeWorkspaceRuntime");
const workspaceAssets=block("injectOwnerCommandCentreAssets","isRegistrationRequest");

assert.doesNotMatch(publicAssets,/PROPERTY_VISIBILITY_JS_ASSET|propertyVisibilityJsSrc/,
  "public homepage must never reference workspace-only Property visibility assets");
assert.match(workspaceAssets,/const propertyVisibilityJsSrc=PROPERTY_VISIBILITY_JS_ASSET;/,
  "authenticated workspace must define the Property visibility asset URL");
assert.ok(workspaceAssets.includes("source.includes(PROPERTY_VISIBILITY_JS_ASSET)"),
  "authenticated workspace must guard the Property visibility script injection");
assert.ok(workspaceAssets.includes("propertyVisibilityJsSrc"),
  "authenticated workspace must inject the Property visibility repair URL");
assert.equal((production.match(/if\\\(!source\\.includes\\\(PROPERTY_VISIBILITY_JS_ASSET\\\)\\\)/g)||[]).length,1,
  "Property visibility script must have exactly one injection boundary");

console.log("PASS: V230 Property visibility runtime is workspace-only and cannot break the public root.");
