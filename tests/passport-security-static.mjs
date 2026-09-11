import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["access log",s.includes("passport_share_access_log")],
 ["scopes",s.includes("scopes_json")],
 ["selected controls",s.includes("selected_controls_json")],
 ["view limits",s.includes("max_views")&&s.includes("view_count")],
 ["secret fail closed",w.includes("passport_secret_not_configured")],
 ["public verify",w.includes("/public/passport/verify")],
 ["rate limit",w.includes("passportShareRateLimited")],
 ["revocation",w.includes("PASSPORT_SHARE_REVOKED")&&w.includes("passport_shares")],
 ["no evidence bytes",!w.includes("SELECT object_key FROM evidence_files")||w.includes("passport_verifications")],
 ["UI shares",h.includes('id="passportShareList"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
