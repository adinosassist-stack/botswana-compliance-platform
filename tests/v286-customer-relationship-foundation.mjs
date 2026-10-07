import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {normalizeCustomerContact,__customerRelationshipsTest} from "../cloudflare/src/customer-relationships.js";

for(const path of [
  "cloudflare/src/customer-relationships.js",
  "cloudflare/src/finance-receivables.js"
])execFileSync(process.execPath,["--check",path],{stdio:"pipe"});

assert.deepEqual(normalizeCustomerContact("whatsapp","74123456"),{channel:"whatsapp",value:"+26774123456"});
assert.deepEqual(normalizeCustomerContact("whatsapp","+267 74 123 456"),{channel:"whatsapp",value:"+26774123456"});
assert.equal(normalizeCustomerContact("whatsapp","123").error,"invalid_customer_whatsapp");
assert.deepEqual(normalizeCustomerContact("email"," OWNER@Example.COM "),{channel:"email",value:"owner@example.com"});
assert.equal(normalizeCustomerContact("email","bad-address").error,"invalid_customer_email");
assert.equal(normalizeCustomerContact("sms","74123456").error,"invalid_customer_contact_channel");

assert.deepEqual(__customerRelationshipsTest.customerContactsPath("/api/finance/customers/c-1/contacts"),{customerId:"c-1"});
assert.deepEqual(__customerRelationshipsTest.customerFollowupsPath("/api/finance/customers/c-1/followups"),{customerId:"c-1"});
assert.deepEqual(__customerRelationshipsTest.followupActionPath("/api/finance/customer-followups/f-1/approve"),{followupId:"f-1",action:"approve"});
assert.deepEqual(__customerRelationshipsTest.followupActionPath("/api/finance/customer-followups/f-1/cancel"),{followupId:"f-1",action:"cancel"});
assert.equal(__customerRelationshipsTest.maskContact("whatsapp","+26774123456"),"***3456");
assert.equal(__customerRelationshipsTest.maskContact("email","owner@example.com"),"o***@example.com");
assert.ok(__customerRelationshipsTest.CONSENT_STATUSES.has("opted_in"));
assert.ok(__customerRelationshipsTest.FOLLOWUP_STATUSES.has("approved"));
assert.ok(!__customerRelationshipsTest.FOLLOWUP_STATUSES.has("dispatched_without_approval"));

const migration=fs.readFileSync("cloudflare/migrations/067_v286_customer_relationships.sql","utf8");
assert.match(migration,/CREATE TABLE IF NOT EXISTS customer_contacts/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS customer_followups/);
assert.match(migration,/consent_status IN \('unknown','opted_in','opted_out'\)/);
assert.match(migration,/customer_followups_scope_guard/);
assert.match(migration,/customer_followups_immutable_payload_guard/);
assert.match(migration,/FOREIGN KEY\(tenant_id\) REFERENCES tenants\(id\) ON DELETE CASCADE/);

const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
db.exec(`
  CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE finance_customers(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );
  CREATE TABLE finance_invoices(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES finance_customers(id) ON DELETE CASCADE
  );
`);
db.exec(migration);

db.prepare("INSERT INTO tenants(id) VALUES(?)").run("t1");
db.prepare("INSERT INTO tenants(id) VALUES(?)").run("t2");
db.prepare("INSERT INTO users(id) VALUES(?)").run("u1");
db.prepare("INSERT INTO finance_customers(id,tenant_id,status) VALUES(?,?,?)").run("c1","t1","active");
db.prepare("INSERT INTO finance_customers(id,tenant_id,status) VALUES(?,?,?)").run("c2","t2","active");
db.prepare("INSERT INTO finance_invoices(id,tenant_id,customer_id,status) VALUES(?,?,?,?)").run("i1","t1","c1","issued");
db.prepare("INSERT INTO finance_invoices(id,tenant_id,customer_id,status) VALUES(?,?,?,?)").run("i2","t2","c2","issued");

db.prepare(`INSERT INTO customer_contacts(
  id,tenant_id,customer_id,channel,contact_value,contact_hash,consent_status,consent_source,consent_recorded_at,created_by_user_id
) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run("cc1","t1","c1","whatsapp","+26774123456","h1","opted_in","customer_request","u1");

assert.throws(
  ()=>db.prepare(`INSERT INTO customer_contacts(
    id,tenant_id,customer_id,channel,contact_value,contact_hash,consent_status
  ) VALUES(?,?,?,?,?,?,?)`).run("cc-cross","t2","c1","email","person@example.com","h2","unknown"),
  /customer_contact_scope_invalid/
);

db.prepare(`INSERT INTO customer_followups(
  id,tenant_id,customer_id,contact_id,invoice_id,purpose,message_body,message_hash,idempotency_key,prepared_by,requested_by_user_id
) VALUES(?,?,?,?,?,?,?,?,?,'human',?)`).run("f1","t1","c1","cc1","i1","receivable","Please review invoice i1.","m1","idem-0001","u1");

assert.throws(
  ()=>db.prepare(`INSERT INTO customer_followups(
    id,tenant_id,customer_id,contact_id,invoice_id,purpose,message_body,message_hash,idempotency_key,prepared_by
  ) VALUES(?,?,?,?,?,?,?,?,?,'human')`).run("f-cross","t1","c1","cc1","i2","receivable","Wrong invoice.","m2","idem-0002"),
  /customer_followup_invoice_scope_invalid/
);

assert.throws(
  ()=>db.prepare("UPDATE customer_followups SET message_body='changed' WHERE id='f1'").run(),
  /customer_followup_payload_immutable/
);
const followup=db.prepare("SELECT tenant_id,customer_id,contact_id,invoice_id,status,message_body FROM customer_followups WHERE id='f1'").get();
assert.deepEqual(followup,{tenant_id:"t1",customer_id:"c1",contact_id:"cc1",invoice_id:"i1",status:"draft",message_body:"Please review invoice i1."});
db.close();

const relationships=fs.readFileSync("cloudflare/src/customer-relationships.js","utf8");
assert.match(relationships,/customer_contact_consent_required/);
assert.match(relationships,/explicit_customer_followup_confirmation_required/);
assert.match(relationships,/customer_dispatch_not_enabled/);
assert.match(relationships,/owner_required/);
assert.doesNotMatch(relationships,/notification_outbox/);
assert.doesNotMatch(relationships,/\bfetch\s*\(/);

const receivables=fs.readFileSync("cloudflare/src/finance-receivables.js","utf8");
assert.match(receivables,/handleCustomerRelationshipRequest/);
assert.match(receivables,/customer-relationships\.js/);

console.log("v286 customer relationship foundation: runtime scope + consent + approval + no-dispatch boundary PASS");
