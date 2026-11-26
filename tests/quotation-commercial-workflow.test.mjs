import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {handleQuotationCommercialRequest} from '../cloudflare/src/quotation-commercial-workflow.js';
import {quotationCustomSample} from '../public/js/quotation-customizable-page-model.mjs';
const actor={tenant_id:'a',user_id:'owner',role:'owner',csrf_token:'synthetic-csrf-token'};
const bank={bankName:'FNB',accountHolder:'Synthetic Company',accountNumber:'00123456789',branch:'Riverwalk',branchCode:'123',paymentReference:'Quote number'};
const draft=()=>{const d=quotationCustomSample();Object.assign(d,{quoteNumber:'DRAFT',customerName:'Synthetic customer',customerPhone:'+267 71234567'});d.copy.bankAccount=bank.accountNumber;d.copy.bankAccountHolder=bank.accountHolder;return d};
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('test')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'commercial-test'}}));
 const db=await mf.getD1Database('DB');
 await db.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY); INSERT INTO tenants VALUES('a'),('b'); CREATE TABLE finance_customers(id TEXT,tenant_id TEXT,status TEXT,name TEXT); INSERT INTO finance_customers VALUES('ca','a','active','Synthetic customer'),('cb','b','active','Foreign'); CREATE TABLE finance_invoices(id TEXT PRIMARY KEY,tenant_id TEXT,customer_id TEXT,invoice_number TEXT,issued_on TEXT,due_on TEXT,description TEXT,total_minor INTEGER,currency TEXT,status TEXT,created_by_user_id TEXT,UNIQUE(tenant_id,invoice_number));");
 for(const sql of splitSqliteMigrationStatements(await readFile('docs/sql/quotation-commercial-workflow-CANDIDATE.sql','utf8')))await db.prepare(sql).run();
 const env={DB:db,QUOTATION_COMMERCIAL_ENABLED:'true'};
 async function call(path,method='GET',body,auth=actor,headers={}){
 const req=new Request('https://thebedesk.test/api/quotation/'+path,{method,headers:{origin:'https://thebedesk.test','content-type':'application/json','x-csrf-token':auth?.csrf_token||'',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const res=await handleQuotationCommercialRequest({request:req,env,auth});return {status:res.status,data:await res.json()};
 }
 return {db,mf,env,call};
}
test('bank defaults persist across sessions, preserve leading zeros, reject stale edits and foreign roles',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('banking','PUT',{revision:0,banking:bank})).status,200);
 assert.equal((await f.call('banking','GET',undefined,{...actor,user_id:'new-session'})).data.banking.accountNumber,'00123456789');
 assert.equal((await f.call('banking','GET',undefined,{...actor,tenant_id:'b'})).data.banking,null);
 assert.equal((await f.call('banking','PUT',{revision:0,banking:bank})).status,409);
 assert.equal((await f.call('banking','PUT',{revision:1,banking:bank},{...actor,role:'manager'})).status,403);
 assert.equal((await f.call('banking','PUT',{revision:1,banking:{...bank,tenantId:'b'}})).status,400);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM quotation_commercial_audit').first()).n,1);
 }finally{await f.mf.dispose()}
});
test('save reload, atomic numbering, immutable snapshots, replay and tenant denial',async()=>{
 const f=await fixture();try{
 const saved=await f.call('documents/q1','PUT',{revision:0,document:draft()});assert.equal(saved.status,200);
 const loaded=await f.call('documents/q1');assert.equal(loaded.data.document.customerName,'Synthetic customer');
 assert.equal((await f.call('documents/q1','GET',undefined,{...actor,tenant_id:'b'})).status,404);
 const issued=await Promise.all([f.call('documents/q1/issue','POST',{revision:1}),f.call('documents/q1/issue','POST',{revision:1})]);
 assert.ok(issued.every(x=>x.status===200));assert.equal(issued[0].data.number,issued[1].data.number);
 assert.equal((await f.db.prepare('SELECT value FROM quotation_commercial_sequences').first()).value,1);
 assert.equal((await f.call('documents/q1','PUT',{revision:2,document:draft()})).status,409);
 const snap=(await f.call('documents/q1')).data.document.copy.bankAccount;
 await f.call('banking','PUT',{revision:0,banking:{...bank,accountNumber:'999999'}});
 assert.equal((await f.call('documents/q1')).data.document.copy.bankAccount,snap);
 await assert.rejects(f.db.prepare("UPDATE quotation_commercial_documents SET total_minor=1 WHERE tenant_id='a'").run(),/immutable/);
 }finally{await f.mf.dispose()}
});
test('quote conversion is idempotent and invoice issuance writes canonical Finance once without allocations',async()=>{
 const f=await fixture();try{
 await f.call('documents/q1','PUT',{revision:0,document:draft()});await f.call('documents/q1/issue','POST',{revision:1});
 assert.equal((await f.call('documents/q1/convert','POST',{customerId:'cb',dueOn:'2026-12-30'})).status,404);
 const results=await Promise.all([f.call('documents/q1/convert','POST',{customerId:'ca',dueOn:'2026-12-30'}),f.call('documents/q1/convert','POST',{customerId:'ca',dueOn:'2026-12-30'})]);
 assert.ok(results.every(x=>x.status===200));assert.equal(results[0].data.id,results[1].data.id);
 const id=results[0].data.id;
 const issued=await Promise.all([f.call('documents/'+id+'/issue','POST',{revision:1}),f.call('documents/'+id+'/issue','POST',{revision:1})]);
 assert.ok(issued.every(x=>x.status===200));
 assert.equal((await f.db.prepare('SELECT count(*) n FROM finance_invoices').first()).n,1);
 assert.equal((await f.db.prepare('SELECT total_minor FROM finance_invoices').first()).total_minor,1400000);
 }finally{await f.mf.dispose()}
});
test('flags, identity, origin, CSRF and invalid financial data fail closed',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('banking','GET',undefined,null)).status,401);
 assert.equal((await f.call('banking','PUT',{revision:0,banking:bank},actor,{origin:'https://evil.test'})).status,403);
 assert.equal((await f.call('banking','PUT',{revision:0,banking:bank},actor,{'x-csrf-token':'wrong'})).status,403);
 f.env.QUOTATION_COMMERCIAL_ENABLED='false';assert.equal((await f.call('banking')).status,404);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM quotation_commercial_audit').first()).n,0);
 }finally{await f.mf.dispose()}
});

