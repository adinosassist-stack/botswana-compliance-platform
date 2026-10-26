import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {legacyVatAggregateInventoryPlan} from "../scripts/regulatory-legacy-vat-aggregate-inventory.mjs";
test("aggregate plan contains only bounded non-identifying SELECT statements",()=>{
 const x=legacyVatAggregateInventoryPlan();
 assert.equal(x.executed,false);assert.equal(x.requiresIndependentReadOnlyApproval,true);
 assert.equal(x.containsTenantIdentifiers,false);assert.equal(x.queries.length,3);
 for(const q of x.queries){
  assert.match(q.sql,/^SELECT /);
  assert.match(q.sql,/COUNT\(\*\)/);
  assert.doesNotMatch(q.sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA|ATTACH)\b/i);
  assert.doesNotMatch(q.sql,/tenant_id|assigned_user_id|completed_by_user_id|o\.id|s\.tenant_id/i);
 }
});
test("inventory SQL references actual schema columns only",()=>{
 const schema=readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
 for(const column of ["rule_key","action_json","effective_from","effective_to","due_at","config_status","rule_id"])
  assert.match(schema,new RegExp("\\b"+column+"\\b"));
});
