import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const proposal=fs.readFileSync("db/drafts/workspace-agent-postgres-schema-review.sql","utf8");
const nodeSchema=fs.readFileSync("db/schema.sql","utf8");
const nodeAgent=fs.readFileSync("server/workspace-agent-node-private.js","utf8");
const worker=fs.readFileSync("cloudflare/src/workspace-agent-tasks-api.js","utf8");
const originalD1=fs.readFileSync("cloudflare/migrations/066_v285_agent_responsibilities.sql","utf8");
const migrationScript=fs.readFileSync("scripts/workspace-agent-offline-staging-qualification.mjs","utf8");

test("PostgreSQL staging proposal is only a draft: no automatic execution, migration or deploy",()=>{
 assert.match(proposal,/REVIEW ONLY/);
 assert.match(proposal,/NOT A MIGRATION/);
 assert.doesNotMatch(proposal,/\b(?:GRANT|REVOKE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:TABLE\s+|FROM\s+|INTO\s+|ON\s+)?(?:agent_responsibilities|public\.agent_responsibilities)\b/i);
 assert.doesNotMatch(proposal,/\b(?:DO\s+\$\$|CREATE\s+(?:TRIGGER|FUNCTION|EXTENSION)|ALTER\s+TABLE|COPY\s+|CREATE\s+ROLE|CREATE\s+USER)\b/i);
 assert.ok(!nodeSchema.includes("workspace-agent-postgres-schema-review.sql"));
 assert.ok(!nodeAgent.includes("db/drafts/workspace-agent-postgres-schema-review.sql"));
 assert.ok(!migrationScript.includes("workspace-agent-postgres-schema-review.sql"));
});
test("Node tenant and user UUIDs are preserved, never replaced by D1 text identity",()=>{
 assert.match(nodeSchema,/create table if not exists tenants\(id uuid primary key/i);
 assert.match(nodeSchema,/create table if not exists users\(id uuid primary key/i);
 assert.match(proposal,/\btenant_id UUID NOT NULL REFERENCES tenants\(id\)/);
 assert.match(proposal,/\bowner_user_id UUID NOT NULL REFERENCES users\(id\)/);
 assert.match(proposal,/\bcreated_by_user_id UUID NOT NULL REFERENCES users\(id\)/);
 assert.match(proposal,/\bactivated_by_user_id UUID REFERENCES users\(id\)/);
 assert.match(proposal,/\bid TEXT PRIMARY KEY/);
 assert.match(originalD1,/tenant_id TEXT NOT NULL/);
});
test("read-only task query requires all indexed columns and compatible types",()=>{
 assert.match(nodeAgent,/SELECT id, objective, workspace FROM agent_responsibilities/);
 assert.match(nodeAgent,/WHERE tenant_id=\$1 AND workspace=\$2 AND status='active'/);
 assert.match(nodeAgent,/ORDER BY updated_at DESC LIMIT 24/);
 assert.match(proposal,/\bobjective TEXT NOT NULL/);
 assert.match(proposal,/\bworkspace TEXT NOT NULL/);
 assert.match(proposal,/\bstatus TEXT NOT NULL DEFAULT 'draft'/);
 assert.match(proposal,/\bupdated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
 assert.match(proposal,/CREATE INDEX idx_agent_responsibilities_scope\s+ON agent_responsibilities \(tenant_id, workspace, status, updated_at DESC\)/);
 assert.match(worker,/SELECT id,objective,workspace FROM agent_responsibilities/);
});
test("draft does not grant autonomous execution or weaken tenant-scoped constraints",()=>{
 assert.match(proposal,/autonomy_ceiling INTEGER NOT NULL DEFAULT 1 CHECK \(autonomy_ceiling BETWEEN 0 AND 2\)/);
 assert.match(proposal,/\bowner_user_id UUID NOT NULL REFERENCES users\(id\) ON DELETE RESTRICT/);
 assert.match(proposal,/\bactivated_by_user_id UUID REFERENCES users\(id\) ON DELETE RESTRICT/);
 assert.match(proposal,/CONSTRAINT agent_responsibility_activation_valid CHECK/);
 assert.match(proposal,/status <> 'active' OR \(activated_by_user_id IS NOT NULL AND activated_at IS NOT NULL\)/);
 assert.match(proposal,/jsonb_typeof\(tool_scope_json\) = 'array'/);
 assert.match(proposal,/jsonb_typeof\(data_scope_json\) = 'array'/);
 assert.doesNotMatch(proposal,/\b(?:GRANT|REVOKE)\b\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)/i);
});
