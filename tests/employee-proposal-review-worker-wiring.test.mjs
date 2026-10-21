import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const worker=readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
test("employee review endpoint uses authenticated worker session and existing bounded JSON parser",()=>{
 assert.match(worker,/import \{handleEmployeeProposalReviewRequest\} from "\.\/employee-proposal-review-api\.js"/);
 assert.match(worker,/if\(url\.pathname==="\/api\/employee-workflow-reviews"\)\{\s*return handleEmployeeProposalReviewRequest\(\{req,env,session:a,readJson,roleAllowed\}\);/);
});
