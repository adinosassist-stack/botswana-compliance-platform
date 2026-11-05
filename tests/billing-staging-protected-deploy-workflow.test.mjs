import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('.github/workflows/deploy-billing-staging-protected.yml','utf8');
test('workflow is dispatch-only and gated on exact main with independent environment review',()=>{
 assert.match(s,/workflow_dispatch:/);assert.doesNotMatch(s,/\n  push:/);assert.match(s,/github\.ref == 'refs\/heads\/main'/);
 assert.match(s,/environment: billing-staging-protected/);assert.match(s,/independent_thusico_review_policy_required/);
 assert.match(s,/prevent_self_review/);assert.match(s,/protected_branches/);assert.match(s,/staging exact-main-SHA gate refused/);
});
test('preflight is default and deployment has separate explicit owner authorization',()=>{
 assert.match(s,/default: PREFLIGHT_ONLY/);assert.match(s,/DEPLOY_READONLY_BILLING_STAGING/);
 assert.match(s,/if: inputs\.mode == 'DEPLOY_APPROVED'/);assert.match(s,/PREFLIGHT_ONLY/);
 assert.match(s,/verify-billing-staging-deploy-boundary\.mjs/);
});
test('deploy uses only dedicated staging secrets and denies payment activation',()=>{
 assert.match(s,/BILLING_STAGING_SESSION_SECRET/);assert.match(s,/BILLING_STAGING_AUDIT_INTEGRITY_SECRET/);
 assert.match(s,/BILLING_STAGING_CLOUDFLARE_TOKEN/);assert.doesNotMatch(s,/secrets\.CLOUDFLARE_API_TOKEN/);
 assert.match(s,/popUploadsEnabled!==false/);assert.match(s,/billingMutationsEnabled!==false/);
 assert.doesNotMatch(s,/\bd1 execute\b|\bd1 migrations apply\b/);
});
