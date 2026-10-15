import assert from "node:assert/strict";
import fs from "node:fs";
import {REGISTRATION_LEGAL_ACCEPTANCE_VERSION,registrationLegalAcceptanceConfirmed} from "../cloudflare/src/registration-boundary.js";

const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const legalEntry=fs.readFileSync(new URL("../cloudflare/src/legal-acceptance-entry.js",import.meta.url),"utf8");
const wrangler=fs.readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
const directHtml=fs.readFileSync(new URL("../public/register-direct.html",import.meta.url),"utf8");
const directJs=fs.readFileSync(new URL("../public/js/register-direct.js",import.meta.url),"utf8");
const delegatedUi=fs.readFileSync(new URL("../public/js/event-delegation.js",import.meta.url),"utf8");

assert.equal(REGISTRATION_LEGAL_ACCEPTANCE_VERSION,"2026-10-14");
assert.equal(registrationLegalAcceptanceConfirmed(new Request("https://thebedesk.com/api/auth/register",{headers:{"x-thebe-legal-acceptance":"2026-10-14"}})),true);
assert.equal(registrationLegalAcceptanceConfirmed(new Request("https://thebedesk.com/api/auth/register")),false);
assert.equal(registrationLegalAcceptanceConfirmed(new Request("https://thebedesk.com/api/auth/register",{headers:{"x-thebe-legal-acceptance":"2026-10-13"}})),false);

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
 ["UI social buttons",html.includes("Continue with Google")&&html.includes("Continue with Facebook")],
 ["production uses legal edge",wrangler.includes('main = "src/legal-acceptance-entry.js"')],
 ["direct registration checkbox",directHtml.includes('id="acceptLegal"')&&directHtml.includes('href="/terms/"')&&directHtml.includes('href="/privacy/"')],
 ["direct registration sends version",directJs.includes('LEGAL_ACCEPTANCE_VERSION="2026-10-14"')&&directJs.includes('"x-thebe-legal-acceptance":LEGAL_ACCEPTANCE_VERSION')&&directJs.includes("acceptLegal:true")],
 ["homepage consent is explicit",delegatedUi.includes('id="authLegalConsent"')||delegatedUi.includes('checkbox.id="authLegalConsent"')],
 ["edge requires body and version",legalEntry.includes('body?.acceptLegal===true')&&legalEntry.includes('x-thebe-legal-acceptance')&&legalEntry.includes('legal_acceptance_required')],
 ["edge seals legal acceptance",legalEntry.includes('eventType:"LEGAL_ACCEPTANCE_RECORDED"')&&legalEntry.includes('termsVersion:LEGAL_ACCEPTANCE_VERSION')&&legalEntry.includes('privacyVersion:LEGAL_ACCEPTANCE_VERSION')],
 ["oauth sign-in uses existing identity only",legalEntry.includes("existingLinkedIdentity:true")&&legalEntry.includes("account_creation_requires_legal_acceptance")&&legalEntry.includes("FROM external_identities e JOIN users u")],
 ["authenticated oauth linking delegates unchanged",legalEntry.includes('if(state.mode==="link")return base.fetch(request,env,ctx)')]
];
let bad=checks.filter(x=>!x[1]);for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);if(bad.length)process.exit(1);
