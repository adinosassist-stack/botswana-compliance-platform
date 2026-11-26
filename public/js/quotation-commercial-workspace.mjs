import {mountQuotationCustomizablePage} from './quotation-customizable-page.mjs';
import {quotationCustomSample} from './quotation-customizable-page-model.mjs';
import {prepareDocumentPdf,sharePreparedDocumentPdf} from './essentials-document-share.mjs';
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
/** Mounted only after the server-authorized customer editor capability. */
export async function mountQuotationCommercialWorkspace(root,{capability,fetchImpl=globalThis.fetch,issuerName}={}){
 if(capability?.enabled!==true||capability?.authenticated!==true||capability?.canEditQuotations!==true)throw Error('quotation_workspace_disabled');
 let disposed=false,busy=true,editor,current=null,bankingRevision=0,csrf='',prepared=null,pdfUrl=null;
 const css=node('style');css.textContent='.qcommercial{font:14px/1.5 system-ui;color:#192634;background:#f0f2f5;padding:12px;display:grid;gap:12px}.qcommercial button,.qcommercial input,.qcommercial select{font:inherit;min-height:44px;max-width:100%;box-sizing:border-box;padding:9px}.qcommercial .qc-row{display:flex;flex-wrap:wrap;gap:8px}.qcommercial label{display:grid;gap:4px;min-width:0}.qc-bank{display:grid;gap:8px;max-width:700px}.qc-status{overflow-wrap:anywhere}@media print{.qcommercial{display:none!important}}';
 const nonce=document.querySelector('script[nonce],style[nonce]')?.nonce;if(nonce)css.nonce=nonce;
 const panel=node('section');panel.className='qcommercial';
 const status=node('p','Loading your saved quotations and banking details…');status.className='qc-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const row=node('div');row.className='qc-row';
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.addEventListener('click',fn);row.append(b);return b};
 const selected=node('select');selected.setAttribute('aria-label','Saved quotations and invoices');row.append(selected);
 const editorHost=node('div');const notice=text=>{if(!disposed)status.textContent=text};
 const messages={revision_conflict:'A newer version exists. Open the saved copy before saving again.',quotation_commercial_disabled:'Saved quotations are awaiting activation. Your current editor is still available.',quotation_storage_unavailable:'Saving is temporarily unavailable. Your edits are still here.',complete_customer_amount_bank_and_terms:'Complete the customer, amount, banking details and terms before issuing.',pdf_renderer_unavailable:'Direct PDF download is awaiting activation. Use Print / Save PDF below.',invalid_document_or_schedule:'Complete valid customer details, dates, amounts and payment schedule.',customer_not_found:'Choose an active customer belonging to this business.'};
 async function request(path,method='GET',body){
 const response=await fetchImpl('/api/quotation/'+path,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw Error(messages[data.error]||'The action could not be completed. Check your details and retry.');return data;
 }
 async function run(fn){if(busy||disposed)return;busy=true;for(const b of row.querySelectorAll('button'))b.disabled=true;try{await fn()}catch(e){notice(e.message)}finally{busy=false;if(!disposed)paint()}}
 const newButton=button('New quotation',()=>run(async()=>{
  if(editor&&!globalThis.confirm('Start a new quotation? Save your current edits first.'))return;
  const banking=await request('banking');openNew(banking.banking);notice('New quotation. Company banking defaults are filled in; document edits do not change those defaults.');
 }));
 button('Open saved',()=>run(async()=>{if(!selected.value)return;if(editor&&!globalThis.confirm('Replace current fields with this saved copy? Unsaved edits will be lost.'))return;open(await request('documents/'+selected.value));notice('Saved '+current.kind+' opened.')}));
 const reviseButton=button('Revise quotation',()=>run(async()=>{if(current?.kind!=='quote'||current?.status!=='issued')return;const document=editor.getDraft();document.quoteNumber='DRAFT';current=null;clearPdf();deposit.disabled=instalments.disabled=false;render(document);notice('Revision started as a new draft. The issued quotation remains unchanged.');}));
 const saveButton=button('Save draft',()=>run(async()=>{
  const doc=editor.getDraft();if(current?.status==='issued')throw Error('Issued documents are locked. Start a new quotation.');
  const saved=await request('documents/'+(current?.id||crypto.randomUUID()),'PUT',{revision:current?.revision||0,document:doc,schedule:readSchedule()});
  current=saved;clearPdf();await list();notice('Draft saved to your business account. You can open it on another device.');
 }));
 const issueButton=button('Issue document',()=>run(async()=>{
  if(!current||JSON.stringify(editor.getDraft())!==JSON.stringify(current.document)||JSON.stringify(readSchedule())!==JSON.stringify(current.schedule))throw Error('Save your latest changes before issuing.');
  if(!globalThis.confirm('Issue this '+current.kind+'? Its number and contents will be permanent.'))return;
  open(await request('documents/'+current.id+'/issue','POST',{revision:current.revision}));await list();notice('Issued '+current.number+'. The saved copy is locked.');
 }));
 const customer=node('select');customer.setAttribute('aria-label','Invoice customer');const due=node('input');due.type='date';due.setAttribute('aria-label','Invoice due date');row.append(customer,due);
 const convertButton=button('Create invoice draft',()=>run(async()=>{
  if(!current||current.status!=='issued'||current.kind!=='quote')throw Error('Open an issued quotation first.');
  open(await request('documents/'+current.id+'/convert','POST',{customerId:customer.value,dueOn:due.value}));await list();notice('Invoice draft created from the issued quotation. Review and issue when ready.');
 }));
 const prepare=button('Prepare PDF',()=>run(async()=>{
  if(!current||current.status!=='issued')throw Error('Issue and open the saved document before preparing its PDF.');
  const id=current.id;
  const response=await fetchImpl('/api/quotation/documents/'+id+'/pdf',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(!response.ok){const data=await response.json();throw Error(messages[data.error]||'PDF could not be prepared. Use Print / Save PDF below.');}
  if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw Error('The server did not return a PDF.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024)throw Error('PDF exceeds the download limit.');parts.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const blob=new Blob(parts,{type:'application/pdf'});const file=await prepareDocumentPdf({blob,filename:current.number+'.pdf'});
  if(disposed||current.id!==id)return;clearPdf();prepared=file;pdfUrl=URL.createObjectURL(blob);notice('PDF ready. Download it or tap Share PDF and choose WhatsApp.');
 }));
 const download=button('Download PDF',()=>{if(!pdfUrl)return;const a=node('a');a.href=pdfUrl;a.download=current.number+'.pdf';a.click()});
 // The prepared File exists before this user gesture; no asynchronous work
 // precedes navigator.share, preserving Android's transient activation.
 const share=button('Share PDF',async()=>{
  if(!prepared||busy||disposed)return;
  try{const result=await sharePreparedDocumentPdf({navigatorApi:globalThis.navigator,file:prepared,message:{title:current.number,text:'Please review the attached PDF.'}});notice(result.shared?'Share sheet completed. Confirm the attachment in WhatsApp.':'Native sharing is unavailable. Download the PDF and attach it in WhatsApp.')}catch(e){notice(e.name==='AbortError'?'Sharing cancelled. The PDF is still ready.':'Unable to share. Download the PDF and attach it in WhatsApp.')}
 });
 const scheduleSection=node('details'),scheduleSummary=node('summary','Deposit and instalments');scheduleSection.append(scheduleSummary);
 const deposit=node('input');deposit.type='text';deposit.inputMode='decimal';deposit.value='0.00';deposit.setAttribute('aria-label','Deposit due (P)');
 const instalments=node('textarea');instalments.setAttribute('aria-label','Instalments, one date and pula amount per line');instalments.placeholder='2026-12-01 500.00';
 scheduleSection.append(node('p','Schedule only. Only verified Finance allocations reduce the outstanding balance.'),deposit,instalments);
 function money(v){if(!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(v.trim()))throw Error('Enter amounts in pula, for example 500.00.');const [p,c='']=v.trim().split('.');return Number(p)*100+Number(c.padEnd(2,'0'))}
 function readSchedule(){const rows=instalments.value.trim()?instalments.value.trim().split('\n').map((line,i)=>{const [dueDate,amount,...rest]=line.trim().split(/\s+/);if(rest.length||!amount)throw Error('Use one date and amount per line, for example 2026-12-01 500.00.');return {id:'instalment-'+(i+1),dueDate,amountMinor:money(amount)}}):[];return {depositDueMinor:money(deposit.value),instalments:rows}}
 function clearPdf(){prepared=null;if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=null;}
 function paint(){for(const b of row.querySelectorAll('button'))b.disabled=busy;reviseButton.disabled=busy||current?.kind!=='quote'||current?.status!=='issued';saveButton.disabled=busy||current?.status==='issued';issueButton.disabled=busy||!current||current.status==='issued';convertButton.disabled=busy||current?.kind!=='quote'||current?.status!=='issued';prepare.disabled=busy||current?.status!=='issued';download.disabled=busy||!pdfUrl;share.disabled=busy||!prepared;}
 function render(document){editor?.destroy();editor=mountQuotationCustomizablePage(editorHost,{capability,issuerName,initial:document,documentMode:'customer',commercialMode:true});
  if(current?.status==='issued')for(const n of editorHost.querySelectorAll('input,textarea,button')){if(!n.textContent.startsWith('Print '))n.disabled=true}
 }
 function open(data){current=data;clearPdf();deposit.value=((data.schedule?.depositDueMinor||0)/100).toFixed(2);instalments.value=(data.schedule?.instalments||[]).map(x=>x.dueDate+' '+(x.amountMinor/100).toFixed(2)).join('\n');deposit.disabled=instalments.disabled=data.status==='issued';render(data.document);paint()}
 function openNew(bank){current=null;clearPdf();deposit.value='0.00';instalments.value='';deposit.disabled=instalments.disabled=false;
  const d=quotationCustomSample();Object.assign(d,{quoteNumber:'DRAFT',issueDate:new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Gaborone'}),customerName:'',customerPhone:'',location:''});d.items[0].unitPrice='0.00';
  if(bank)Object.assign(d.copy,{bankName:bank.bankName,bankAccount:bank.accountNumber,bankBranch:bank.branch,bankAccountHolder:bank.accountHolder,bankBranchCode:bank.branchCode,bankPaymentReference:bank.paymentReference});render(d);paint();
 }
 async function list(){const data=await request('documents');selected.replaceChildren();for(const x of data.items){const option=node('option',(x.number||'Draft '+x.kind)+' · '+x.id.slice(0,8));option.value=x.id;selected.append(option)}if(current)selected.value=current.id}
 const banking=node('details'),summary=node('summary','Company Settings — banking details');banking.append(summary,node('p','Saved once for new quotations and invoices. Changing defaults never changes saved or issued documents.'));
 const bankForm=node('div');bankForm.className='qc-bank';const fields={};
 for(const [key,title] of Object.entries({bankName:'Bank name',accountHolder:'Account holder',accountNumber:'Account number',branch:'Branch',branchCode:'Branch code (optional)',paymentReference:'Payment reference (optional)'})){
 const label=node('label',title),input=node('input');input.type=key==='accountNumber'?'password':'text';input.autocomplete='off';input.maxLength=key==='accountNumber'?34:120;fields[key]=input;label.append(input);bankForm.append(label);}
 const show=node('button','Show / hide account number');show.type='button';show.addEventListener('click',()=>{fields.accountNumber.type=fields.accountNumber.type==='password'?'text':'password'});
 const saveBank=node('button','Save company banking details');saveBank.type='button';saveBank.addEventListener('click',()=>run(async()=>{
  saveBank.disabled=true;try{const result=await request('banking','PUT',{revision:bankingRevision,banking:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value]))});bankingRevision=result.revision;notice('Company banking details saved. They will fill new documents automatically. The open document keeps its current details.')}finally{saveBank.disabled=false}
 }));bankForm.append(show,saveBank);banking.append(bankForm);
 panel.append(css,row,status,scheduleSection,banking);root.replaceChildren(panel,editorHost);
 editorHost.addEventListener('input',()=>{clearPdf();paint()});
 try{
 const me=await fetchImpl('/api/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!me.ok)throw Error('Your session has expired. Sign in again.');const identity=await me.json();csrf=identity.csrfToken;if(!csrf)throw Error('Unable to verify your session. Sign in again.');
 const bank=await request('banking');bankingRevision=bank.revision;for(const [k,v] of Object.entries(bank.banking||{}))if(fields[k])fields[k].value=v;
 await list();const customers=await fetchImpl('/api/finance/customers',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(customers.ok){const data=await customers.json();for(const x of data.items||[]){if(x.status&&x.status!=='active')continue;const option=node('option',x.name);option.value=x.id;customer.append(option)}}
 busy=false;openNew(bank.banking);notice('Ready. Enter customer details and amounts, then save your quotation.');
 }catch(e){notice(e.message);newButton.disabled=true;saveButton.disabled=true;issueButton.disabled=true;convertButton.disabled=true;prepare.disabled=true;download.disabled=true;share.disabled=true;}
 return {destroy(){disposed=true;editor?.destroy();clearPdf();root.replaceChildren()}};
}
