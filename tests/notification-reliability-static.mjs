import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["attempts",s.includes("notification_delivery_attempts")],
 ["dead letters",s.includes("notification_dead_letters")],
 ["pack exports",s.includes("inspection_pack_exports")],
 ["quiet hours",w.includes("inQuietHours")],
 ["retry backoff",w.includes("nextRetryAt")],
 ["dead letter",w.includes("markDeadLetter")],
 ["outbox processor",w.includes("processNotificationOutbox")],
 ["dead letter api",w.includes("/api/notifications/dead-letters")],
 ["pack export api",w.includes("/export")],
 ["UI failures",h.includes("Delivery failures")],
 ["UI export",h.includes("Export latest pack")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
