import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const wrangler=read('cloudflare/wrangler.toml');
const governance=read('cloudflare/src/release-governance-entry.js');
const production=read('cloudflare/src/production-entry.js');
const directRegistration=read('public/js/register-direct.js');
const oauthUi=read('public/js/oauth-availability.js');
const release=JSON.parse(read('release/production.json'));

assert.match(wrangler,/^main\s*=\s*"src\/release-governance-entry\.js"/m,'production must enter through release governance');
assert.match(wrangler,/^REGISTRATION_MODE\s*=\s*"hold"/m,'customer activation must remain HOLD until reviewed');
assert.match(wrangler,/^REGISTRATION_COHORT_EMAILS\s*=\s*""/m,'launch cohort must default empty');

assert.match(governance,/VALID_REGISTRATION_MODES=new Set\(\["hold","cohort","open"\]\)/,'registration states must be explicit');
assert.match(governance,/error:"registration_on_hold"/,'HOLD must be enforced server-side');
assert.match(governance,/error:"registration_not_in_cohort"/,'cohort allow-list must be enforced server-side');
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

assert.equal(release.release,'production','release authority must be production');
assert.ok(Number.isInteger(release.sequence)&&release.sequence>0,'release sequence must be a positive integer');
assert.match(String(release.sourceSha),/^[0-9a-f]{40}$/,'release source SHA must be immutable full SHA');

console.log(`AUDIT_REMEDIATION_STATIC_PASS sequence=${release.sequence} sourceSha=${release.sourceSha}`);
