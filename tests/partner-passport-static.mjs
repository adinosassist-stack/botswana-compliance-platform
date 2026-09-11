import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["passport shares",schema.includes("passport_shares")],
 ["passport verification",schema.includes("passport_verifications")],
 ["partner tasks",schema.includes("partner_tasks")],
 ["workflow rules",schema.includes("workflow_rules")],
 ["passport endpoint",s.includes("/api/passport")],
 ["passport share endpoint",s.includes("/api/passport/share")],
 ["partner tasks endpoint",s.includes("/api/partner/tasks")],
 ["workflow rules endpoint",s.includes("/api/workflow-rules")],
 ["partner UI",html.includes("Partner work queue")],
 ["passport UI",html.includes("Compliance Passport")&&html.includes("Create secure share link")],
 ["workflow UI",html.includes("Create automation")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
