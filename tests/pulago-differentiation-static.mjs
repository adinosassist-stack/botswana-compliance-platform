import fs from "node:fs";
const h=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const d=fs.readFileSync(new URL("../V50_PULAGO_DIFFERENTIATION.md",import.meta.url),"utf8");
const checks=[
 ["operating SME hero",h.includes("operating Botswana SMEs")],
 ["not registration service",h.includes("Not a company-registration service")],
 ["employer shield differentiation",h.includes("Employer Shield")],
 ["regulatory intelligence",h.includes("Regulatory Intelligence")],
 ["evidence chain",h.includes("Evidence Chain")],
 ["inspection readiness",h.includes("Inspection Readiness")],
 ["passport",h.includes("Compliance Passport")],
 ["monitor pricing label",h.includes("<h3>Monitor</h3>")],
 ["protect pricing label",h.includes("<h3>Protect</h3>")],
 ["control pricing label",h.includes("<h3>Control</h3>")],
 ["3 pass strategy",d.includes("Pass 1")&&d.includes("Pass 2")&&d.includes("Pass 3")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
