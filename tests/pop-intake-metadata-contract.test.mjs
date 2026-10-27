import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync('cloudflare/migrations/070_payment_pop_documents.sql','utf8');
test('POP records are private metadata and never settle an order',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS payment_pop_documents/);
 assert.match(migration,/source IN \('web','whatsapp_manual'\)/);
 assert.match(migration,/scan_status IN \('pending','clean','blocked','failed'\)/);
 assert.match(migration,/FOREIGN KEY\(tenant_id\) REFERENCES tenants/);
 assert.match(migration,/FOREIGN KEY\(payment_order_id\) REFERENCES payment_orders/);
 assert.doesNotMatch(migration,/UPDATE\s+(?:payment_orders|subscriptions)|INSERT\s+INTO\s+(?:payment_fulfillments|subscriptions)/i);
});
