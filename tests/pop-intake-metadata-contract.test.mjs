import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const proposal=fs.readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8');
test('POP records are private metadata and never settle an order',()=>{
 assert.match(proposal,/CREATE TABLE IF NOT EXISTS payment_pop_documents/);
 assert.match(proposal,/source IN \('web','whatsapp_manual'\)/);
 assert.match(proposal,/scan_status IN \('pending','clean','blocked','failed'\)/);
 assert.match(proposal,/FOREIGN KEY\(tenant_id\) REFERENCES tenants/);
 assert.match(proposal,/FOREIGN KEY\(payment_order_id\) REFERENCES payment_orders/);
 assert.doesNotMatch(proposal,/UPDATE\s+(?:payment_orders|subscriptions)|INSERT\s+INTO\s+(?:payment_fulfillments|subscriptions)/i);
});
