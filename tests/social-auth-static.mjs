import fs from "node:fs";
const server=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["google start",server.includes('/api/auth/oauth/:provider/start')],
 ["oauth callback",server.includes('/api/auth/oauth/:provider/callback')],
 ["linked accounts endpoint",server.includes('/api/account/social')],
 ["unlink endpoint",server.includes('app.delete("/api/account/social/:provider"')],
 ["signed state",server.includes("encodeState")&&server.includes("decodeState")],
 ["verified Google email",server.includes('provider==="google" && !profile.emailVerified')],
 ["Facebook no email-only autolink",server.includes("An account already exists with this email")],
 ["UI Google",html.includes("Continue with Google")],
 ["UI Facebook",html.includes("Continue with Facebook")],
 ["UI accounts",html.includes("Sign-in & Accounts")||html.includes("Sign-in methods")]
];
let bad=checks.filter(x=>!x[1]);
for(const [name,ok] of checks) console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(bad.length)process.exit(1);
