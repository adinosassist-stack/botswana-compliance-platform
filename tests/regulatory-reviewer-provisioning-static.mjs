import fs from 'node:fs';
import assert from 'node:assert/strict';

const script=fs.readFileSync('scripts/provision-regulatory-reviewer.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/regulatory-reviewer-provision.yml','utf8');

function has(source,pattern,message){assert.match(source,pattern,message)}
function lacks(source,pattern,message){assert.doesNotMatch(source,pattern,message)}

has(script,/GITHUB_ACTIONS[^\n]+true/,'provisioning must refuse execution outside GitHub Actions');
has(script,/GITHUB_EVENT_NAME[^\n]+workflow_dispatch/,'production mutation must require workflow_dispatch');
has(script,/GITHUB_REF[^\n]+refs\/heads\/main/,'production mutation must require main');
has(script,/PLATFORM_REGULATORY_REVIEWERS/,'live Worker reviewer allowlist must be authoritative');
has(script,/PROVISION_SINGLE_REGULATORY_REVIEWER/,'apply mode must require an exact confirmation token');
has(script,/PROVISION_CONFIRMATION\|\|'VALIDATE_ONLY'/,'default execution mode must be validate-only');
has(script,/eligible\.length===1/,'preflight must require exactly one eligible reviewer candidate');
has(script,/membership_count/,'reviewer candidate must be an existing member');
has(script,/activeEditorIds\.has\(id\)/,'active editors must be excluded from reviewer candidacy');
has(script,/principal\.role!=='reviewer'/,'incompatible existing principal roles must fail closed');
has(script,/INSERT INTO platform_regulatory_principals\(user_id,email,role,active,created_at\)[\s\S]*'reviewer'/,'fresh provisioning must create reviewer authority only');
has(script,/UPDATE platform_regulatory_principals SET email=\?,active=1 WHERE user_id=\? AND role='reviewer' AND active=0/,'reactivation must be restricted to inactive reviewers');
has(script,/mutation\.changes===1/,'apply mode must prove exactly one principal mutation');
has(script,/makerCheckerReady\(principals\)/,'apply mode must re-prove independent maker-checker readiness');
has(script,/No account creation, password reset, source approval, rule publication, or regulatory-content mutation was performed/,'operator output must state the bounded mutation scope');
lacks(script,/INSERT\s+INTO\s+users\b/i,'provisioning must never create users');
lacks(script,/UPDATE\s+users\s+SET\b/i,'provisioning must never modify user identities');
lacks(script,/DELETE\s+FROM\b/i,'provisioning must not delete production data');
lacks(script,/UPDATE\s+regulatory_sources\b/i,'provisioning must not approve regulatory sources');
lacks(script,/UPDATE\s+regulatory_rules\b/i,'provisioning must not publish regulatory rules');
lacks(script,/console\.log\([^\n]*(candidateId|candidateEmail)/,'provisioning must not emit reviewer identity values');

has(workflow,/^\s*workflow_dispatch:/m,'provisioning must be manually dispatched');
lacks(workflow,/^\s*push:/m,'provisioning must not run automatically on push');
has(workflow,/permissions:\s*\n\s*contents:\s*read/,'repository token must remain read-only');
has(workflow,/environment:\s*production/,'provisioning must run behind the production environment');
has(workflow,/github\.ref == 'refs\/heads\/main'/,'workflow job must be main-only');
has(workflow,/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,'checkout action must remain pinned');
has(workflow,/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/,'setup-node action must remain pinned');
has(workflow,/PROVISION_CONFIRMATION:\s*\$\{\{ inputs\.confirmation \}\}/,'workflow must pass the exact operator confirmation to the script');
has(workflow,/node tests\/regulatory-reviewer-provisioning-static\.mjs/,'workflow must run its safety regression before provisioning');
has(workflow,/node scripts\/provision-regulatory-reviewer\.mjs/,'workflow must run the governed provisioning script');
lacks(workflow,/reviewer[_-]?email/i,'workflow must not accept an arbitrary reviewer email input');
lacks(workflow,/secrets\.[A-Z0-9_]*(EMAIL|PASSWORD)/,'workflow must not require reviewer credentials');

console.log('Regulatory reviewer provisioning static governance: PASS');
