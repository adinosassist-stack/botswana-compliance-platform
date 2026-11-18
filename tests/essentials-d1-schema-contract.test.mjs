import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql",import.meta.url),"utf8");
test("draft schema is additive and never modifies issued finance tables",()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS essentials_invoice_drafts/);
 assert.doesNotMatch(sql,/ALTER TABLE\s+finance_invoices/i);
 assert.doesNotMatch(sql,/DROP TABLE/i);
 assert.match(sql,/UNIQUE\(tenant_id,idempotency_key\)/);
 assert.match(sql,/UNIQUE\(tenant_id,invoice_number\)/);
 assert.match(sql,/essentials_customer_tenant_mismatch/);
});
