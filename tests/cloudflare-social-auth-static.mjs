import fs from "node:fs";
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const checks=[
 ["worker google/facebook start",worker.includes("oauthProviderConfig")&&worker.includes("start$/")&&worker.includes("oauthAuthorizeUrl")],
 ["worker callback",worker.includes("callback$/")&&worker.includes("exchangeOauthCode")&&worker.includes("fetchOauthProfile")],
 ["signed state",worker.includes("encodeOauthState")&&worker.includes("decodeOauthState")],
 ["state cookie",worker.includes("oauth_state_${provider}")],
 ["google verified email",worker.includes('provider===\"google\"&&!profile.emailVerified')],
 ["facebook explicit link",worker.includes("facebook_requires_explicit_link")],
 ["account social list",worker.includes('/api/account/social\"&&req.method===\"GET\"')],
 ["account social link",worker.includes("social\\/(google|facebook)\\/link$/")],
 ["account social unlink",worker.includes("social\\/(google|facebook)$/")],
 ["last login protection",worker.includes("last_login_method")],
 ["external identities D1",schema.includes("external_identities")],
 ["UI social buttons",html.includes("Continue with Google")&&html.includes("Continue with Facebook")]
];
let bad=checks.filter(x=>!x[1]);for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);if(bad.length)process.exit(1);
