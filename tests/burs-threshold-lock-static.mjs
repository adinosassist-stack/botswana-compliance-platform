import fs from "node:fs";
const p=JSON.parse(fs.readFileSync(new URL("../cloudflare/seeds/botswana-foundation-pack-v1.json",import.meta.url),"utf8"));
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const vat=p.rules.find(x=>x.key==="vat-compulsory-threshold-1m");
const paye=p.rules.find(x=>x.key==="paye-itw8-threshold-2500");
const vatConflict=p.conflicts.find(x=>x.key==="vat-registration-threshold");
const payeConflict=p.conflicts.find(x=>x.key==="paye-itw8-salary-threshold");
const vatAct=p.sources.find(x=>x.key==="burs-vat-act-2026");
const taxTable=p.sources.find(x=>x.key==="burs-tax-table-2026");
const checks=[
 ["VAT threshold execution remains absent",!vat],
 ["PAYE threshold execution remains absent",!paye],
 ["VAT source conflict resolved against 2026 Act",vatConflict?.status==="resolved"&&vatConflict?.sourceKeys?.includes("burs-vat-act-2026")&&String(vatConflict?.resolutionNotes||"").includes("P1,000,000")],
 ["PAYE source conflict resolved without numeric shortcut",payeConflict?.status==="resolved"&&payeConflict?.sourceKeys?.includes("burs-tax-table-2026")&&/no standalone/i.test(String(payeConflict?.resolutionNotes||""))],
 ["current primary tax sources recorded",vatAct?.type==="official"&&taxTable?.type==="official"],
 ["threshold engine still validates reviewed numeric rules",w.includes("thresholdAmount")&&w.includes("invalid_threshold_amount")],
 ["BW readiness exposes reconciled source governance",h.includes('id="bwreadiness"')&&h.includes("Source reconciled")&&h.includes("VAT / PAYE threshold source governance")],
 ["workspace has no static open tax conflicts",h.includes("const sourceConflicts=[];")&&h.includes("const sourceResolutions=[")],
 ["resolved history remains visible",h.includes("Resolved source issue:")&&h.includes("Source validation & resolution history")],
 ["runtime current",/version:"v(?:7[5-9]|[89][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
