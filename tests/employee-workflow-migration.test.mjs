import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../db/migrations/20261021_employee_ai_workflows.sql", import.meta.url), "utf8");

test("migration defines tenant-owner-workflow composite key", () => {
  assert.match(sql, /primary key\s*\(tenant_id, owner_id, workflow_id\)/i);
  assert.match(sql, /tenant_id text not null/i);
  assert.match(sql, /owner_id text not null/i);
});

test("migration limits workflow JSON payload size", () => {
  assert.match(sql, /octet_length\(definition::text\) <= 16384/i);
  assert.match(sql, /jsonb_typeof\(definition\) = 'object'/i);
});

test("migration is schema-only without scheduled or irreversible actions", () => {
  assert.doesNotMatch(sql, /\b(create trigger|create function|delete from|drop table|truncate|update\s+employee_ai_workflows)\b/i);
});
