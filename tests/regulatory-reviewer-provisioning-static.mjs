import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const script=fs.readFileSync('scripts/provision-regulatory-reviewer.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/regulatory-reviewer-provision.yml','utf8');

function has(source,pattern,message){assert.match(source,pattern,message)}
function lacks(source,pattern,message){assert.doesNotMatch(source,pattern,message)}

has(script,/GITHUB_ACTIONS[^\n]+true/,'provisioning must refuse execution outside GitHub Actions');
has(script,/eventName==='workflow_dispatch'\|\|eventName==='push'/,'production mutation must be limited to workflow dispatch or the governed one-shot push trigger');
has(script,/GITHUB_REF[^\n]+refs\/heads\/main/,'production mutation must require main');
has(script,/PLATFORM_REGULATORY_REVIEWERS/,'live Worker reviewer allowlist must be authoritative');
has(script,/PROVISION_SINGLE_REGULATORY_REVIEWER/,'apply mode must require an exact confirmation token');
has(script,/PROVISION_CONFIRMATION\|\|'VALIDATE_ONLY'/,'default execution mode must be validate-only');
has(script,/PUSH_TRIGGER_PATH='operations\/regulatory-reviewer-provision-trigger\.json'/,'one-shot push authority must be bound to the exact trigger file');
has(script,/validatePushTrigger\(\)/,'push mutation path must revalidate the trigger inside the provisioning script');
has(script,/trigger\?\.schema===1/,'push trigger schema must be checked');
has(script,/trigger\?\.requested===true/,'push trigger must be explicitly requested');
has(script,/trigger\?\.apply===true/,'push trigger must explicitly authorize apply mode');
has(script,/eligible\.length===1/,'preflight must require exactly one eligible reviewer candidate');
has(script,/membership_count/,'reviewer candidate must be an existing member');
has(script,/activeEditorIds\.has\(id\)/,'active editors must be excluded from reviewer candidacy');
has(script,/principal\.role!=='reviewer'/,'incompatible existing principal roles must fail closed');
has(script,/INSERT INTO platform_regulatory_principals\(user_id,email,role,active,provisioned_at\)[\s\S]*'reviewer'/,'fresh provisioning must use the production schema and create reviewer authority only');
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

has(workflow,/^\s*workflow_dispatch:/m,'manual validation/apply dispatch must remain available');
has(workflow,/^\s*push:\s*\n\s*branches:\s*\[main\][\s\S]*operations\/regulatory-reviewer-provision-trigger\.json/m,'one-shot push trigger must be main-only and path scoped');
has(workflow,/github\.event_name == 'push'[\s\S]*\[provision-regulatory-reviewer\]/,'one-shot push execution must require the explicit merge-message marker');
has(workflow,/operations\/regulatory-reviewer-provision-trigger\.json/,'workflow must validate the exact trigger artifact');
has(workflow,/data\.get\('schema'\) == 1/,'workflow must validate trigger schema');
has(workflow,/data\.get\('requested'\) is True/,'workflow must require explicit provisioning request');
has(workflow,/data\.get\('apply'\) is True/,'workflow must require explicit apply authority');
has(workflow,/PROVISION_CONFIRMATION=PROVISION_SINGLE_REGULATORY_REVIEWER/,'governed push trigger must elevate only to the exact apply confirmation');
has(workflow,/permissions:\s*\n\s*contents:\s*read/,'repository token must remain read-only');
has(workflow,/environment:\s*production/,'provisioning must run behind the production environment');
has(workflow,/github\.ref == 'refs\/heads\/main'/,'workflow job must be main-only');
has(workflow,/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/,'checkout action must remain pinned');
has(workflow,/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/,'setup-node action must remain pinned');
has(workflow,/node tests\/regulatory-reviewer-provisioning-static\.mjs/,'workflow must run its safety regression before provisioning');
has(workflow,/node scripts\/provision-regulatory-reviewer\.mjs/,'workflow must run the governed provisioning script');
lacks(workflow,/reviewer[_-]?email/i,'workflow must not accept an arbitrary reviewer email input');
lacks(workflow,/secrets\.[A-Z0-9_]*(EMAIL|PASSWORD)/,'workflow must not require reviewer credentials');

// Execute the actual provisioning statement against the authoritative schema.
const migration=fs.readFileSync('cloudflare/migrations/005_v57_regulatory_governance.sql','utf8');
const principalSchema=migration.match(/CREATE TABLE IF NOT EXISTS platform_regulatory_principals\([\s\S]*?;/)?.[0];
assert.ok(principalSchema,'authoritative principal schema must exist');
const insertSql=script.match(/d1\(`(INSERT INTO platform_regulatory_principals[^`]+)`/)?.[1];
assert.ok(insertSql,'actual reviewer INSERT must be exercised');
const db=new DatabaseSync(':memory:');
try{
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL); CREATE TABLE memberships(user_id TEXT NOT NULL);');
  db.exec(principalSchema);
  db.prepare('INSERT INTO users(id,email) VALUES (?,?)').run('reviewer','reviewer@example.test');
  db.prepare('INSERT INTO memberships(user_id) VALUES (?)').run('reviewer');
  const timestamp='2026-10-17T10:00:00.000Z';
  const insert=db.prepare(insertSql);
  assert.equal(insert.run(timestamp,'reviewer','reviewer@example.test').changes,1,'existing member must provision exactly once');
  const principal=db.prepare('SELECT role,active,provisioned_at FROM platform_regulatory_principals WHERE user_id=?').get('reviewer');
  assert.equal(principal.role,'reviewer');
  assert.equal(principal.active,1);
  assert.equal(principal.provisioned_at,timestamp,'provisioning must use the real timestamp column');
  assert.equal(insert.run(timestamp,'reviewer','reviewer@example.test').changes,0,'replay must not create another principal');
  db.prepare('INSERT INTO users(id,email) VALUES (?,?)').run('nonmember','nonmember@example.test');
  assert.equal(insert.run(timestamp,'nonmember','nonmember@example.test').changes,0,'nonmembers must remain ineligible');
}finally{db.close();}

console.log('Regulatory reviewer provisioning static governance and schema execution: PASS');

