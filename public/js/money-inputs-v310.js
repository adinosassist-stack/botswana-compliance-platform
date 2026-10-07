(()=>{
  'use strict';
  const RELEASE='20261007-money-inputs-v310';
  const ACTIONS=[['account','Add account'],['income','Record income'],['expense','Record expense'],['customer','Add customer'],['invoice','Add invoice'],['supplier','Add supplier'],['bill','Add bill'],['match','Link payment'],['import','Import statement'],['reconcile','Reconcile account'],['review','Review records']];
  const CATEGORIES=['inventory','materials','rent','utilities','payroll','transport','marketing','tax','loan','equipment','professional_services','other'];
  let root,panel,form,status,selection='',busy=false,loadGeneration=0,preview=null,requestKey='';
  const node=(tag,text,attrs={})=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));return el};
  const money=minor=>'P'+(Number(minor)/100).toLocaleString('en-BW',{minimumFractionDigits:2,maximumFractionDigits:2});
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Gaborone',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const key=()=>globalThis.crypto.randomUUID();
  const api=(path,options={})=>{if(typeof globalThis.apiJson!=='function')throw new Error('The secure workspace API is not ready. Reload the workspace and try again.');return globalThis.apiJson('/api/finance/'+path,options)};
  function minor(value,{signed=false,zero=false}={}){
    const raw=String(value||'').trim();
    if(!(signed?/^-?\d+(?:\.\d{1,2})?$/:/^\d+(?:\.\d{1,2})?$/).test(raw))throw new Error('Enter a pula amount with no more than two decimal places.');
    const negative=raw.startsWith('-'),[whole,fraction='']=raw.replace('-','').split('.');
    const result=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(negative?-1:1);
    if(!Number.isSafeInteger(result)||(!zero&&result===0)||(!signed&&result<0))throw new Error('Enter a valid amount greater than zero.');
    return result;
  }
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    text=String(text).replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell!=='')throw new Error('CSV quotes must begin at the start of a field.');else quoted=!quoted}
      else if(char===','&&!quoted){row.push(cell);cell=''}
      else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
      else cell+=char;
    }
    if(quoted)throw new Error('CSV has an unclosed quoted field.');
    row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    const header=rows.shift()?.map(x=>x.trim().toLowerCase());
    if(!header||header.join(',')!=='date,description,amount,reference')throw new Error('Use these CSV columns in order: date,description,amount,reference.');
    if(!rows.length||rows.length>1000)throw new Error('Import between 1 and 1,000 transactions at a time.');
    return rows.map((values,index)=>{
      if(values.length!==4)throw new Error('CSV row '+(index+2)+' must have four fields.');
      const [postedOn,description,amount,reference]=values.map(x=>x.trim());
      if(!validDate(postedOn)||!description||description.length>500||reference.length>160)throw new Error('Check the date, description and reference on CSV row '+(index+2)+'.');
      return {postedOn,description,amountMinor:minor(amount,{signed:true}),reference};
    });
  }
  function message(text,kind=''){status.textContent=text;status.dataset.kind=kind}
  function button(text,action){const el=node('button',text,{type:'button',class:'btn alt'});el.dataset.moneyInputAction=action;return el}
  function field(label,name,{type='text',value='',maxLength,required=true,options,help}={}){
    const wrap=node('label',undefined,{class:'money-input-field'});wrap.append(node('span',label));
    const input=node(options?'select':'input',undefined,{name,id:'money-input-'+name});
    if(options){input.append(node('option','Choose…',{value:''}));for(const item of options)input.append(node('option',item.label,{value:item.value}))}
    else{input.type=type;if(maxLength)input.maxLength=maxLength;if(name.toLowerCase().includes('amount')||name==='opening')input.inputMode='decimal'}
    input.required=required;input.value=value;wrap.append(input);if(help)wrap.append(node('small',help));form.append(wrap);return input;
  }
  const records=async path=>(await api(path,{method:'GET'})).items||[];
  const activeOptions=items=>items.filter(x=>x.status==='active').map(x=>({value:x.id,label:x.name}));
  function amountField(label='Amount (P)'){field(label,'amount',{maxLength:20})}
  function dates(){field('Issue date','issuedOn',{type:'date',value:today()});field('Due date','dueOn',{type:'date',value:today()})}
  function endForm(label='Save record'){
    const actions=node('div',undefined,{class:'money-input-form-actions'});const submit=node('button',label,{type:'submit',class:'btn'});actions.append(submit,button('Cancel','cancel'));form.append(actions);form.dataset.ready='true';
  }
  async function open(action){
    if(busy)return;
    const generation=++loadGeneration;
    selection=action;preview=null;requestKey=key();panel.hidden=false;form.replaceChildren();form.dataset.ready='false';
    panel.querySelector('h3').textContent=ACTIONS.find(x=>x[0]===action)?.[1]||'Money records';
    message('Loading input options…');
    try{
      if(action==='account'){
        field('Account name','name',{maxLength:120});field('Account type','accountType',{options:['bank','cash','mobile_money','clearing'].map(value=>({value,label:value.replaceAll('_',' ')}))});
        field('Starting balance (P)','opening',{maxLength:20,value:'0',help:'Balance before the transactions you will record or import. Do not include those transactions twice. Negative balances are allowed.'});
      }else if(action==='customer'||action==='supplier'){
        field(action==='customer'?'Customer name':'Supplier name','name',{maxLength:160});field('Unique reference / code','code',{maxLength:80,value:(action==='customer'?'CUS-':'SUP-')+requestKey.slice(0,8),help:'Keep this reference when checking whether a save succeeded.'});
        if(action==='supplier')field('Usual expense category','category',{value:'other',options:CATEGORIES.map(value=>({value,label:value.replaceAll('_',' ')}))});
      }else if(action==='review'){
        field('Records to review','recordType',{options:[['accounts','Accounts'],['customers','Customers'],['suppliers','Suppliers'],['invoices?limit=200','Recent invoices (up to 200)'],['payables','Open bills (up to 50)'],['transactions?limit=500','Recent transactions (up to 500)']].map(([value,label])=>({value,label}))});endForm('Load records');message('Review saved records before repeating an uncertain save.');return;
      }else if(action==='income'||action==='expense'||action==='import'||action==='reconcile'){
        const accounts=activeOptions(await records('accounts'));if(generation!==loadGeneration)return;
        if(!accounts.length){message('Add an account first, then record or import its transactions.');form.append(button('Add account','account'));return}
        field('Account','accountId',{options:accounts});
        if(action==='reconcile'){
          field('Statement start date','statementFrom',{type:'date',value:today()});field('Statement end date','statementTo',{type:'date',value:today()});field('Statement opening balance (P)','opening',{maxLength:20});field('Statement closing balance (P)','closing',{maxLength:20});endForm('Run reconciliation');message('Compare the statement balances with recorded transactions for this period. This does not change cash balances.');return;
        }
        if(action==='import'){
          const file=field('CSV statement','file',{type:'file',help:'Columns: date,description,amount,reference. Dates: YYYY-MM-DD. Positive amounts are money in; negative amounts are money out. Opening balance must precede the imported period.'});file.accept='.csv,text/csv';
          const template=node('a','Download CSV template',{href:'data:text/csv;charset=utf-8,'+encodeURIComponent('date,description,amount,reference\r\n'),download:'thebe-statement-template.csv',class:'money-input-template'});form.append(template);endForm('Preview import');
          message('Choose an account and CSV file. Nothing is saved until you review and confirm.');return;
        }
        field('Transaction date','postedOn',{type:'date',value:today()});amountField();field('Description / purpose','description',{maxLength:500});field('Payment reference','reference',{required:false,maxLength:160,help:'For an invoice or bill payment, save here first, then use Link payment. This records money already received or spent.'});
      }else if(action==='invoice'||action==='bill'){
        const isInvoice=action==='invoice';const options=activeOptions(await records(isInvoice?'customers':'suppliers'));if(generation!==loadGeneration)return;
        if(!options.length){message('Add a '+(isInvoice?'customer':'supplier')+' first.');form.append(button(isInvoice?'Add customer':'Add supplier',isInvoice?'customer':'supplier'));return}
        field(isInvoice?'Customer':'Supplier',isInvoice?'customerId':'supplierId',{options});field(isInvoice?'Invoice number':'Bill number','number',{maxLength:80});dates();amountField('Full invoice / bill amount (P)');field('Description','description',{required:false,maxLength:500});
        if(!isInvoice)field('Expense category','category',{value:'other',options:CATEGORIES.map(value=>({value,label:value.replaceAll('_',' ')}))});
      }else if(action==='match'){
        const [invoices,bills,transactions]=await Promise.all([records('invoices?limit=200'),records('payables'),records('transactions?limit=500')]);if(generation!==loadGeneration)return;
        const obligations=[...invoices.filter(x=>x.status==='issued'&&x.outstandingMinor>0).map(x=>({value:'invoices/'+x.id,label:'Invoice '+x.invoiceNumber+' · '+x.customerName+' · '+money(x.outstandingMinor),kind:'in'})),...bills.filter(x=>x.outstandingMinor>0).map(x=>({value:'payables/'+x.id,label:'Bill '+x.payableNumber+' · '+x.supplierName+' · '+money(x.outstandingMinor),kind:'out'}))];
        if(!obligations.length||!transactions.length){message('Record an unpaid invoice or bill and its received / spent transaction first. Linking uses existing transactions and does not move money.');return}
        const target=field('Invoice or bill','obligation',{options:obligations});
        const payment=field('Recorded payment','transactionId',{options:[]});
        const update=()=>{payment.replaceChildren(node('option','Choose…',{value:''}));const kind=obligations.find(x=>x.value===target.value)?.kind;if(!kind)return;for(const tx of transactions.filter(x=>kind==='in'?x.amount_minor>0:x.amount_minor<0))payment.append(node('option',tx.posted_on+' · '+tx.description+' · '+money(Math.abs(tx.amount_minor)),{value:tx.id}))};
        target.addEventListener('change',update);amountField('Amount to link (P)');form.append(node('p','Choose the matching received payment for an invoice, or outgoing payment for a bill. Already linked amounts are checked when saving. The list shows up to 200 recent invoices, 50 open bills and 500 recent transactions.'));
      }
      if(generation!==loadGeneration)return;endForm(selection==='match'?'Link recorded payment':'Save record');message('Amounts are in Botswana pula. Saving updates the recorded finance totals.');form.querySelector('input,select')?.focus();
    }catch(error){if(generation===loadGeneration){message('Could not load inputs. '+friendly(error),'error');form.append(button('Try again',action))}}
  }
  function friendly(error){
    const code=error?.code||error?.message||'';
    const known={duplicate_import_content:'These transactions were already imported. Check Money before uploading again.',finance_account_exists:'This account already exists.',finance_invoice_exists_or_invalid:'This invoice number already exists or its details are invalid.',finance_payable_exists_or_invalid:'This bill number already exists or its details are invalid.',finance_customer_code_exists:'This customer reference already exists.',finance_supplier_exists:'This supplier already exists.',finance_invoice_overallocation:'This exceeds the invoice balance.',finance_payable_overallocation:'This exceeds the bill balance.',finance_transaction_overallocation:'This exceeds the payment amount still available to link.',forbidden:'Only an owner or manager can enter finance records.'};
    return known[code]||String(error?.message||'Please try again.').slice(0,240);
  }
  async function post(path,body,idempotent=false){return api(path,{method:'POST',body:JSON.stringify(body),idempotencyKey:idempotent?requestKey:false})}
  async function save(event){
    event.preventDefault();if(busy||form.dataset.ready!=='true'||!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form));
    busy=true;panel.setAttribute('aria-busy','true');for(const b of root.querySelectorAll('button'))b.disabled=true;
    try{
      if(selection==='import'&&!preview){
        const file=form.elements.namedItem('file').files[0];if(!file||file.size>700*1024)throw new Error('Choose a CSV file smaller than 700 KB.');
        const rows=parseCSV(await file.text());preview={accountId:values.accountId,rows};
        const sum=rows.reduce((total,row)=>total+row.amountMinor,0);const review=node('div',undefined,{class:'money-import-review'});review.append(node('b',rows.length+' transactions · net change '+money(sum)));
        const table=node('table');const head=node('tr');for(const label of ['Date','Description','Amount','Reference'])head.append(node('th',label));table.append(head);
        for(const row of rows.slice(0,10)){const tr=node('tr');for(const value of [row.postedOn,row.description,money(row.amountMinor),row.reference])tr.append(node('td',value));table.append(tr)}
        const wrap=node('div',undefined,{class:'money-import-table',tabindex:'0',role:'region','aria-label':'Statement preview'});wrap.append(table);review.append(wrap,node('p','Showing the first '+Math.min(10,rows.length)+' rows. Exact repeat imports are blocked. Do not import overlapping periods or transactions already entered manually.'));
        form.querySelector('.money-input-form-actions').before(review);form.querySelector('[type="submit"]').textContent='Confirm import';form.querySelectorAll('input,select').forEach(el=>el.disabled=true);message('Review the account, transactions and net change. Nothing has been saved.');return;
      }
      let result;
      if(selection==='review'){
        const allowed=['accounts','customers','suppliers','invoices?limit=200','payables','transactions?limit=500'];if(!allowed.includes(values.recordType))throw new Error('Choose a record type.');
        const rows=await records(values.recordType);form.querySelector('.money-record-list')?.remove();const list=node('div',undefined,{class:'money-record-list'});if(!rows.length)list.append(node('p','No records returned.'));
        for(const row of rows){const card=node('div',undefined,{class:'money-record-row'});card.append(node('b',row.name||row.invoiceNumber||row.payableNumber||row.description||row.id));card.append(node('span',[row.customerName||row.supplierName,row.customer_code||row.supplier_code||row.reference,row.posted_on||row.dueOn,row.status,row.amount_minor!==undefined?money(row.amount_minor):row.outstandingMinor!==undefined?money(row.outstandingMinor)+' outstanding':row.opening_balance_minor!==undefined?money(row.opening_balance_minor)+' starting balance':''].filter(Boolean).join(' · ')));list.append(card)}
        form.append(list);message(rows.length+' records returned. Lists are limited as labelled.');return;
      }
      if(selection==='reconcile'){
        if(!validDate(values.statementFrom)||!validDate(values.statementTo)||values.statementFrom>values.statementTo)throw new Error('Statement end date must be on or after its start date.');
        result=await post('reconciliations',{accountId:values.accountId,statementFrom:values.statementFrom,statementTo:values.statementTo,openingBalanceMinor:minor(values.opening,{signed:true,zero:true}),closingBalanceMinor:minor(values.closing,{signed:true,zero:true})});
      }
      if(selection==='account')result=await post('accounts',{name:values.name.trim(),accountType:values.accountType,openingBalanceMinor:minor(values.opening,{signed:true,zero:true})});
      if(selection==='customer')result=await post('customers',{name:values.name.trim(),customerCode:values.code.trim()});
      if(selection==='supplier')result=await post('suppliers',{name:values.name.trim(),supplierCode:values.code.trim(),defaultExpenseCategory:values.category});
      if(selection==='invoice'||selection==='bill'){
        if(!validDate(values.issuedOn)||!validDate(values.dueOn)||values.dueOn<values.issuedOn)throw new Error('Due date must be on or after the issue date.');
        const body={issuedOn:values.issuedOn,dueOn:values.dueOn,description:values.description,totalMinor:minor(values.amount)};
        if(selection==='invoice'){body.customerId=values.customerId;body.invoiceNumber=values.number.trim()}else{body.supplierId=values.supplierId;body.payableNumber=values.number.trim();body.expenseCategory=values.category}
        result=await post(selection==='invoice'?'invoices':'payables',body);
      }
      if(selection==='income'||selection==='expense'){
        if(!validDate(values.postedOn))throw new Error('Enter a valid transaction date.');
        result=await post('imports',{accountId:values.accountId,sourceType:'manual',idempotencyKey:requestKey,rows:[{postedOn:values.postedOn,description:values.description.trim(),reference:values.reference.trim(),amountMinor:minor(values.amount)*(selection==='expense'?-1:1)}]},true);
      }
      if(selection==='import')result=await post('imports',{...preview,sourceType:'csv',idempotencyKey:requestKey},true);
      if(selection==='match'){
        if(!/^(invoices|payables)\/[^/]+$/.test(values.obligation))throw new Error('Choose an invoice or bill.');
        const [kind,id]=values.obligation.split('/');result=await post(kind+'/'+encodeURIComponent(id)+'/allocations',{transactionId:values.transactionId,amountMinor:minor(values.amount),idempotencyKey:requestKey},true);
      }
      if((selection==='income'||selection==='expense'||selection==='import')&&result?.status&&result.status!=='completed')throw new Error('The import is still processing. Review recorded transactions before repeating it.');
      if(result?.ok!==true)throw new Error('Save was not confirmed. Check the existing records before trying again.');
      form.replaceChildren();form.dataset.ready='false';preview=null;message('Saved successfully. Updating Money…','success');
      try{await globalThis.ThebeMoneyWorkspaceV307?.refresh();if(document.getElementById('moneyhub')?.dataset.moneyV307State==='unavailable')throw new Error('refresh unavailable');message('Saved successfully. Money has been refreshed.','success')}catch{message('Saved successfully. Money could not refresh; use Refresh to reload the totals.','success')}
      if(selection==='reconcile')message('Reconciliation saved: '+result.status+'. Difference '+money(result.differenceMinor)+'. Money has been refreshed.','success');
      form.append(button(selection==='reconcile'?'Run another reconciliation':'Add another record',selection),button('Review saved records','review'),button('Close','cancel'));
    }catch(error){message('Not confirmed. '+friendly(error)+' Check existing records before repeating a save after a connection error.','error')}
    finally{busy=false;panel.removeAttribute('aria-busy');for(const b of root.querySelectorAll('button'))b.disabled=false}
  }
  function mount(){
    const workspace=document.getElementById('moneyhub');if(!workspace)return;const existing=document.getElementById('moneyInputsV310');if(existing){const summary=document.getElementById('moneyWorkspaceV307');if(summary&&existing.nextElementSibling!==summary)summary.before(existing);return;}
    root=node('section',undefined,{id:'moneyInputsV310',class:'money-inputs-v310','aria-label':'Enter finance records'});root.dataset.release=RELEASE;
    const header=node('div',undefined,{class:'money-input-heading'});header.append(node('b','Enter your money records'),node('p','Start with accounts, then record money received and spent. Add invoices and bills, and link their recorded payments.'));
    const disclosure=node('details',undefined,{class:'money-input-disclosure'});disclosure.append(node('summary','Add or update money records'));
    const actions=node('div',undefined,{class:'money-input-actions'});for(const [action,label] of ACTIONS)actions.append(button(label,action));
    panel=node('div',undefined,{class:'money-input-panel'});panel.hidden=true;panel.append(node('h3'));
    status=node('p',undefined,{role:'status','aria-live':'polite',class:'money-input-status'});form=node('form');panel.append(status,form);disclosure.append(actions,panel);root.append(header,disclosure);
    const anchor=document.getElementById('moneyWorkspaceV307')||workspace.querySelector('.hub-hero');if(anchor?.id==='moneyWorkspaceV307')anchor.before(root);else if(anchor)anchor.after(root);else workspace.prepend(root);
    root.addEventListener('click',event=>{const action=event.target.closest('[data-money-input-action]')?.dataset.moneyInputAction;if(!action||busy)return;if(action==='cancel'){loadGeneration++;panel.hidden=true;form.replaceChildren();preview=null;return}void open(action)});form.addEventListener('submit',save);
  }
  function boot(){mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});globalThis.ThebeMoneyInputsV310=Object.freeze({release:RELEASE,parseCSV,minor})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
