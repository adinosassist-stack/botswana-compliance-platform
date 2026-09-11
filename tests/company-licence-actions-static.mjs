import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["company events",schema.includes("company_action_events")],
 ["licence events",schema.includes("licence_events")],
 ["company create",s.includes('/api/company-actions')&&s.includes("ACTION_CREATED")],
 ["company state machine",s.includes("reviewer_required")],
 ["licence create",s.includes('/api/licences')&&s.includes("LICENCE_CREATED")],
 ["licence renew",s.includes("LICENCE_RENEWED")],
 ["next actions",s.includes("/api/next-actions")],
 ["company UI",html.includes("Start company action")],
 ["licence UI",html.includes("Add licence")],
 ["unified queue UI",html.includes("Unified work queue")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
