import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const home=fs.readFileSync("public/home.html","utf8");
const reporterLink=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const publicMarketing=fs.readFileSync("public/js/public-marketing-v249.js","utf8");
const publicMarketingCss=fs.readFileSync("public/assets/public-marketing-v249.css","utf8");

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
assert.equal(production.split("source.includes(PROPERTY_VISIBILITY_JS_ASSET)").length-1,1,
  "Property visibility script must have exactly one injection boundary");

assert.match(home,/\/js\/reporter-link-redirect\.js/,
  "public homepage must retain the lightweight public loader");
assert.match(reporterLink,/path!=="\/"&&path!=="\/home\.html"/,
  "public marketing enhancements must be strictly scoped to the homepage");
assert.match(reporterLink,/public-marketing-v249\.css/,
  "homepage loader must attach the public marketing stylesheet");
assert.match(reporterLink,/public-marketing-v249\.js/,
  "homepage loader must attach the public marketing behavior");
assert.doesNotMatch(reporterLink,/workspace-runtime|PROPERTY_VISIBILITY|workspace-command-center/i,
  "public loader must not reference workspace runtime assets");
assert.match(publicMarketing,/Money/);
assert.match(publicMarketing,/Work/);
assert.match(publicMarketing,/People/);
assert.match(publicMarketing,/Protect/);
assert.match(publicMarketing,/Thebe shows its work/,
  "public story must explain the evidence-backed operating model");
assert.match(publicMarketing,/cipa-compliance-botswana/,
  "public story must connect users to Botswana guidance");
assert.match(publicMarketingCss,/\.marketinggate \.pillar-grid/,
  "public marketing styling must remain scoped under marketinggate");
assert.doesNotMatch(publicMarketingCss,/\.workspace|#workspace|\.view\.active/,
  "public marketing CSS must not style authenticated workspace surfaces");

console.log("PASS: V230 public homepage assets stay isolated from workspace runtime and preserve the public operating-system story.");
