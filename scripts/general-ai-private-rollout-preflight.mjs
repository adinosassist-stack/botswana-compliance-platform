/** Read-only static review preflight. No Cloudflare/GitHub credentials, writes, deploy or dispatch. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const config=readFileSync(new URL('../cloudflare/wrangler.general-ai-private-rollout.review.toml',import.meta.url),'utf8');
const entry=readFileSync(new URL('../cloudflare/src/general-ai-private-queue-d1-entry.review.js',import.meta.url),'utf8');
const schema=readFileSync(new URL('../cloudflare/schema/general-ai-private-queue-ledger-candidate.sql',import.meta.url),'utf8');
const equal=(key,value)=>new RegExp('^'+key+'\\s*=\\s*"'+value+'"\\s*$','m').test(config);
assert.ok(equal('name','bw-general-ai-private-queue-acceptance'),'wrong worker');
assert.ok(equal('main','src/general-ai-private-queue-d1-entry.review.js'),'unreviewed entry');
assert.ok(equal('workers_dev','false')===false,'workers_dev must be boolean literal, not string');
assert.match(config,/^workers_dev\s*=\s*false$/m);
assert.match(config,/^preview_urls\s*=\s*false$/m);
for(const key of ['PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED','PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED','PRIVATE_AI_LEDGER_ISOLATION_VERIFIED']){
 assert.ok(equal(key,'false'),key+' not default off');
}
assert.ok(equal('binding','STAGING_AI'),'missing private service binding');
assert.ok(equal('service','bw-general-ai-staging'),'wrong target');
assert.ok(config.includes('database_id = "71e2d394-7dec-4878-bdc8-afe8f73cf541"'),'unexpected D1 ID');
assert.ok(config.includes('database_name = "bw-general-ai-private-queue-nonce-staging"'),'unexpected D1 name');
assert.ok(config.includes('queue = "bw-general-ai-private-acceptance-queue"'),'unexpected Queue');
assert.match(config,/^max_batch_size\s*=\s*1$/m);
assert.match(config,/^max_concurrency\s*=\s*1$/m);
assert.match(config,/^max_retries\s*=\s*0$/m);
assert.doesNotMatch(config,/^(?:route|routes|triggers|account_id|zone_id)\s*=/m);
assert.doesNotMatch(config,/^APPROVED_SOURCE_SHA\s*=/m);
assert.match(entry,/PRIVATE_AI_NONCE_DB/);
assert.match(entry,/PRIVATE_AI_LEDGER_ISOLATION_VERIFIED/);
assert.match(schema,/CREATE TABLE ai_private_queue_nonce_claims/);
assert.doesNotMatch(schema,/\b(?:DROP|DELETE|UPDATE|ALTER|ATTACH)\b/i);
console.log('PASS: review-only staging static no-deploy/no-schema/no-public-route preflight');
