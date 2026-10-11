import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const workflow=readFileSync('.github/workflows/regulatory-reviewer-readiness.yml','utf8');
const script=readFileSync('scripts/production-regulatory-reviewer-readiness.mjs','utf8');
const trigger=JSON.parse(readFileSync('operations/regulatory-reviewer-readiness-trigger.json','utf8'));

assert.match(workflow,/environment: production/);
assert.match(workflow,/RUN_READ_ONLY_REGULATORY_REVIEWER_READINESS/);
assert.match(workflow,/PLATFORM_REGULATORY_REVIEWERS: \$\{\{ vars\.PLATFORM_REGULATORY_REVIEWERS \}\}/);
assert.match(workflow,/CF_WORKER_SCRIPT_NAME: bw-compliance-os/);
assert.doesNotMatch(workflow,/reviewer_email:/i,'workflow must not accept reviewer identity as a dispatch input');
assert.match(workflow,/node scripts\/production-regulatory-reviewer-readiness\.mjs/);

assert.match(script,/diagnostic permits SELECT statements only/);
assert.match(script,/^const CF_API=/m);
assert.match(script,/\/workers\/scripts\/\$\{scriptName\}\/settings/);
assert.match(script,/\/d1\/database\/\$\{databaseId\}\/query/);
assert.match(script,/makerCheckerReady/);
assert.match(script,/eligibleDistinctReviewerCandidates/);
assert.match(script,/No user identities, credentials, regulatory approvals, publications, role changes, or production data mutations/);
assert.doesNotMatch(script,/query\(\s*[`'"]\s*(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/i,'diagnostic must not issue mutation SQL');
assert.doesNotMatch(script,/\/foundation-pack\/import|\/sources\/[^'"`]*status|\/rules\/[^'"`]*advance/i,'diagnostic must not call regulatory mutation APIs');
assert.doesNotMatch(script,/console\.log\([^\n]*(?:email|user_id|candidateId|candidateEmail)/i,'diagnostic must not log user identities');

assert.equal(trigger.schema,1);
assert.equal(trigger.requested,true);
assert.equal(trigger.purpose,'inspect-distinct-regulatory-reviewer-readiness');
assert.equal(trigger.safety,'read-only; no identity, role, regulatory, or customer data mutation');

console.log('REGULATORY_REVIEWER_READINESS_STATIC_PASS');
