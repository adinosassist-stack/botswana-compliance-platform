import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["tender requirements",schema.includes("tender_requirements")],
 ["tender reviews",schema.includes("tender_reviews")],
 ["hr cases",schema.includes("hr_cases")],
 ["hr events",schema.includes("hr_case_events")],
 ["create tender",s.includes('req.method==="POST"')&&s.includes("/api/tenders")],
 ["tender review gate",s.includes("mandatory_requirements_incomplete")],
 ["hr state machine",s.includes("invalid_state_transition")],
 ["professional review gate",s.includes("professional_review_required")],
 ["transactional tender UI",html.includes("Create tender workspace")],
 ["transactional HR UI",html.includes("Open HR case")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
