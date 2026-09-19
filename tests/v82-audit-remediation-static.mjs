import fs from 'node:fs';
import assert from 'node:assert/strict';
import entry, {registrationGate, registrationMode} from '../cloudflare/src/release-governance-entry.js';

const read=path=>fs.readFileSync(path,'utf8');
const wrangler=read('cloudflare/wrangler.toml');
const governance=read('cloudflare/src/release-governance-entry.js');
const registrationBoundary=read('cloudflare/src/registration-boundary.js');
const production=read('cloudflare/src/production-entry.js');
const directRegistrationHtml=read('public/register-direct.html');
const directRegistration=read('public/js/register-direct.js');
const oauthUi=read('public/js/oauth-availability.js');
const syntheticHold=read('scripts/production-synthetic-hold-wrapper.mjs');
const mobileSmoke=read('scripts/production-mobile-postdeploy-smoke.mjs');
const remediationWorkflow=read('.github/workflows/audit-remediation-ci.yml');
const recoveryWorkflow=read('.github/workflows/recovery-ci.yml');
const dependencyAudit=read('scripts/dependency-audit.mjs');
const packageJson=JSON.parse(read('package.json'));
const launchWorkflow=read('.github/workflows/production-launch-audit.yml');
const mobileWorkflow=read('.github/workflows/mobile-postdeploy-smoke.yml');
const replayWorkflow=read('.github/workflows/production-audit-replay.yml');
const release=JSON.parse(read('release/production.json'));

