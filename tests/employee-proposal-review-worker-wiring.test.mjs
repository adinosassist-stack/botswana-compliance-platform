import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const worker=readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
test("employee review endpoint uses authenticated worker session and existing bounded JSON parser",()=>{
 assert.match(worker,/import \{handleEmployeeProposalReviewRequest\} from "\.\/employee-proposal-review-api\.js"/);
 assert.match(worker,/if\(url\.pathname==="\/api\/employee-workflow-reviews"\)\{\s*return handleEmployeeProposalReviewRequest\(\{req,env,session:a,readJson,roleAllowed\}\);/);
});

test("employee proposal review route is classified as authenticated HR feature",()=>{
 const policy=JSON.parse(readFileSync(new URL("../cloudflare/config/route-security-policy.json",import.meta.url),"utf8"));
 assert.ok(policy.workspaceFeaturePrefixes.employees_hr.includes("/api/employee-workflow-reviews"));
 assert.ok(!policy.preAuthRoutes.some(route=>route.pattern==="/api/employee-workflow-reviews"));
});
