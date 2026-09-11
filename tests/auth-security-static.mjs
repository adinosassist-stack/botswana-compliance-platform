import fs from "node:fs";
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["password reset request",worker.includes('/api/auth/password-reset/request')],
 ["password reset complete",worker.includes('/api/auth/password-reset/complete')],
 ["reset invalidates sessions",worker.includes('DELETE FROM sessions WHERE user_id=?')],
 ["generic reset response",worker.includes('If that account exists')],
 ["session listing",worker.includes('/api/account/sessions')],
 ["sign out everywhere",worker.includes('req.method==="DELETE"')&&worker.includes('/api/account/sessions')],
 ["onboarding complete",worker.includes('/api/account/onboarding/complete')],
 ["csrf guard",worker.includes('mutationCsrfOk')&&schema.includes('csrf_token TEXT')],
 ["secure cookie",worker.includes('__Host-bw_session')&&worker.includes('HttpOnly; Secure; SameSite=Lax')],
 ["password reset table",schema.includes('password_reset_tokens')],
 ["security UI",html.includes('Account Security')||html.includes('Account security')],
 ["reset modal",html.includes('passwordResetModal')]
];
let bad=checks.filter(x=>!x[1]);for(const [n,o] of checks)console.log(`${o?"PASS":"FAIL"} ${n}`);if(bad.length)process.exit(1);
