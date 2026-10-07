import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
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

console.log("v286 customer relationship foundation: consent + approval + no-dispatch boundary PASS");