test('concurrent banking edits have one winner and one audit event per revision',async()=>{
 const f=await fixture();try{
 const result=await Promise.all([f.call('banking','PUT',{revision:0,banking:bank}),f.call('banking','PUT',{revision:0,banking:{...bank,branch:'Another branch'}})]);
 assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM quotation_commercial_audit').first()).n,1);
 }finally{await f.mf.dispose()}
});
test('invoice transaction rollback leaves the document, sequence and audit unchanged',async()=>{
 const f=await fixture();try{
 await f.call('documents/q1','PUT',{revision:0,document:draft()});await f.call('documents/q1/issue','POST',{revision:1});
 const converted=await f.call('documents/q1/convert','POST',{customerId:'ca',dueOn:'2026-12-30'});
 await f.db.prepare("CREATE TRIGGER reject_test_invoice BEFORE INSERT ON finance_invoices BEGIN SELECT RAISE(ABORT,'test_outage'); END").run();
 const result=await f.call('documents/'+converted.data.id+'/issue','POST',{revision:1});assert.equal(result.status,503);
 assert.equal((await f.call('documents/'+converted.data.id)).data.status,'draft');
 assert.equal(await f.db.prepare("SELECT value FROM quotation_commercial_sequences WHERE kind='invoice'").first(),null);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM finance_invoices').first()).n,0);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM quotation_commercial_audit').first()).n,3);
 await f.db.prepare('DROP TRIGGER reject_test_invoice').run();
 assert.equal((await f.call('documents/'+converted.data.id+'/issue','POST',{revision:1})).data.number,'INV-000001');
 }finally{await f.mf.dispose()}
});
test('invalid totals, schedules, forged payment data and oversized bodies never write',async()=>{
 const f=await fixture();try{
 for(const changed of [{discount:'99999999.00'},{issueDate:'2026-02-30'},{items:[{description:'Bad',quantity:'1',unitPrice:'-1'}]}]){
 assert.equal((await f.call('documents/invalid','PUT',{revision:0,document:{...draft(),...changed}})).status,400);
 }
 assert.equal((await f.call('documents/invalid','PUT',{revision:0,document:draft(),schedule:{settledAllocations:[{amountMinor:1000}]}})).status,400);
 assert.equal((await f.call('documents/invalid','PUT',{revision:0,document:draft(),schedule:{depositDueMinor:1400001}})).status,400);
 assert.equal((await f.call('documents/invalid','PUT',{revision:0,document:{...draft(),termsText:'x'.repeat(40000)}})).status,413);
 assert.equal((await f.db.prepare('SELECT count(*) n FROM quotation_commercial_documents').first()).n,0);
 }finally{await f.mf.dispose()}
});
test('PDF endpoint requires issued tenant-owned record and qualified private renderer output',async()=>{
 const f=await fixture();try{
 await f.call('documents/q1','PUT',{revision:0,document:draft()});
 assert.equal((await f.call('documents/q1/pdf')).status,409);
 await f.call('documents/q1/issue','POST',{revision:1});
 assert.equal((await f.call('documents/q1/pdf')).status,503);
 let calls=0;f.env.QUOTATION_PDF_RENDERER={fetch:async()=>{calls++;return new Response('not a pdf',{headers:{'content-type':'application/pdf','x-quotation-page-count':'2'}})}};
 assert.equal((await f.call('documents/q1/pdf','GET',undefined,{...actor,tenant_id:'b'})).status,404);assert.equal(calls,0);
 assert.equal((await f.call('documents/q1/pdf')).status,503);assert.equal(calls,1);
 }finally{await f.mf.dispose()}
});
