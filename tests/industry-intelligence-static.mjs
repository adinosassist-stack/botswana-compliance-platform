import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["pack registry",s.includes("industry_protection_packs")],
 ["assignments",s.includes("tenant_industry_pack_assignments")],
 ["controls",s.includes("industry_control_status")],
 ["benchmark opt in",s.includes("industry_benchmark_preferences")&&s.includes("DEFAULT 0")],
 ["benchmark snapshots",s.includes("industry_benchmark_snapshots")],
 ["minimum cohort",w.includes("INDUSTRY_BENCHMARK_MIN_COHORT=10")],
 ["recommendation engine",w.includes("recommendIndustryPacks")],
 ["activation engine",w.includes("activateIndustryPack")],
 ["published rule gate",w.includes("status='published'")&&w.includes("evaluateRuleForTenant")],
 ["no pack direct legal insert",(()=>{const a=w.indexOf("async function activateIndustryPack");const b=w.indexOf("async function updateIndustryBenchmarkPreference",a);return a>=0&&b>a&&!w.slice(a,b).includes("INSERT INTO compliance_obligations")})()],
 ["benchmark aggregated only",w.includes("averageProtectionScore")&&w.includes("percentBusinessesWithRiskCategory")],
 ["canonical pack cohorts",w.includes("pa.pack_key")&&w.includes("chosen.set(x.tenant_id,x.pack_key)")],
 ["chunked d1 queries",w.includes("offset+=80")],
 ["rounded benchmark",w.includes('rounding:"nearest_5"')],
 ["industry packs api",w.includes("/api/industry/packs")],
 ["industry benchmark api",w.includes("/api/industry/benchmark")],
 ["weekly refresh",w.includes("getUTCDay()===0")],
 ["UI",h.includes('id="industryintel"')],
 ["privacy copy",h.includes("Minimum cohort: 10 opted-in businesses")],
 ["blank industry safe",w.includes("else if(industry&&")],
 ["stale recommendation cleanup",w.includes("DELETE FROM tenant_industry_pack_assignments")],
 ["plan entitlement",s.includes("industry_intelligence")&&w.includes('requireEntitlement(env,a.tenant_id,"industry_intelligence")')],
 ["activation role gate",w.includes('roleAllowed(a,"owner","manager")')],
 ["benchmark owner opt in",w.includes('roleAllowed(a,"owner")')],
 ["benchmark retention",w.includes("-370 days")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
