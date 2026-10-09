import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const home=fs.readFileSync("public/home.html","utf8");
const reporterLink=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const publicMarketing=fs.readFileSync("public/js/public-marketing-v249.js","utf8");
const publicMarketingCss=fs.readFileSync("public/assets/public-marketing-v249.css","utf8");
const publicSeoCss=fs.readFileSync("public/assets/public-seo-v249.css","utf8");
const workspaceComponents=fs.readFileSync("public/js/components.js","utf8");
const workspaceInteractionCss=fs.readFileSync("public/assets/workspace-interactions-v250.css","utf8");
const seoPages=[
  "public/cipa-compliance-botswana/index.html",
  "public/burs-tax-compliance-botswana/index.html",
  "public/business-licences-botswana/index.html",
  "public/employment-compliance-botswana/index.html",
  "public/tender-readiness-botswana/index.html",
  "public/compliance-evidence-botswana/index.html",
  "public/pricing/index.html"
];

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

assert.ok(seoPages.every(path=>fs.readFileSync(path,"utf8").includes("/assets/public-seo-v249.css")),
  "pricing and every Botswana SEO guide must use the shared public Thebe theme");
assert.match(publicSeoCss,/--green:#0b66d6!important/,
  "legacy SEO green token must resolve to the live Thebe blue accent");
assert.match(publicSeoCss,/#pricingPlanProtect:checked~\.plan-tabs/,
  "pricing selected-plan state must be explicitly unified with the public theme");
assert.doesNotMatch(publicSeoCss,/\.workspace|#workspace|\.view\.active/,
  "SEO theme must not style authenticated workspace surfaces");

assert.match(workspaceComponents,/\/assets\/workspace-interactions-v250\.css/,
  "authenticated workspace component bootstrap must load the interaction contract");
assert.match(workspaceComponents,/setAttribute\("aria-label","Add company"\)/,
  "Add company icon control must receive an accessible name");
assert.match(workspaceComponents,/setAttribute\("title","Add company"\)/,
  "Add company icon control must expose a visible hover hint");
assert.match(workspaceInteractionCss,/#appShell button:disabled/,
  "workspace buttons must have a unified native disabled state");
assert.match(workspaceInteractionCss,/button\[aria-busy="true"\]/,
  "workspace buttons must have a unified loading state");
assert.match(workspaceInteractionCss,/min-width:40px!important/,
  "desktop icon controls must expose at least a 40px target");
assert.match(workspaceInteractionCss,/min-width:44px!important/,
  "mobile icon controls must expose at least a 44px target");
assert.match(workspaceInteractionCss,/prefers-reduced-motion:reduce/,
  "workspace controls must respect reduced-motion preference");
assert.doesNotMatch(workspaceInteractionCss,/marketinggate|authgate|pricingPlan|public-marketing/,
  "workspace interaction CSS must not style public marketing, auth or pricing surfaces");
assert.doesNotMatch(home,/workspace-interactions-v250/,
  "public homepage must not directly load authenticated workspace interaction styling");
assert.ok(seoPages.every(path=>!fs.readFileSync(path,"utf8").includes("workspace-interactions-v250")),
  "pricing and Botswana SEO guides must not load workspace interaction styling");

console.log("PASS: V230 public assets stay isolated from workspace runtime and preserve one public Thebe design system.");
