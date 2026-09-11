import fs from "node:fs";
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["onboarding GET",worker.includes('/api/account/onboarding\"&&req.method===\"GET\"')],
 ["onboarding completion",worker.includes('/api/account/onboarding/complete\"&&req.method===\"POST\"')],
 ["guided setup uses csrf-aware apiJson",html.includes('apiJson("/api/account/onboarding/complete"')],
 ["no raw onboarding completion fetch",!html.includes('fetch("/api/account/onboarding/complete"')]
];
let bad=checks.filter(x=>!x[1]);for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);if(bad.length)process.exit(1);
