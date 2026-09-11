import fs from "node:fs";
const s=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const checks=[
 ["delete object command",s.includes("DeleteObjectCommand")],
 ["actual storage deletion",s.includes("deleteEvidenceObject")],
 ["storage deletion audit",s.includes("EVIDENCE_STORAGE_DELETED")],
 ["retry limit",s.includes("deletion_attempts < 5")],
 ["legal hold storage guard",s.includes("tenantHasActiveLegalHold")],
 ["approve state",s.includes("/api/internal/deletion-requests/:id/approve")],
 ["complete state",s.includes("/api/internal/deletion-requests/:id/complete")],
 ["remaining objects guard",s.includes("evidence_objects_remaining")]
];
let bad=checks.filter(x=>!x[1]);
for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);
if(bad.length)process.exit(1);
