import fs from "node:fs";
const s=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["catalog",schema.includes("service_catalog")],
 ["orders",schema.includes("service_orders")],
 ["events",schema.includes("service_order_events")],
 ["professionals",schema.includes("professional_profiles")],
 ["catalog api",s.includes("/api/services/catalog")],
 ["orders api",s.includes("/api/services/orders")],
 ["state machine",s.includes("invalid_state_transition")],
 ["services UI",html.includes("Professional services")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
