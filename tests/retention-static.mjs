import fs from "node:fs";
const server=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const checks=[
 ["legal hold",server.includes("legal_holds")],
 ["deletion requests",server.includes("deletion_requests")],
 ["deletion status",server.includes("/api/account/deletion-status")],
 ["retention cleanup",server.includes("/api/internal/retention/cleanup")],
 ["retention secret",server.includes("RETENTION_JOB_SECRET")],
 ["evidence legal hold",server.includes("legal_hold=false")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
