import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["outbox",schema.includes("notification_outbox")],
 ["schedules",schema.includes("compliance_schedules")],
 ["partner invites",schema.includes("partner_invites")],
 ["preferences",schema.includes("notification_preferences")],
 ["notifications api",s.includes("/api/notifications")],
 ["schedule api",s.includes("/api/compliance-schedules")],
 ["partner invite api",s.includes("/api/partner/invites")],
 ["scheduled handler",s.includes("async scheduled(event,env,ctx)")],
 ["notifications UI",html.includes("Notification center")],
 ["automation UI",html.includes("Create recurring compliance job")],
 ["invite UI",html.includes("Invite client")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
