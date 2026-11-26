/** Source-only commercial workflow. Default OFF until schema/activation approval.
 * Auth is supplied only by the worker's verified, active-membership session resolver.
 * No payment proof, bank credentials, ledger allocation or entitlement mutation.
 */
import {validateQuotationCustomPage} from '../../public/js/quotation-customizable-page-model.mjs';
import {previewInvoicePayments} from '../../server/essentials-payment-schedule.mjs';
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,90}$/.test(x);
const dateOK=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
function exact(body,keys){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw error('invalid_fields')}
function revision(v){if(!Number.isSafeInteger(v)||v<0||v>=2147483647)throw error('invalid_revision');return v}
export function validateCompanyBanking(b){
 const fields=['bankName','accountHolder','accountNumber','branch','branchCode','paymentReference'];exact(b,fields);
 const out={};for(const k of fields){const v=b[k]??'';if(typeof v!=='string'||v.length>120||/[\u0000-\u001f\u007f]/.test(v))throw error('invalid_banking');out[k]=v.trim()}
 if(!out.bankName||!out.accountHolder||!out.branch||!/^\d{1,34}$/.test(out.accountNumber)||!/^\d{0,12}$/.test(out.branchCode))throw error('invalid_banking');
 return out;
}
async function bodyJSON(req){
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')throw error('json_required',415);
 const reader=req.body?.getReader();if(!reader)throw error('body_required');const chunks=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>32768)throw error('body_too_large',413);chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(n);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw error('invalid_json')}
}
function receipt(row){
 return {ok:true,id:row.id,kind:row.kind,status:row.status,revision:row.revision,number:row.number,
 document:JSON.parse(row.document_json),schedule:JSON.parse(row.schedule_json),customerId:row.finance_customer_id,dueOn:row.due_on,
 totalMinor:row.total_minor,financeInvoiceId:row.kind==='invoice'&&row.status==='issued'?row.finance_invoice_id:null};
}
const read=(db,tenant,id)=>db.prepare('SELECT * FROM quotation_commercial_documents WHERE tenant_id=? AND id=?').bind(tenant,id).first();
export async function handleQuotationCommercialRequest({request,env,auth}={}){
 const url=new URL(request.url),path=url.pathname;
 if(!/^\/api\/quotation\/(banking|documents)(\/|$)/.test(path))return null;
 if(env.QUOTATION_COMMERCIAL_ENABLED!=='true')return json({error:'quotation_commercial_disabled'},404);
 if(!auth?.user_id||!auth?.tenant_id)return json({error:'unauthenticated'},401);
 // Existing live quotation editor is owner-only. Retain this boundary; branch
 // manager access needs its own qualified branch-aware permission contract.
 if(auth.role!=='owner')return json({error:'forbidden'},403);
 if(!['GET','PUT','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(request.method!=='GET'&&(request.headers.get('origin')!==url.origin||!auth.csrf_token||request.headers.get('x-csrf-token')!==auth.csrf_token))return json({error:'mutation_denied'},403);
 const db=env.DB,tenant=auth.tenant_id,actor=auth.user_id;
 try{
 if(path==='/api/quotation/banking'){
  if(request.method==='GET'){
   const row=await db.prepare('SELECT revision,banking_json FROM quotation_company_banking WHERE tenant_id=?').bind(tenant).first();
   return json({ok:true,revision:row?.revision??0,banking:row?JSON.parse(row.banking_json):null});
  }
  if(request.method!=='PUT')throw error('method_not_allowed',405);
  const body=await bodyJSON(request);exact(body,['revision','banking']);const v=revision(body.revision),bank=validateCompanyBanking(body.banking);
  const stmt=v===0?db.prepare('INSERT OR IGNORE INTO quotation_company_banking(tenant_id,revision,banking_json,updated_by) VALUES(?,1,?,?) RETURNING revision').bind(tenant,JSON.stringify(bank),actor):
   db.prepare('UPDATE quotation_company_banking SET revision=revision+1,banking_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND revision=? RETURNING revision').bind(JSON.stringify(bank),actor,tenant,v);
  const result=await stmt.first();if(!result)throw error('revision_conflict',409);
  return json({ok:true,revision:v+1,banking:bank});
 }
 if(path==='/api/quotation/documents'&&request.method==='GET'){
  const rows=await db.prepare('SELECT id,kind,status,revision,number,total_minor,updated_at FROM quotation_commercial_documents WHERE tenant_id=? ORDER BY updated_at DESC,id LIMIT 100').bind(tenant).all();
  return json({ok:true,items:rows.results||[]});
 }
 const match=path.match(/^\/api\/quotation\/documents\/([A-Za-z0-9_-]{1,90})(?:\/(issue|convert|pdf))?$/);if(!match)throw error('not_found',404);
 const [,docId,action]=match;
 if(!action&&request.method==='GET'){const row=await read(db,tenant,docId);if(!row)throw error('not_found',404);return json(receipt(row))}
 if(!action&&request.method==='PUT'){
  const body=await bodyJSON(request);exact(body,['revision','document','schedule']);const v=revision(body.revision);
  const d=validateQuotationCustomPage(body.document),old=await read(db,tenant,docId);
  if((old&&(old.status!=='draft'||old.revision!==v))||(!old&&v!==0))throw error('revision_conflict',409);
  // Numbers are server-issued. Draft text has no authority.
  if(body.document.quoteNumber!=='DRAFT')throw error('draft_number_must_be_DRAFT');
  if(old?.kind==='invoice'&&(d.totalCents!==old.total_minor||d.customerName!==JSON.parse(old.document_json).customerName))throw error('invoice_snapshot_mismatch');
  const schedule=body.schedule??(old?JSON.parse(old.schedule_json):{});exact(schedule,['depositDueMinor','instalments']);
  previewInvoicePayments({invoiceTotalMinor:d.totalCents,...schedule});
  const result=old?await db.prepare("UPDATE quotation_commercial_documents SET document_json=?,schedule_json=?,total_minor=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND revision=? AND status='draft' RETURNING revision")
    .bind(JSON.stringify(body.document),JSON.stringify(schedule),d.totalCents,actor,tenant,docId,v).first():
    await db.prepare("INSERT OR IGNORE INTO quotation_commercial_documents(tenant_id,id,kind,revision,document_json,total_minor,schedule_json,updated_by) VALUES(?,?,'quote',1,?,?,?,?) RETURNING revision")
    .bind(tenant,docId,JSON.stringify(body.document),d.totalCents,JSON.stringify(schedule),actor).first();
  if(!result)throw error('revision_conflict',409);return json(receipt(await read(db,tenant,docId)));
 }
 if(action==='pdf'&&request.method==='GET'){
  const row=await read(db,tenant,docId);if(!row)throw error('not_found',404);
  if(row.status!=='issued')throw error('issued_document_required',409);
  if(typeof env.QUOTATION_PDF_RENDERER?.fetch!=='function')throw error('pdf_renderer_unavailable',503);
  // Private service binding only; no operator/customer supplied URL or raw HTML.
  const rendered=await env.QUOTATION_PDF_RENDERER.fetch(new Request('https://quotation-renderer.internal/pdf',{
   method:'POST',headers:{'content-type':'application/json'},body:row.document_json
  }));
  if(!rendered.ok||rendered.headers.get('content-type')?.split(';')[0]!=='application/pdf'||rendered.headers.get('x-quotation-page-count')!=='2')throw error('pdf_renderer_unavailable',503);
  const reader=rendered.body?.getReader();if(!reader)throw error('pdf_renderer_unavailable',503);
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024)throw error('pdf_too_large',503);chunks.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  if(bytes.length<8||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw error('pdf_renderer_unavailable',503);
  return new Response(bytes,{headers:{'content-type':'application/pdf','cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'attachment; filename="'+row.number+'.pdf"'}});
 }
 if(request.method!=='POST')throw error('method_not_allowed',405);
 const body=await bodyJSON(request),row=await read(db,tenant,docId);if(!row)throw error('not_found',404);
 if(action==='convert'){
  exact(body,['customerId','dueOn']);if(row.kind!=='quote'||row.status!=='issued')throw error('issued_quote_required',409);
  if(!idOK(body.customerId)||!dateOK(body.dueOn)||body.dueOn<JSON.parse(row.document_json).issueDate)throw error('invalid_invoice_details');
  const customer=await db.prepare("SELECT id FROM finance_customers WHERE tenant_id=? AND id=? AND status='active'").bind(tenant,body.customerId).first();if(!customer)throw error('customer_not_found',404);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tenant+':'+docId));
  const convertedId='inv_'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const document=JSON.parse(row.document_json);document.quoteNumber='DRAFT';document.copy.heading='INVOICE';document.copy.quoteNumberLabel='Invoice No';
  await db.prepare("INSERT OR IGNORE INTO quotation_commercial_documents(tenant_id,id,kind,revision,document_json,source_quote_id,finance_customer_id,finance_invoice_id,due_on,total_minor,schedule_json,updated_by) VALUES(?,?,'invoice',1,?,?,?,?,?,?,?,?)")
   .bind(tenant,convertedId,JSON.stringify(document),docId,body.customerId,crypto.randomUUID(),body.dueOn,row.total_minor,row.schedule_json,actor).run();
  const converted=await read(db,tenant,convertedId);
  if(!converted||converted.source_quote_id!==docId||converted.finance_customer_id!==body.customerId||converted.due_on!==body.dueOn)throw error('conversion_conflict',409);
  return json(receipt(converted));
 }
 if(action!=='issue')throw error('not_found',404);exact(body,['revision']);revision(body.revision);
 // Replays return the already frozen document without advancing its number.
 if(row.status==='issued')return json(receipt(row));
 if(row.revision!==body.revision)throw error('revision_conflict',409);
 const document=JSON.parse(row.document_json),validated=validateQuotationCustomPage(document);
 if(validated.totalCents<=0||!document.copy.bankAccountHolder?.trim()||!document.copy.bankAccount||!/^[0-9]{1,34}$/.test(document.copy.bankAccount)||!document.termsText||/sample customer/i.test(document.customerName))throw error('complete_customer_amount_bank_and_terms');
 const eligible="EXISTS(SELECT 1 FROM quotation_commercial_documents WHERE tenant_id=? AND id=? AND revision=? AND status='draft')";
 // Include existing canonical invoice numbers so a newly activated sequence
 // cannot get stuck on an invoice issued through the existing Finance UI.
 const nextInvoice="COALESCE((SELECT MAX(CAST(substr(invoice_number,5) AS INTEGER)) FROM finance_invoices WHERE tenant_id=? AND invoice_number GLOB 'INV-[0-9]*' AND substr(invoice_number,5) NOT GLOB '*[^0-9]*' AND length(invoice_number)<=13),0)+1";
 const statements=[row.kind==='invoice'?
  db.prepare(`INSERT INTO quotation_commercial_sequences(tenant_id,kind,value) SELECT ?,'invoice',${nextInvoice} WHERE ${eligible} ON CONFLICT(tenant_id,kind) DO UPDATE SET value=MAX(value+1,excluded.value)`)
   .bind(tenant,tenant,tenant,docId,row.revision):
  db.prepare(`INSERT INTO quotation_commercial_sequences(tenant_id,kind,value) SELECT ?,'quote',1 WHERE ${eligible} ON CONFLICT(tenant_id,kind) DO UPDATE SET value=value+1`)
   .bind(tenant,tenant,docId,row.revision)];
 const prefix=row.kind==='quote'?'QT-':'INV-';
 // json_set preserves the exact document and banking snapshot; only the number
 // changes. One D1 transactional batch serializes the counter and issuance.
 if(row.kind==='invoice'){
  const customer=await db.prepare("SELECT id FROM finance_customers WHERE tenant_id=? AND id=? AND status='active'").bind(tenant,row.finance_customer_id).first();if(!customer)throw error('customer_not_found',404);
  statements.push(db.prepare(`INSERT INTO finance_invoices(id,tenant_id,customer_id,invoice_number,issued_on,due_on,description,total_minor,currency,status,created_by_user_id) SELECT ?,?,?,?||printf('%06d',value),?,?,?,?, 'BWP','issued',? FROM quotation_commercial_sequences WHERE tenant_id=? AND kind='invoice' AND ${eligible}`)
   .bind(row.finance_invoice_id,tenant,row.finance_customer_id,prefix,document.issueDate,row.due_on,'Quotation '+row.source_quote_id,row.total_minor,actor,tenant,tenant,docId,row.revision));
 }
 statements.push(db.prepare(`UPDATE quotation_commercial_documents SET status='issued',number=?||(SELECT printf('%06d',value) FROM quotation_commercial_sequences WHERE tenant_id=? AND kind=?),document_json=json_set(document_json,'$.quoteNumber',?||(SELECT printf('%06d',value) FROM quotation_commercial_sequences WHERE tenant_id=? AND kind=?)),revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND revision=? AND status='draft'`)
  .bind(prefix,tenant,row.kind,prefix,tenant,row.kind,actor,tenant,docId,row.revision));
 await db.batch(statements);return json(receipt(await read(db,tenant,docId)));
 }catch(e){
  if(e.status)return json({error:e.message},e.status);
  if(/invalid_|unsupported_|quotation_money_|overpayment|schedule|deposit|instalment/i.test(e.message||''))return json({error:'invalid_document_or_schedule'},400);
  // No SQL, customer data or banking details in failures/logs.
  return json({error:'quotation_storage_unavailable'},503);
 }
}

/** Production-edge adapter. The existing core auth/me endpoint revalidates the
 * cookie, session generation and active membership. Never trust client identity.
 */
export async function handleQuotationCommercialRoute({request,logicalPath,env,fetchSession}={}){
 const path=logicalPath||new URL(request.url).pathname;
 if(!/^\/api\/quotation\/(banking|documents)(\/|$)/.test(path))return null;
 if(env.QUOTATION_COMMERCIAL_ENABLED!=='true')return json({error:'quotation_commercial_disabled'},404);
 if(!request.headers.get('cookie')?.trim()||typeof fetchSession!=='function')return json({error:'unauthenticated'},401);
 try{
  const headers=new Headers();for(const key of ['cookie','origin']){const value=request.headers.get(key);if(value!==null)headers.set(key,value)}
  const session=await fetchSession(new Request(new URL('/__thebe_api/auth/me',request.url),{headers}));
  if(!session.ok)return json({error:'unauthenticated'},401);
  const identity=await session.json();const user=identity?.user;
  if(!user?.id||!user?.tenantId)return json({error:'unauthenticated'},401);
  if(user.role!=='owner'||user.onboardingComplete!==true||identity.landingPath)return json({error:'forbidden'},403);
  const target=new URL(request.url);target.pathname=path;
  return handleQuotationCommercialRequest({request:new Request(target,request),env,auth:{user_id:user.id,tenant_id:user.tenantId,role:user.role,csrf_token:identity.csrfToken}});
 }catch{return json({error:'quotation_session_unavailable'},503)}
}
