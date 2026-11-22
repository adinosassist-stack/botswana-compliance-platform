import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const source=fs.readFileSync(new URL("../public/js/owner-onboarding-journey-v1.js",import.meta.url),"utf8");
const sandbox={module:{exports:{}}};
vm.runInNewContext(source,sandbox);
const derive=sandbox.module.exports.deriveOwnerJourney;

const owner={id:"owner-1",role:"owner",tenantId:"tenant-a",onboardingComplete:false};
const profile={entityType:"company",industry:"Retail",employees:0,firstProtectionCheckStatus:"pending"};
const payload=p=>({state:{activeCompanyId:"company-a",companies:[{id:"company-a",profile:p}]}});
test("unauthenticated and non-owner users cannot reveal onboarding status",()=>{
 assert.equal(derive(null,payload(profile)),null);
 assert.equal(derive({...owner,role:"manager"},payload(profile)),null);
 assert.equal(derive({...owner,tenantId:""},payload(profile)),null);
});
test("account status never implies verified email",()=>{
 const actual=derive(owner,payload(profile));
 assert.equal(actual.account,true);
 assert.equal(actual.emailVerified,null);
 assert.equal(actual.business,true);
 assert.equal(actual.workspace,true);
 assert.equal(actual.first,false);
});
test("incomplete business details cannot pass milestone",()=>{
 const a=derive(owner,payload({...profile,entityType:""}));
 const b=derive(owner,payload({...profile,employees:-1}));
 assert.equal(a.business,false);
 assert.equal(b.business,false);
});
test("no selected company cannot pass workspace or first value",()=>{
 const result=derive({...owner,onboardingComplete:true},{state:{activeCompanyId:"other",companies:[{id:"company-a",profile:{...profile,firstProtectionCheckStatus:"complete",firstProtectionCheckAt:"2026-11-22T10:00:00Z"}}]}});
 assert.equal(result.workspace,false);
 assert.equal(result.first,false);
});
test("first value needs completed owner setup, saved status and a valid timestamp",()=>{
 const complete={...profile,firstProtectionCheckStatus:"complete",firstProtectionCheckAt:"2026-11-22T10:00:00Z"};
 assert.equal(derive(owner,payload(complete)).first,false);
 assert.equal(derive({...owner,onboardingComplete:true},payload({...complete,firstProtectionCheckAt:"invalid"})).first,false);
 assert.equal(derive({...owner,onboardingComplete:true},payload({...complete,firstProtectionCheckStatus:"pending"})).first,false);
 assert.equal(derive({...owner,onboardingComplete:true},payload(complete)).first,true);
});
test("four distinct responsive milestones appear on the owner dashboard",()=>{
 const s=html.indexOf('id="ownerJourney"');
 const e=html.indexOf('id="welcomeSetupBanner"',s);
 const part=html.slice(s,e);
 assert.ok(s>0&&e>s);
 assert.equal((part.match(/data-onboarding-milestone="/g)||[]).length,4);
 assert.match(part,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,220px\),1fr\)\)/);
 assert.match(part,/id="ownerJourneySummary" role="status" aria-live="polite"/);
 assert.match(part,/min-height:44px/);
 assert.match(html,/src="\/js\/owner-onboarding-journey-v1\.js"/);
});
test("progress uses authenticated same-origin reads and never invents an issuance or completed compliance",()=>{
 assert.match(source,/global\.BW\.api\.createClient/);
 assert.match(source,/client\.request\("\/api\/auth\/me"/);
 assert.match(source,/client\.request\("\/api\/state"/);
 assert.doesNotMatch(source,/\bfetch\s*\(/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
 assert.doesNotMatch(source,/\b(?:POST|PUT|DELETE)\b/);
 assert.match(source,/Email verification is not inferred/);
 assert.match(source,/no step is marked complete/);
});
