import fs from "node:fs";
const server=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["email abstraction",server.includes("sendTransactionalEmail")],
 ["resend hook",server.includes("api.resend.com/emails")],
 ["account export",server.includes('/api/account/export')],
 ["deletion queue",server.includes('/api/account/delete-request')],
 ["onboarding status",server.includes('/api/account/onboarding')],
 ["data UI",html.includes("Export your data")&&html.includes("Download account export")&&html.includes("Request account deletion")],
 ["welcome setup",html.includes("welcomeSetupBanner")]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
