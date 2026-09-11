import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["legal holds",s.includes("legal_holds")],
 ["deletion requests",s.includes("deletion_requests")],
 ["evidence deletion status",s.includes("deletion_status")],
 ["r2 delete",w.includes("EVIDENCE.delete")],
 ["legal hold gate",w.includes("legal_hold_active")],
 ["completion evidence gate",w.includes("evidence_remaining")],
 ["session invalidation",w.includes("DELETE FROM sessions")],
 ["deletion audit",w.includes("TENANT_DELETION_COMPLETED")],
 ["retry bounded",w.includes("attempts<5")],
 ["UI",h.includes('id="datadeletion"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
