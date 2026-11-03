import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const fixture=readFileSync(new URL("./fixtures/owner-bank-d1-disposable-staging.sql",import.meta.url),"utf8");
test("disposable D1 fixture rejects both replay variants under SQLite",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(fixture);
  const rows=db.prepare("SELECT bank_transaction_id,tenant_id,invoice_id FROM owner_bank_receipt_allocation").all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].bank_transaction_id,"staging-bank-1");
  assert.equal(rows[0].tenant_id,"staging-tenant-a");
  assert.equal(rows[0].invoice_id,"staging-invoice-1");
 }finally{db.close();}
});
