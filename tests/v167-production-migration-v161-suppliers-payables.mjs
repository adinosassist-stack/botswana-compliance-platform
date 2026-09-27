import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/migrate-production-v161-suppliers-payables.yml','utf8');
const runner=fs.readFileSync('scripts/migrate-production-v161-suppliers-payables.mjs','utf8');
const migration=fs.readFileSync('cloudflare/migrations/058_v161_finance_suppliers_payables.sql','utf8');

assert.match(workflow,/\[migrate-058\]/);
assert.match(workflow,/group: thebe-desk-production/);
assert.match(workflow,/statuses: write/);
assert.match(workflow,/Publish observable production migration status/);
assert.equal(workflow.includes("thebe/production-d1-058"),true);
assert.equal(workflow.includes("if: always()"),true);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);
assert.match(workflow,/refusing stale migration target=/);
assert.match(workflow,/wrangler@4\.135\.0/);
assert.match(workflow,/currently deployed production remains healthy/);
assert.match(workflow,/057_v157_business_memory_money_intelligence\.sql/);
assert.match(workflow,/058_v161_finance_suppliers_payables\.sql/);
assert.doesNotMatch(workflow,/latestSchemaDelta!=='058_v161_finance_suppliers_payables\.sql'/);

assert.match(runner,/blob:'3aa835dc81d52ac0066313e866162186c9876421'/);
assert.match(runner,/verifyPrerequisites/);
assert.match(runner,/business_memory_items/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);
assert.match(runner,/finance_supplier_name_alias_collision_guard/);
assert.match(runner,/finance_payable_allocations_apply_guard/);
assert.match(runner,/finance_payable_allocations_immutable_update/);
assert.match(runner,/finance_payable_allocations_immutable_delete/);
assert.match(runner,/finance_payable_overallocation/);
assert.match(runner,/finance_transaction_overallocation/);
assert.match(runner,/--remote/);
assert.match(runner,/--yes/);

for(const name of [
  'finance_suppliers',
  'finance_supplier_aliases',
  'finance_payables',
  'finance_payable_allocations'
])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
assert.match(migration,/This migration grants no payment, approval, journal, procurement or other execution authority/);
assert.match(migration,/SELECT \(CASE WHEN EXISTS\(/,'D1 trigger guards must use the parenthesized CASE workaround accepted by the remote D1 trigger parser');
assert.equal(migration.includes("THEN RAISE(ABORT,'finance_supplier_name_alias_collision') END);"),true);
assert.equal(migration.includes("THEN RAISE(ABORT,'finance_payable_overallocation') END);"),true);
assert.doesNotMatch(migration,/SELECT RAISE\(ABORT,'finance_supplier_name_alias_collision'\)\n  WHERE EXISTS\(/);

console.log('v167 guarded production migration 058 checks passed');
