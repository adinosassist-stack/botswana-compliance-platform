import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=readFileSync(new URL('../.github/workflows/thebe-life-protected-private-worker-deploy.yml',import.meta.url),'utf8');
test('private deployment is manual, from reviewed main, after verified protection and environment reviewer',()=>{
 for(const pattern of [
  /workflow_dispatch:/,/github\.ref == 'refs\/heads\/main'/,
  /APPROVED_SOURCE_SHA/,/test "\$APPROVED_SOURCE_SHA" = "\$EXACT_MAIN_SHA"/,
  /node scripts\/verify-thebe-life-private-environment\.mjs/,
  /needs: verify-existing-environment/,
  /environment: thebe-life-private-staging/,
  /DEPLOY_INERT_THEBE_LIFE_PRIVATE_STAGING/,
  /LIFE_STAGING_GITHUB_ENV_READ_TOKEN/,
  /LIFE_STAGING_CLOUDFLARE_TOKEN/
 ])assert.match(file,pattern);
 assert.doesNotMatch(file,/\b(push|schedule|pull_request):/);
});
test('deploy is strictly inert Worker with no non-Life environment',()=>{
 assert.match(file,/npx wrangler deploy --config cloudflare\/wrangler\.life-staging\.toml/);
 assert.doesNotMatch(file,/wrangler\.production|wrangler\.billing|wrangler\.general-ai/);
 assert.doesNotMatch(file,/--name\s|--route\s|--routes\s|d1 execute/);
 assert.match(file,/test "\$CLOUDFLARE_ACCOUNT_ID" = "ddd23cab31928a4bb3d4998df9b26d1d"/);
});
