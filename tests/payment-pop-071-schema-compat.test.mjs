import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration070=readFileSync('cloudflare/migrations/070_payment_pop_documents.sql','utf8');
const migration071=readFileSync('cloudflare/migrations/071_payment_pop_runtime_compat.sql','utf8');
const writer=readFileSync('cloudflare/src/payment-pop-metadata.js','utf8');
const reservations=readFileSync('cloudflare/src/payment-pop-upload-reservations.js','utf8');

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT); CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY)');
 db.exec(migration070);
 return db;
}
test('070 to 071 adds writer columns and durable reservation table, without payment settlement',()=>{
 const db=fixture();
 try{
  db.exec(migration071);
  const columns=new Set(db.prepare('PRAGMA table_info(payment_pop_documents)').all().map(x=>x.name));
  for(const column of ['content_sha256','object_etag'])assert.ok(columns.has(column),column);
  const ledger=new Set(db.prepare('PRAGMA table_info(payment_pop_upload_requests)').all().map(x=>x.name));
  for(const col of ['document_id','tenant_id','payment_order_id','key_hash','request_hash','bytes','state','created_at'])assert.ok(ledger.has(col),col);
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='payment_pop_upload_requests'").all().map(x=>x.name);
  assert.ok(indexes.includes('payment_pop_upload_requests_tenant_idx'));
  const tenant='11111111-1111-4111-8111-111111111111',order='22222222-2222-4222-8222-222222222222',doc='33333333-3333-4333-8333-333333333333';
  db.prepare('INSERT INTO tenants(id) VALUES(?)').run(tenant);
  db.prepare('INSERT INTO payment_orders(id,tenant_id) VALUES(?,?)').run(order,tenant);
  db.prepare('INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes) VALUES(?,?,?,?,?,?)').run(doc,tenant,order,'a'.repeat(64),'b'.repeat(64),9);
  assert.equal(db.prepare('SELECT state FROM payment_pop_upload_requests').get().state,'reserved');
  assert.throws(()=>db.prepare('INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes) VALUES(?,?,?,?,?,?)').run('44444444-4444-4444-8444-444444444444',tenant,order,'a'.repeat(64),'b'.repeat(64),9));
  assert.match(writer,/content_sha256,object_etag/);
  assert.match(reservations,/payment_pop_upload_requests/);
  assert.doesNotMatch(migration071,/\b(?:UPDATE|INSERT|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:subscriptions|payment_orders|payment_fulfillments)\b/i);
 }finally{db.close()}
});
test('071 fails closed without migration 070 prerequisite',()=>{
 const db=new DatabaseSync(':memory:');
 try{assert.throws(()=>db.exec(migration071),/no such table: payment_pop_documents/)}
 finally{db.close()}
});
