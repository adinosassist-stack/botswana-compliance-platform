import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["escalations",s.includes("obligation_escalations")],
 ["reminder state",s.includes("obligation_reminder_state")],
 ["inspection packs",s.includes("inspection_packs")],
 ["evidence links",s.includes("evidence_links")],
 ["reminder sweep",w.includes("runObligationReminderSweep")],
 ["evidence link API",w.includes("/evidence-link")],
 ["evidence verify API",w.includes("/verify")],
 ["inspection API",w.includes("/api/inspection-packs")],
 ["browser return not authoritative",w.includes('verifyAndSettlePaymentOrder(env,order.id,"browser_return")')&&w.includes("Browser state never settles payment.")],
 ["inspection UI",h.includes('id="inspectionreadiness"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
