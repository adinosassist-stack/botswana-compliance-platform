import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('scripts/production-p0-owner-e2e-proof.mjs','utf8');

assert.match(source,/production-synthetic-hold-wrapper\.mjs/,'proof must run inside the signed synthetic tenant lifecycle');
assert.match(source,/__thebeSyntheticBrowserProof/,'proof must extend the canonical synthetic lifecycle rather than inventing registration bypasses');
assert.match(source,/await originalProof\(credentials\);await runP0Journey\(credentials\)/,'canonical proof must run before the P0 journey');
assert.match(source,/finally\{await browser\.close/,'browser cleanup must be guaranteed');

for(const view of ['protecthub','moneyhub','propertyintelligence','peopleops','automationhub']){
  assert.ok(source.includes(`'${view}'`),`P0 proof must cover ${view}`);
}
assert.match(source,/openAddEvidence\(\)/,'evidence UI must be exercised through the real delegated control');
assert.match(source,/aiAdvisorQuestion/,'authenticated Ask Thebe question field must be exercised');
assert.match(source,/aiAdvisorButton/,'authenticated Ask Thebe submit control must be exercised');
assert.match(source,/\/api\/auth\/logout/,'real logout endpoint must be exercised');
assert.match(source,/\/api\/auth\/me/,'authenticated tenant and user identity must be re-read from the real session endpoint');
assert.match(source,/beforeIdentity\.userId/,'pre-logout authenticated user identity must be captured');
assert.match(source,/afterIdentity\.userId===beforeIdentity\.userId/,'post-login user identity must match the original authenticated identity');
assert.match(source,/afterIdentity\.tenantId===beforeIdentity\.tenantId/,'post-login tenant identity must match the original authenticated tenant');
assert.match(source,/\/api\/account\/onboarding\/complete/,'synthetic server-side persistence marker must be written');
assert.match(source,/\/api\/account\/onboarding/,'synthetic persistence marker must be re-read after re-login');
assert.match(source,/\/api\/state/,'workspace state endpoint must be verified across logout and re-login');
assert.match(source,/Number\.isFinite\(beforeState\.version\)/,'first-run empty state is valid only when the authoritative state version is present');
assert.match(source,/afterState\.version===beforeState\.version/,'read-only navigation must not silently mutate workspace state');
assert.match(source,/complete chain.*auth -> workspace -> compliance -> evidence -> finance -> property -> people -> Ask Thebe -> logout\/login -> persistence/s,'required P0 chain must be explicit in proof output');

assert.doesNotMatch(source,/beforeState\.activeCompanyId&&beforeState\.companies\.length>=1/,'first-run proof must not invent an app_state company row that registration does not create');
assert.doesNotMatch(source,/\/api\/evidence\/(?:upload|presign|integrity-upload)/,'P0 proof must not upload evidence or bypass the safe launch hold');
assert.doesNotMatch(source,/\/api\/ai\/cost-control/,'P0 proof must not change AI cost controls');
assert.doesNotMatch(source,/\/api\/agentic\/.*(?:execute|approve|delegation)/,'P0 proof must not widen agent execution authority');
assert.doesNotMatch(source,/PAYMENT_WEBHOOK_SECRET|BILLING_WEBHOOK_SECRET|OPENAI_API_KEY|SESSION_SECRET/,'proof must not require or expose unrelated production secrets');
assert.doesNotMatch(source,/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i,'proof source must not contain direct destructive database operations');

console.log('P0 owner E2E production proof contract: PASS');
