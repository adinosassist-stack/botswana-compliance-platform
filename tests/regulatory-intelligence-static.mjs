import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["sources",s.includes("regulatory_sources")],
 ["rules",s.includes("regulatory_rules")],
 ["rule events",s.includes("regulatory_rule_events")],
 ["conflicts",s.includes("regulatory_conflicts")],
 ["impacts",s.includes("regulatory_impacts")],
 ["approved sources gate",w.includes("ruleSourcesApproved")],
 ["conflict block",w.includes("open_source_conflict")],
 ["source api",w.includes("/api/regulatory/sources")],
 ["rule api",w.includes("/api/regulatory/rules")],
 ["impact api",w.includes("/api/regulatory/impacts")],
 ["UI",h.includes('id="regulatoryintel"')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
