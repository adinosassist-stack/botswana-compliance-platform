import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration25=fs.readFileSync('db/migrations/025_v78_automatic_rereview_management.sql','utf8');
const migration32=fs.readFileSync('db/migrations/032_v82_workspace_version_numeric_contract.sql','utf8');
const schema=fs.readFileSync('db/schema.sql','utf8');
const api=fs.readFileSync('scripts/api-integration-test.mjs','utf8');
const security=fs.readFileSync('scripts/security-test.mjs','utf8');
let checks=0;
const ok=(condition,message)=>{assert.ok(condition,message);checks++;console.log('PASS',message)};

ok(/tenant_id UUID NOT NULL/.test(migration25),'rereview migration uses UUID tenant lineage');
ok(/reviewer_user_id UUID/.test(migration25),'rereview migration uses UUID reviewer lineage');
ok(!/REFERENCES management_review_decisions\(/.test(migration25),'rereview migration does not reference an absent Node/Postgres decision table');
ok(/FOREIGN KEY\(tenant_id\) REFERENCES tenants\(id\)/.test(migration25),'rereview tenant foreign key remains enforced');
ok(/FOREIGN KEY\(reviewer_user_id\) REFERENCES users\(id\)/.test(migration25),'rereview reviewer foreign key remains enforced');

ok(/app_state\([^;]*version integer not null default 1\)/i.test(schema),'fresh Postgres schema exposes numeric workspace version as integer');
ok(/tenant_id UUID NOT NULL/.test(schema)&&/reviewer_user_id UUID/.test(schema),'fresh schema matches rereview UUID lineage');
ok(!/REFERENCES management_review_decisions\(/.test(schema),'fresh schema does not contain invalid decision-table foreign keys');

ok(/data_type='bigint'/.test(migration32),'upgrade migration targets legacy bigint workspace versions only');
ok(/version > 2147483647 OR version < 1/.test(migration32),'workspace-version migration refuses unsafe legacy values');
ok(/ALTER TABLE app_state ALTER COLUMN version TYPE integer USING version::integer/.test(migration32),'workspace-version migration performs explicit safe integer conversion');

ok(/reg\.status!==202/.test(api),'integration lifecycle expects hardened asynchronous registration contract');
ok(/registration must not create an authenticated session/.test(api),'integration lifecycle rejects registration-created sessions');
ok(/\/api\/auth\/login/.test(api),'integration lifecycle explicitly signs in after registration');
ok(/Number\.isInteger\(gd\.version\)/.test(api)&&/Number\.isInteger\(pd\.version\)/.test(api),'integration test enforces numeric workspace version API contract');
ok(/afterLogout\.status!==401/.test(api),'integration lifecycle proves logout revokes the session');

ok(/app_state numeric integer version contract/.test(security),'security regression gate requires the numeric integer workspace-version contract');
ok(/app_state\.version must not be bigint/.test(security)&&!security.includes("'version bigint'"),'security regression gate explicitly rejects the stale bigint workspace-version contract');

console.log(`V82 Node/Postgres lineage hardening: ${checks}/${checks} PASS`);
