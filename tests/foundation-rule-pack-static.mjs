import fs from "node:fs";
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const s=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const p=JSON.parse(fs.readFileSync(new URL("../cloudflare/seeds/botswana-foundation-pack-v1.json",import.meta.url),"utf8"));
const checks=[
 ["seed registry",s.includes("regulatory_seed_registry")],
 ["pack import history",s.includes("regulatory_pack_imports")],
 ["idempotent registry",w.includes("seedRegistryGet")&&w.includes("seedRegistryPut")],
 ["reuse source url",w.includes("WHERE source_url=? ORDER BY created_at LIMIT 1")],
 ["reuse identical rule",w.includes("existing.definition_hash===seedHash")],
 ["platform-only import",w.includes('/api/platform/regulatory/foundation-pack/import')&&w.includes('requirePlatformRegulatory(a,env,"editor","admin")')],
 ["no source auto approval",w.includes("'pending',?,?,'unverified'")],
 ["draft rules only",w.includes("'draft',?,?,?,?,?)")],
 ["vat threshold conflict fail closed",p.conflicts.some(x=>x.key==="vat-registration-threshold"&&x.status==="open"&&!p.rules.some(r=>r.key==="vat-compulsory-threshold-1m"))],
 ["paye threshold conflict fail closed",p.conflicts.some(x=>x.key==="paye-itw8-salary-threshold"&&x.status==="open"&&!p.rules.some(r=>r.key==="paye-itw8-threshold-2500"))],
 ["deadline rules avoid conflicted threshold sources",p.rules.find(x=>x.key==="paye-remittance").sourceKeys.length===1&&p.rules.find(x=>x.key==="paye-remittance").sourceKeys[0]==="burs-payments"&&p.rules.find(x=>x.key==="vat-return-payment").sourceKeys[0]==="burs-payments"],
 ["pending operationalization cannot publish",w.includes("ruleOperationalizationReady")&&w.includes("operationalization_not_ready")],
 ["latest labour date",p.sources.some(x=>x.key==="employment-commencement-2026-08-19"&&x.effectiveDate==="2026-09-01")],
 ["current labour in-force source",p.sources.some(x=>x.key==="employment-act-in-effect-2026-09-10"&&x.publicationDate==="2026-09-10"&&x.effectiveDate==="2026-09-01")],
 ["foundation pack current review date",p.version==="1.6"&&p.asOf==="2026-09-23"],
 ["current fixed-term rule source",p.rules.find(x=>x.key==="fixed-term-review")?.sourceKeys?.includes("employment-act-in-effect-2026-09-10")&&p.rules.find(x=>x.key==="fixed-term-review")?.effectiveFrom==="2026-09-01"],
 ["probation review remains draft-only seed",p.rules.some(x=>x.key==="probation-period-review"&&x.ruleKey==="bw.employment.probation.max-six-month-review"&&x.confidence==="medium")],
 ["maternity review remains draft-only seed",p.rules.some(x=>x.key==="maternity-leave-review"&&x.ruleKey==="bw.employment.maternity-leave.14-week-review"&&x.confidence==="medium")],
 ["2026 tax reform source",p.sources.some(x=>x.key==="botswana-tax-reform-2026"&&x.effectiveDate==="2026-07-01")],
 ["eprocurement source",p.sources.some(x=>x.key==="botswana-egp-procurement-2026")],
 ["entity type predicate",w.includes("entityTypes")&&h.includes('id="pEntityType"')&&h.includes('id="wEntityType"')],
 ["profile aliases",w.includes('["vat_registered","vat"]')&&w.includes('["paye_registered","paye"]')],
 ["trade predicate",w.includes("requiresTrade")],
 ["data predicate",w.includes("requiresDataProcessing")],
 ["tender predicate",w.includes("requiresTender")],
 ["runtime current",/version:"v(?:7[5-9]|[89][0-9])",runtime:"cloudflare-worker"/.test(w)],
 ["pack ui warns no auto publish",h.includes("Nothing will be approved or published automatically")]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
