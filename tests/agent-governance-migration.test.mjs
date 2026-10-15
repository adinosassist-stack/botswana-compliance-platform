import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../db/migrations/20261016_agent_governance_integrity.sql", import.meta.url), "utf8");

test("approval nonce is unique per tenant", () => {
  assert.match(migration, /unique index if not exists agent_approvals_tenant_nonce_unique/i);
  assert.match(migration, /on agent_action_approvals\s*\(tenant_id,\s*nonce\)/i);
});

test("consumed approvals must be approved", () => {
  assert.match(migration, /consumed_at is null or status = 'approved'/i);
});

test("approval audit lookup has a partial index", () => {
  assert.match(migration, /on agent_action_audit\s*\(approval_id\)\s*where approval_id is not null/i);
});
