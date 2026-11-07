/** Offline static assertion: zero credentials, no cloud IO, no deployment. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../cloudflare/wrangler.general-ai-private-consumer.toml',import.meta.url),'utf8');
const ref=readFileSync(new URL('../cloudflare/wrangler.general-ai-private-rollout.review.toml',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/general-ai-private-queue-protected.yml',import.meta.url),'utf8');
const lines=s=>s.split('\n').filter(x=>!/^\s*(?:#|$)/.test(x));
assert.deepEqual(lines(config),lines(ref),'candidate drifted from independently reviewed inert profile');
assert.match(config,/^workers_dev = false$/m);
assert.match(config,/^preview_urls = false$/m);
assert.doesNotMatch(config,/^\s*(?:route|routes|zone_id|account_id)\s*=/m);
for(const key of ['PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED','PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED','PRIVATE_AI_LEDGER_ISOLATION_VERIFIED'])
 assert.match(config,new RegExp('^'+key+' = "false"$','m'));
assert.doesNotMatch(config,/^APPROVED_SOURCE_SHA\s*=/m);
assert.match(workflow,/environment: general-ai-private-staging/);
assert.match(workflow,/DEPLOY_PRIVATE_GENERAL_AI_QUEUE/);
assert.match(workflow,/test "\$actual" = "\$EXPECTED"/);
assert.match(workflow,/GENERAL_AI_QUEUE_STAGING_CLOUDFLARE_TOKEN/);
assert.doesNotMatch(workflow,/GENERAL_AI_STAGING_CLOUDFLARE_TOKEN|PRODUCTION_CLOUDFLARE_TOKEN/);
console.log('PASS: dedicated consumer deploy config matches review-only profile and protected workflow');