assert.match(wrangler,/^main\s*=\s*"src\/release-governance-entry\.js"/m,'production must enter through release governance');
assert.match(wrangler,/^REGISTRATION_MODE\s*=\s*"open"/m,'reviewed production activation must enable public registration');
assert.doesNotMatch(wrangler,/^REGISTRATION_COHORT_EMAILS\s*=/m,'customer cohort identities must not be committed in public Wrangler vars');
assert.equal(packageJson.scripts['audit:dependencies'],'node scripts/dependency-audit.mjs','dependency audit must run through the fail-closed canonical audit wrapper');
assert.match(recoveryWorkflow,/name: Genuine production dependency audit\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: npm run audit:dependencies/,'Recovery CI must call the canonical dependency audit wrapper with an ephemeral GitHub token for advisory fallback');
assert.doesNotMatch(recoveryWorkflow,/run: npm audit /,'Recovery CI must not bypass the canonical dependency audit wrapper');
assert.match(dependencyAudit,/spawnSync\('npm',\['audit','--omit=dev','--json','--audit-level=high'\]/,'canonical dependency audit must preserve the production-only npm audit scope');
assert.match(dependencyAudit,/if\(classified\.kind==='vulnerabilities'\)[\s\S]*process\.exitCode=1;[\s\S]*return;/,'a genuine npm vulnerability report must fail without falling through to an alternate source');
assert.match(dependencyAudit,/validateLockAndBuildSbom\(process\.cwd\(\)\)/,'fallback must validate the BF-07 supply-chain authority before advisory lookup');
assert.match(dependencyAudit,/function productionLockedComponents\(lock\)[\s\S]*meta\.dev===true[\s\S]*const components=productionLockedComponents\(lock\)/,'fallback must mirror npm --omit=dev by excluding dev-only lock entries');
assert.match(dependencyAudit,/\{type:'reviewed',severity:'high'\}[\s\S]*\{type:'reviewed',severity:'critical'\}[\s\S]*\{type:'malware',severity:''\}/,'fallback must cover reviewed high/critical advisories and malware');
assert.match(dependencyAudit,/if\(!response\.ok\)throw new Error/,'advisory fallback must fail closed on upstream API errors');

assert.match(governance,/VALID_REGISTRATION_MODES=new Set\(\["hold","cohort","open"\]\)/,'registration states must be explicit');
assert.match(governance,/REGISTRATION_COHORT_EMAILS_SECRET/,'launch cohort must come from a secret-backed runtime binding');
assert.match(governance,/if\(!cohort\.size\)return json\(\{error:"registration_policy_invalid"/,'empty cohort configuration must fail closed');
assert.match(governance,/error:"registration_on_hold"/,'HOLD must be enforced server-side');
assert.match(governance,/error:"registration_not_in_cohort"/,'cohort allow-list must be enforced server-side');
assert.match(governance,/SYNTHETIC_EMAIL_RE=\/\^synthetic\\\.lifecycle/,'synthetic HOLD override must be identity-bound');
assert.match(governance,/AUDIT_INTEGRITY_SECRET/,'synthetic HOLD override must require audit secret');
assert.match(governance,/registration-override:\$\{email\}/,'synthetic HOLD override must be signed for the exact email');
assert.match(governance,/x-thebe-registration-audit/,'synthetic HOLD override header must be explicit');
assert.match(governance,/MAX_REGISTRATION_POLICY_BODY_BYTES=16\*1024/,'registration policy wrapper must preserve the canonical 16 KiB body boundary');
assert.match(governance,/reader\.read\(\)/,'registration policy wrapper must enforce the bound while streaming the clone');
assert.match(governance,/error:"payload_too_large"/,'oversized registration policy bodies must fail closed');
assert.doesNotMatch(governance,/request\.clone\(\)\.json\(\)/,'registration governance must not reintroduce unbounded JSON parsing');
const registrationGateSource=governance.slice(governance.indexOf('async function registrationGate'),governance.indexOf('function injectOauthAvailabilityScript'));
assert.ok(registrationGateSource.indexOf('const parsed=await readJsonBoundedClone(request);')<registrationGateSource.indexOf('if(mode==="open")return null;'),'open registration must cross the 16 KiB body boundary before delegation');
assert.match(governance,/durableRegistrationChallengeGate\(request,env\)/,'proof challenge must cross the durable release-boundary throttle');
assert.match(governance,/validateAndClaimRegistrationProof\(request,env,parsed\.body\?\.turnstileToken\)/,'registration must atomically claim a durable proof before inner registration');
assert.match(registrationBoundary,/registration_proof_challenge_ip/,'challenge limiter must use a dedicated durable scope');
assert.match(registrationBoundary,/INSERT INTO auth_rate_limits\(key_hash,scope,count,window_start,expires_at\)/,'challenge limiter must persist in the D1 auth ledger');
assert.match(registrationBoundary,/INSERT OR IGNORE INTO auth_rate_limits\(key_hash,scope,count,window_start,expires_at\)/,'proof replay claim must be atomic across worker isolates');
assert.match(registrationBoundary,/registration_proof_replay/,'proof replay claim must use an isolated ledger scope');
assert.match(registrationBoundary,/registration-boundary-replay-v1/,'replay ledger keys must be HMAC-derived');
assert.doesNotMatch(registrationBoundary,/new Map\(/,'release-boundary registration controls must not depend on isolate-local maps');
assert.match(governance,/path==="\/api\/version"/,'immutable release provenance endpoint missing');
assert.match(governance,/"x-thebe-source-sha"/,'source SHA response header missing');
assert.match(governance,/"x-thebe-release-sequence"/,'release sequence response header missing');
assert.match(governance,/path==="\/api\/auth\/oauth\/providers"/,'OAuth availability endpoint missing');
assert.match(governance,/path==="\/api\/auth\/registration-policy"/,'registration policy endpoint missing');
assert.match(governance,/oauthProviders:oauthProviders\(env\)/,'readiness must expose OAuth availability');
assert.match(governance,/oauth-availability\.js/,'HTML must inject availability gating');

assert.match(production,/\/api\/auth\/registration-proof\/challenge/,'production wrapper must own first-party proof challenge');
assert.match(production,/verifyRegistrationProof\(request,env,body\?\.turnstileToken\)/,'production wrapper must verify proof before registration');
assert.match(directRegistration,/\/api\/auth\/registration-proof\/challenge/,'direct registration client must request first-party proof');
assert.match(directRegistration,/honeypot:/,'direct registration proof must preserve honeypot');
assert.match(directRegistrationHtml,/\/js\/oauth-availability\.js/,'direct registration page must load activation-policy gating explicitly');
assert.match(directRegistrationHtml,/<\/body>\s*<\/html>\s*$/,'direct registration document must be structurally complete so governance decoration cannot be skipped');
assert.ok(directRegistrationHtml.includes('html:not(.registration-open):not(.registration-cohort) #registerForm{display:none}'),'direct registration form must fail closed before activation policy resolves');

assert.match(oauthUi,/`oauth-\$\{provider\}-disabled`/,'OAuth provider controls must expose a generic fail-closed disabled state');
assert.match(oauthUi,/setProvider\("google",false\)/,'Google controls must fail closed before availability is proven');
assert.match(oauthUi,/setProvider\("facebook",false\)/,'Facebook controls must fail closed before availability is proven');
assert.match(oauthUi,/\/api\/auth\/oauth\/providers/,'OAuth UI must bind to server availability');
assert.match(oauthUi,/\/api\/auth\/registration-policy/,'public registration UI must bind to server activation policy');
assert.match(oauthUi,/element\.hidden=true/,'availability controls must use CSP-safe hidden state');
assert.match(oauthUi,/registrationHoldNotice/,'direct registration must expose a HOLD notice');
assert.doesNotMatch(oauthUi,/createElement\("style"\)/,'availability gating must not rely on CSP-blocked inline style injection');

assert.match(syntheticHold,/SYNTHETIC_EMAIL_RE=/,'synthetic lifecycle wrapper must reject arbitrary registration identities');
assert.match(syntheticHold,/createHmac\('sha256',auditSecret\)/,'synthetic lifecycle wrapper must sign the registration override');
assert.match(syntheticHold,/x-thebe-registration-audit/,'synthetic lifecycle wrapper must send only the audit override header');
assert.match(syntheticHold,/await import\('\.\/production-synthetic-browser-wrapper\.mjs'\)/,'signed HOLD wrapper must preserve browser-backed lifecycle proof');

assert.match(mobileSmoke,/viewport:\{width:390,height:844\}/,'mobile smoke must retain Android-sized viewport');
assert.match(mobileSmoke,/MOBILE_POSTDEPLOY_SMOKE_PASS/,'mobile smoke must have an explicit success marker');
assert.match(mobileSmoke,/unavailable Google sign-in control must be hidden directly/,'mobile smoke must prove deferred Google control is directly hidden');
assert.match(mobileSmoke,/unavailable Facebook sign-in control must be hidden directly/,'mobile smoke must prove deferred Facebook control is directly hidden');
assert.match(mobileSmoke,/HOLD must hide public registration CTA/,'mobile smoke must prove HOLD closes the public registration CTA');
assert.match(mobileSmoke,/direct registration form must fail closed during HOLD/,'mobile smoke must prove direct registration fails closed during HOLD');
assert.match(mobileWorkflow,/node scripts\/production-mobile-postdeploy-smoke\.mjs/,'automatic mobile audit must execute reusable source script');
assert.match(launchWorkflow,/node scripts\/production-synthetic-full-user-wrapper\.mjs/,'automatic Phase 0 lifecycle must execute the mandatory full-user wrapper');

assert.match(remediationWorkflow,/run-name: Audit remediation CI \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,'remediation CI run identity must name the exact PR head');
assert.match(remediationWorkflow,/EXPECTED_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,'remediation CI must bind expected SHA to the PR head');
assert.match(remediationWorkflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,'remediation CI checkout must explicitly use the PR head SHA');
assert.match(remediationWorkflow,/PR head checkout mismatch/,'remediation CI must fail if checkout differs from exact PR head');

assert.match(replayWorkflow,/workflow_dispatch:/,'skipped production audits must have an explicit replay path');
assert.match(replayWorkflow,/target_sha:/,'replay path must bind to an exact target SHA');
assert.match(replayWorkflow,/refusing stale replay/,'replay must refuse a stale non-main target');
assert.match(replayWorkflow,/require_success deploy-production\.yml/,'replay must require successful production deployment evidence');
assert.match(replayWorkflow,/require_success postdeploy-smoke\.yml/,'replay must require successful exact post-deploy smoke evidence');
assert.match(replayWorkflow,/node scripts\/production-launch-audit\.mjs/,'replay must execute the Phase 0 production audit');
assert.match(replayWorkflow,/node scripts\/production-mobile-postdeploy-smoke\.mjs/,'replay must execute the mobile production audit');
assert.match(replayWorkflow,/LIVE_PROVENANCE_PASS/,'replay must prove live release provenance');
assert.match(replayWorkflow,/Mandatory signed synthetic registration lifecycle closure/,'replay must make synthetic lifecycle closure mandatory');
assert.match(replayWorkflow,/production-synthetic-hold-wrapper\.mjs/,'replay must execute signed synthetic lifecycle closure');
assert.doesNotMatch(replayWorkflow,/run_synthetic_lifecycle/,'release closure must not be skippable with a boolean input');

assert.equal(release.release,'production','release authority must be production');
assert.ok(Number.isInteger(release.sequence)&&release.sequence>0,'release sequence must be a positive integer');
assert.match(String(release.sourceSha),/^[0-9a-f]{40}$/,'release source SHA must be immutable full SHA');

// Public activation removes only the cohort gate; the production proof boundary still applies.
assert.equal(registrationMode({}), 'hold', 'missing activation configuration must retain safe rollback default');
const registrationRequest=()=>new Request('https://thebedesk.com/api/auth/register', {
  method:'POST', headers:{'content-type':'application/json'}, body:'{}'
});
assert.equal(await registrationGate(registrationRequest(), {REGISTRATION_MODE:'open'}), null,
  'public registration must not require a cohort secret');
const oversizedOpenRequest=new Request('https://thebedesk.com/api/auth/register', {
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({padding:'x'.repeat(17*1024)})
});
const oversizedOpenResponse=await registrationGate(oversizedOpenRequest,{REGISTRATION_MODE:'open'});
assert.equal(oversizedOpenResponse.status,413,'open registration must reject bodies above 16 KiB before proof parsing');
for(const mode of ['hold','invalid','cohort']){
  const response=await registrationGate(registrationRequest(), {REGISTRATION_MODE:mode});
  assert.equal(response.status,503, `${mode} without an approved cohort must fail closed`);
}
for(const path of ['/api/auth/register','/__thebe_api/auth/register','/?__thebe_api_path=/api/auth/register']){
  const response=await entry.fetch(new Request(`https://thebedesk.com${path}`, {
    method:'POST', headers:{'content-type':'application/json'}, body:'{}'
  }), {REGISTRATION_MODE:'open'}, {});
  assert.equal(response.status,403, 'open mode must retain registration proof protection on every transport');
  assert.equal((await response.json()).error,'registration_protection_failed');
}
const policy=await entry.fetch(new Request('https://thebedesk.com/api/auth/registration-policy'), {REGISTRATION_MODE:'open'}, {});
assert.deepEqual(await policy.json(), {ok:true,mode:'open'});

console.log(`AUDIT_REMEDIATION_STATIC_PASS sequence=${release.sequence} sourceSha=${release.sourceSha}`);
