import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MAX_EVALUATION_COHORT,evaluationCohortPolicy} from '../cloudflare/src/evaluation-entry.js';

assert.equal(MAX_EVALUATION_COHORT,30,'evaluation cohort cap must remain 30');
const emails=count=>Array.from({length:count},(_,index)=>`evaluator${index+1}@example.test`).join(',');

let policy=evaluationCohortPolicy({REGISTRATION_MODE:'cohort',REGISTRATION_COHORT_EMAILS_SECRET:emails(30)});
assert.equal(policy.configured,true,'exactly 30 unique evaluators must be accepted');
assert.equal(policy.cohortSize,30);
assert.equal(policy.reason,null);

policy=evaluationCohortPolicy({REGISTRATION_MODE:'cohort',REGISTRATION_COHORT_EMAILS_SECRET:`${emails(29)},EVALUATOR1@example.test`});
assert.equal(policy.configured,true,'duplicates must not inflate the unique evaluator count');
assert.equal(policy.cohortSize,29);

policy=evaluationCohortPolicy({REGISTRATION_MODE:'cohort',REGISTRATION_COHORT_EMAILS_SECRET:emails(31)});
assert.equal(policy.configured,false,'31 unique evaluators must fail closed');
assert.equal(policy.reason,'cohort_limit_exceeded');

policy=evaluationCohortPolicy({REGISTRATION_MODE:'cohort',REGISTRATION_COHORT_EMAILS_SECRET:''});
assert.equal(policy.configured,false,'missing evaluator list must fail closed');
assert.equal(policy.reason,'cohort_unconfigured');

policy=evaluationCohortPolicy({REGISTRATION_MODE:'open',REGISTRATION_COHORT_EMAILS_SECRET:emails(1)});
assert.equal(policy.configured,false,'evaluation must never fall back to open registration');
assert.equal(policy.reason,'evaluation_requires_cohort');

const config=fs.readFileSync('cloudflare/wrangler-evaluation.toml','utf8');
assert.match(config,/name = "bw-compliance-os-evaluation"/);
assert.match(config,/main = "src\/evaluation-entry\.js"/);
assert.match(config,/pattern = "evaluate\.thebedesk\.com"/);
assert.match(config,/REGISTRATION_MODE = "cohort"/);
assert.match(config,/GOOGLE_OAUTH_CLIENT_ID = ""/);
assert.match(config,/FACEBOOK_APP_ID = ""/);
assert.match(config,/REGISTRATION_COHORT_EMAILS_SECRET/);
assert.doesNotMatch(config,/release\/production\.json/,'evaluation config must not mutate production release authority');

const production=fs.readFileSync('cloudflare/wrangler.toml','utf8');
assert.match(production,/name = "bw-compliance-os"/);
assert.match(production,/pattern = "thebedesk\.com"/);
assert.match(production,/main = "src\/release-governance-entry\.js"/);
assert.ok(!production.includes('evaluate.thebedesk.com'),'production Worker config must not acquire the evaluation domain');

const entry=fs.readFileSync('cloudflare/src/evaluation-entry.js','utf8');
assert.match(entry,/MAX_EVALUATION_COHORT=30/);
assert.match(entry,/cohort_limit_exceeded/);
assert.match(entry,/evaluation_requires_cohort/);
assert.match(entry,/registration-proof\/challenge/);
assert.doesNotMatch(entry,/innerHTML\s*=/);

console.log('V536 30-user evaluation cohort lane PASS');
