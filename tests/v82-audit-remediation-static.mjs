import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const wrangler=read('cloudflare/wrangler.toml');
const governance=read('cloudflare/src/release-governance-entry.js');
const production=read('cloudflare/src/production-entry.js');
const directRegistration=read('public/js/register-direct.js');
const oauthUi=read('public/js/oauth-availability.js');
const syntheticHold=read('scripts/production-synthetic-hold-wrapper.mjs');
const mobileSmoke=read('scripts/production-mobile-postdeploy-smoke.mjs');
const launchWorkflow=read('.github/workflows/production-launch-audit.yml');
const mobileWorkflow=read('.github/workflows/mobile-postdeploy-smoke.yml');
const replayWorkflow=read('.github/workflows/production-audit-replay.yml');
const release=JSON.parse(read('release/production.json'));

assert.match(wrangler,/^main\s*=\s*"src\/release-governance-entry\.js"/m,'production must enter through release governance');
assert.match(wrangler,/^REGISTRATION_MODE\s*=\s*"hold"/m,'customer activation must remain HOLD until reviewed');
assert.match(wrangler,/^REGISTRATION_COHORT_EMAILS\s*=\s*""/m,'launch cohort must default empty');

assert.match(governance,/VALID_REGISTRATION_MODES=new Set\(\["hold","cohort","open"\]\)/,'registration states must be explicit');
assert.match(governance,/error:"registration_on_hold"/,'HOLD must be enforced server-side');
assert.match(governance,/error:"registration_not_in_cohort"/,'cohort allow-list must be enforced server-side');
assert.match(governance,/SYNTHETIC_EMAIL_RE=\/\^synthetic\\\.lifecycle/,'synthetic HOLD override must be identity-bound');
assert.match(governance,/AUDIT_INTEGRITY_SECRET/,'synthetic HOLD override must require audit secret');
assert.match(governance,/registration-override:\$\{email\}/,'synthetic HOLD override must be signed for the exact email');
assert.match(governance,/x-thebe-registration-audit/,'synthetic HOLD override header must be explicit');
assert.match(governance,/path==="\/api\/version"/,'immutable release provenance endpoint missing');
assert.match(governance,/"x-thebe-source-sha"/,'source SHA response header missing');
assert.match(governance,/"x-thebe-release-sequence"/,'release sequence response header missing');
assert.match(governance,/path==="\/api\/auth\/oauth\/providers"/,'OAuth availability endpoint missing');
assert.match(governance,/oauthProviders:oauthProviders\(env\)/,'readiness must expose OAuth availability');
assert.match(governance,/oauth-availability\.js/,'HTML must inject OAuth availability gating');

assert.match(production,/\/api\/auth\/registration-proof\/challenge/,'production wrapper must own first-party proof challenge');
assert.match(production,/verifyRegistrationProof\(request,env,body\?\.turnstileToken\)/,'production wrapper must verify proof before registration');
assert.match(directRegistration,/\/api\/auth\/registration-proof\/challenge/,'direct registration client must request first-party proof');
assert.match(directRegistration,/honeypot:/,'direct registration proof must preserve honeypot');

assert.match(oauthUi,/oauth-google-disabled/,'Google controls must fail closed');
assert.match(oauthUi,/oauth-facebook-disabled/,'Facebook controls must fail closed');
assert.match(oauthUi,/\/api\/auth\/oauth\/providers/,'OAuth UI must bind to server availability');

assert.match(syntheticHold,/SYNTHETIC_EMAIL_RE=/,'synthetic lifecycle wrapper must reject arbitrary registration identities');
assert.match(syntheticHold,/createHmac\('sha256',auditSecret\)/,'synthetic lifecycle wrapper must sign the registration override');
assert.match(syntheticHold,/x-thebe-registration-audit/,'synthetic lifecycle wrapper must send only the audit override header');
assert.match(syntheticHold,/await import\('\.\/production-synthetic-browser-wrapper\.mjs'\)/,'signed HOLD wrapper must preserve browser-backed lifecycle proof');

assert.match(mobileSmoke,/viewport:\{width:390,height:844\}/,'mobile smoke must retain Android-sized viewport');
assert.match(mobileSmoke,/MOBILE_POSTDEPLOY_SMOKE_PASS/,'mobile smoke must have an explicit success marker');
assert.match(mobileSmoke,/unavailable Google sign-in control must be hidden/,'mobile smoke must prove deferred Google control is hidden');
assert.match(mobileSmoke,/unavailable Facebook sign-in control must be hidden/,'mobile smoke must prove deferred Facebook control is hidden');
assert.match(mobileWorkflow,/node scripts\/production-mobile-postdeploy-smoke\.mjs/,'automatic mobile audit must execute reusable source script');
assert.match(launchWorkflow,/node scripts\/production-synthetic-hold-wrapper\.mjs/,'automatic Phase 0 lifecycle must respect customer HOLD');

assert.match(replayWorkflow,/workflow_dispatch:/,'skipped production audits must have an explicit replay path');
assert.match(replayWorkflow,/target_sha:/,'replay path must bind to an exact target SHA');
assert.match(replayWorkflow,/refusing stale replay/,'replay must refuse a stale non-main target');
assert.match(replayWorkflow,/require_success deploy-production\.yml/,'replay must require successful production deployment evidence');
assert.match(replayWorkflow,/require_success postdeploy-smoke\.yml/,'replay must require successful exact post-deploy smoke evidence');
assert.match(replayWorkflow,/node scripts\/production-launch-audit\.mjs/,'replay must execute the Phase 0 production audit');
assert.match(replayWorkflow,/node scripts\/production-mobile-postdeploy-smoke\.mjs/,'replay must execute the mobile production audit');
assert.match(replayWorkflow,/LIVE_PROVENANCE_PASS/,'replay must prove live release provenance');
assert.match(replayWorkflow,/production-synthetic-hold-wrapper\.mjs/,'replay must support signed synthetic lifecycle closure');

assert.equal(release.release,'production','release authority must be production');
assert.ok(Number.isInteger(release.sequence)&&release.sequence>0,'release sequence must be a positive integer');
assert.match(String(release.sourceSha),/^[0-9a-f]{40}$/,'release source SHA must be immutable full SHA');

console.log(`AUDIT_REMEDIATION_STATIC_PASS sequence=${release.sequence} sourceSha=${release.sourceSha}`);
