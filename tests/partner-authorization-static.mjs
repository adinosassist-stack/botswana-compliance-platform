import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["access table",s.includes("partner_client_access")],
 ["access events",s.includes("partner_access_events")],
 ["scoped invites",s.includes("scopes_json")],
 ["access helper",w.includes("partnerAccess")],
 ["accept invite",w.includes("/api/partner/invites/accept")],
 ["revoke access",w.includes("ACCESS_REVOKED")&&w.includes("partner_client_access")],
 ["task scope gate",w.includes('"manage_compliance"')],
 ["client read join",w.includes("JOIN partner_client_access")],
 ["UI access list",h.includes('id="partnerAccessList"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
