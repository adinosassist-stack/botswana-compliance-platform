import fs from "node:fs";
const p=JSON.parse(fs.readFileSync(new URL("../cloudflare/seeds/botswana-foundation-pack-v1.json",import.meta.url),"utf8"));
const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const vat=p.rules.find(x=>x.key==="vat-compulsory-threshold-1m");
const paye=p.rules.find(x=>x.key==="paye-itw8-threshold-2500");
const vatConflict=p.conflicts.find(x=>x.key==="vat-registration-threshold");
const payeConflict=p.conflicts.find(x=>x.key==="paye-itw8-salary-threshold");
const checks=[
 ["VAT threshold execution removed",!vat],
 ["PAYE threshold execution removed",!paye],
 ["VAT conflict retained open",vatConflict?.status==="open"&&String(vatConflict?.resolutionNotes||"").includes("disabled")],
 ["PAYE conflict retained open",payeConflict?.status==="open"&&String(payeConflict?.resolutionNotes||"").includes("disabled")],
 ["threshold engine still validates reviewed numeric rules",w.includes("thresholdAmount")&&w.includes("invalid_threshold_amount")],
 ["BW readiness exposes threshold conflict",h.includes('id="bwreadiness"')&&h.includes("Threshold conflict")&&h.includes("VAT / PAYE registration thresholds")],
 ["runtime current",/version:"v(?:7[5-9]|[89][0-9])",runtime:"cloudflare-worker"/.test(w)]
];
const bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
