(()=>{
  'use strict';

  const RELEASE='20261007-money-workspace-v307';
  const ROOT_ID='moneyhub';
  const MOUNT_ID='moneyWorkspaceV307';
  const API='/api/finance/summary';
  const STALE_AFTER_MS=30000;
  let lastLoadedAt=0;
  let loading=false;
  let activeRead=null;
  let observer=null;
  let scheduled=false;
  let apiClient=null;

  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const count=value=>number(value).toLocaleString('en-BW');
  const moneyMinor=value=>{
    const minor=Number(value);
    if(!Number.isFinite(minor))return '—';
    return 'P'+(minor/100).toLocaleString('en-BW',{minimumFractionDigits:0,maximumFractionDigits:2});
  };
  const formatDate=value=>{
    if(!value)return 'Not recorded';
    const raw=String(value).trim();
    const normalized=/^\d{4}-\d{2}-\d{2} /.test(raw)?raw.replace(' ','T')+'Z':raw;
    const date=new Date(normalized);
    if(!Number.isFinite(date.getTime()))return raw.slice(0,19);
    try{return new Intl.DateTimeFormat('en-BW',{timeZone:'Africa/Gaborone',dateStyle:'medium',timeStyle:'short'}).format(date)}
    catch{return date.toLocaleString()}
  };
  const formatBusinessDate=value=>{
    const raw=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw||'Not recorded';
    const date=new Date(raw+'T12:00:00+02:00');
    try{return new Intl.DateTimeFormat('en-BW',{timeZone:'Africa/Gaborone',dateStyle:'medium'}).format(date)}
    catch{return raw}
  };

  function createElement(tag,{className='',text,attrs={},dataset={}}={},children=[]){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
    for(const [name,value] of Object.entries(dataset))node.dataset[name]=String(value);
    for(const child of children)if(child)node.append(child);
    return node;
  }

  function textElement(tag,className,text){
    return createElement(tag,{className,text});
  }

  function actionButton(label,action,{alt=false}={}){
    return createElement('button',{
      className:alt?'btn alt':'btn',
      text:label,
      attrs:{type:'button'},
      dataset:{moneyV307Action:action}
    });
  }

  function emptyState(text){
    return textElement('div','money-v307-empty',text);
  }

  function rowNode(title,meta,amount){
    const copy=createElement('div',{},[
      textElement('b','',title),
      textElement('span','',meta)
    ]);
    return createElement('div',{className:'money-v307-row'},[
      copy,
      textElement('strong','',amount)
    ]);
  }

  function metricNode(label,value){
    return createElement('div',{className:'money-v307-metric'},[
      textElement('span','',label),
      textElement('b','',value)
    ]);
  }

  function statNode(label,value,detail,tone=''){
    const node=createElement('div',{className:'money-v307-stat'},[
      textElement('span','',label),
      textElement('b','',value),
      textElement('small','',detail)
    ]);
    if(tone)node.dataset.tone=tone;
    return node;
  }

  function badgeNode(text,tone=''){
    return textElement('span',`money-v307-badge${tone?` ${tone}`:''}`,text);
  }

  function detailsNode(label,...children){
    return createElement('details',{className:'money-v307-detail'},[
      textElement('summary','',label),
      ...children
    ]);
  }

  function listNode(children=[]){
    return createElement('div',{className:'money-v307-list'},children);
  }

  function laneNode(eyebrow,title,badgeText,badgeTone,description,metrics,details){
    const heading=createElement('div',{},[
      textElement('div','money-v307-eyebrow',eyebrow),
      textElement('h3','',title)
    ]);
    const head=createElement('div',{className:'money-v307-lane-head'},[
      heading,
      badgeNode(badgeText,badgeTone)
    ]);
    return createElement('article',{className:'money-v307-lane'},[
      head,
      textElement('p','',description),
      createElement('div',{className:'money-v307-metrics'},metrics),
      details
    ]);
  }

  function injectStyles(){
    if(document.getElementById('moneyWorkspaceV307Styles'))return;
    const style=document.createElement('style');
    style.id='moneyWorkspaceV307Styles';
    style.textContent=`
      #${ROOT_ID}.money-v307-ready>.outcome-status-strip,
      #${ROOT_ID}.money-v307-ready>.outcome-grid,
      #${ROOT_ID}.money-v307-ready>.notice{display:none!important}
      #${ROOT_ID}.money-v307-ready>.hub-hero>.btn{display:none!important}
      .money-v307-shell{display:grid;gap:14px;margin:0 0 18px}
      .money-v307-command{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:#fff}
      .money-v307-command-copy{min-width:0}.money-v307-command-copy b{display:block;font-size:15px;line-height:1.3}.money-v307-command-copy span{display:block;margin-top:3px;color:var(--muted,#6b7176);font-size:12.5px;line-height:1.4}
      .money-v307-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .money-v307-actions .btn{min-height:44px!important}
      .money-v307-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .money-v307-stat{min-width:0;padding:14px 15px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:#fff}
      .money-v307-stat span{display:block;color:var(--muted,#6b7176);font-size:11px;font-weight:760;letter-spacing:.045em;text-transform:uppercase}
      .money-v307-stat b{display:block;margin-top:6px;color:var(--ink,#131516);font-size:23px;line-height:1.12;letter-spacing:-.025em;overflow-wrap:anywhere}
      .money-v307-stat small{display:block;margin-top:5px;color:var(--muted,#6b7176);font-size:11.5px;line-height:1.35}
      .money-v307-stat[data-tone="risk"]{border-color:#ecd7cd;background:#fffaf7}.money-v307-stat[data-tone="warn"]{border-color:#eadfc8;background:#fffcf7}
      .money-v307-work-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .money-v307-lane{display:flex;flex-direction:column;min-width:0;padding:16px;border:1px solid var(--line,#e3e6e8);border-radius:17px;background:#fff}
      .money-v307-lane-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.money-v307-lane-head>div{min-width:0}
      .money-v307-eyebrow{color:var(--muted,#6b7176);font-size:10px;font-weight:800;letter-spacing:.075em;text-transform:uppercase}.money-v307-lane h3{margin:4px 0 5px;font-size:18px;line-height:1.18;letter-spacing:-.02em}.money-v307-lane p{margin:0;color:var(--muted,#6b7176);font-size:12.8px;line-height:1.48}
      .money-v307-badge{display:inline-flex;align-items:center;min-height:28px;padding:4px 8px;border-radius:999px;background:#eef6f2;color:#22684d;font-size:10.5px;font-weight:800;white-space:nowrap}.money-v307-badge.risk{background:#fdecea;color:#9b3b32}.money-v307-badge.warn{background:#fff3dc;color:#8a5a08}.money-v307-badge.unavailable{background:#f1f3f4;color:#646b70}
      .money-v307-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:13px 0}.money-v307-metric{padding:10px;border-radius:12px;background:#f7f9f8;border:1px solid #e8ece9;min-width:0}.money-v307-metric span{display:block;color:var(--muted,#6b7176);font-size:10.5px;line-height:1.25}.money-v307-metric b{display:block;margin-top:4px;font-size:15px;line-height:1.2;overflow-wrap:anywhere}
      .money-v307-detail{margin-top:auto;border-top:1px solid var(--line,#e3e6e8);padding-top:10px}.money-v307-detail>summary{cursor:pointer;list-style:none;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:760}.money-v307-detail>summary::-webkit-details-marker{display:none}.money-v307-detail>summary:after{content:'+';font-size:17px;color:var(--muted,#6b7176)}.money-v307-detail[open]>summary:after{content:'−'}
      .money-v307-list{display:grid;gap:7px;padding:4px 0}.money-v307-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;padding:9px 0;border-top:1px solid #edf0ee}.money-v307-row:first-child{border-top:0}.money-v307-row b{display:block;font-size:12.5px;line-height:1.3;overflow-wrap:anywhere}.money-v307-row span{display:block;margin-top:2px;color:var(--muted,#6b7176);font-size:11.5px;line-height:1.35}.money-v307-row>strong{font-size:12.5px;text-align:right;white-space:nowrap}.money-v307-empty{padding:10px 0;color:var(--muted,#6b7176);font-size:12px;line-height:1.45}
      .money-v307-source{padding:11px 12px;border:1px solid #dfe5e1;border-radius:12px;background:#fafbfa;color:var(--muted,#6b7176);font-size:11.7px;line-height:1.5}.money-v307-source b{color:var(--ink,#131516)}
      .money-v307-unavailable{padding:17px;border:1px solid #ead4cf;border-radius:15px;background:#fff9f7}.money-v307-unavailable b{display:block;font-size:15px}.money-v307-unavailable p{margin:5px 0 12px;color:var(--muted,#6b7176);font-size:12.5px;line-height:1.5}
      .money-v307-shell button:focus-visible,.money-v307-shell summary:focus-visible{outline:3px solid rgba(11,102,214,.28);outline-offset:2px}
      @media(max-width:1050px){.money-v307-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.money-v307-work-grid{grid-template-columns:1fr}}
      @media(max-width:620px){.money-v307-shell{gap:10px}.money-v307-command{display:block;padding:12px}.money-v307-actions{display:grid;grid-template-columns:1fr 1fr;margin-top:10px}.money-v307-actions .btn{width:100%}.money-v307-status-grid{grid-template-columns:1fr 1fr;gap:8px}.money-v307-stat{padding:12px}.money-v307-stat b{font-size:20px}.money-v307-lane{padding:13px}.money-v307-metrics{grid-template-columns:1fr 1fr}.money-v307-detail>summary{min-height:48px}}
      @media(max-width:390px){.money-v307-status-grid,.money-v307-actions,.money-v307-metrics{grid-template-columns:1fr}}
      @media(forced-colors:active){.money-v307-stat,.money-v307-lane,.money-v307-command,.money-v307-source,.money-v307-metric{border:1px solid CanvasText}.money-v307-shell button:focus-visible,.money-v307-shell summary:focus-visible{outline:2px solid Highlight}}
    `;
    document.head.appendChild(style);
  }

  function mount(root){
    if(!root||document.getElementById(MOUNT_ID))return document.getElementById(MOUNT_ID);
    injectStyles();
    const node=createElement('section',{
      className:'money-v307-shell',
      attrs:{id:MOUNT_ID,'aria-label':'Money workspace'},
      dataset:{release:RELEASE}
    });
    const freshness=createElement('span',{
      text:'Open Money to load the canonical finance ledger.',
      attrs:{id:'moneyV307Freshness',role:'status','aria-live':'polite'}
    });
    const commandCopy=createElement('div',{className:'money-v307-command-copy'},[
      textElement('b','','Confirmed money position'),
      freshness
    ]);
    const actions=createElement('div',{className:'money-v307-actions'},[
      actionButton('Refresh money','refresh'),
      actionButton('Explain with Thebe','explain',{alt:true})
    ]);
    const command=createElement('div',{className:'money-v307-command'},[commandCopy,actions]);
    const body=createElement('div',{attrs:{id:'moneyV307Body'}},[
      emptyState('Open Money to load the finance workspace.')
    ]);
    node.append(command,body);
    const hero=root.querySelector('.hub-hero');
    if(hero)hero.insertAdjacentElement('afterend',node);else root.prepend(node);
    root.classList.add('money-v307-ready');
    return node;
  }

  function financeApiClient(){
    if(apiClient)return apiClient;
    const createClient=globalThis.BW?.api?.createClient;
    if(typeof createClient!=='function')throw new Error('finance_api_client_unavailable');
    apiClient=createClient();
    return apiClient;
  }

  async function getSummary(){
    const body=await financeApiClient().request(API,{method:'GET'});
    if(!body||body.authority?.canonical!==true)throw new Error('finance_summary_not_canonical');
    return body;
  }

  function topReceivableRows(receivables){
    const rows=Array.isArray(receivables?.customers)?receivables.customers:[];
    if(!rows.length)return [emptyState('No outstanding customer balance is returned by the canonical invoice ledger.')];
    return rows.slice(0,5).map(row=>rowNode(
      row.customerName||'Customer',
      `${count(row.outstandingInvoiceCount)} open · ${count(row.overdueInvoiceCount)} overdue${row.earliestDueOn?` · earliest ${row.earliestDueOn}`:''}`,
      moneyMinor(row.outstandingMinor)
    ));
  }

  function topPayableRows(payables){
    if(payables?.available===false)return [emptyState('Supplier payables are unavailable. Do not treat this as a zero balance.')];
    const rows=Array.isArray(payables?.suppliers)?payables.suppliers:[];
    if(!rows.length)return [emptyState('No outstanding supplier payable is returned by the canonical payable ledger.')];
    return rows.slice(0,5).map(row=>rowNode(
      row.supplierName||'Supplier',
      `${count(row.outstandingPayableCount)} open · ${count(row.overduePayableCount)} overdue${row.earliestDueOn?` · earliest ${row.earliestDueOn}`:''}`,
      moneyMinor(row.outstandingMinor)
    ));
  }

  function invoiceRows(receivables){
    const rows=Array.isArray(receivables?.invoices)?receivables.invoices:[];
    if(!rows.length)return null;
    return listNode(rows.slice(0,5).map(row=>rowNode(
      `${row.invoiceNumber||'Invoice'} · ${row.customerName||'Customer'}`,
      `${row.overdue?'Overdue':'Due'} ${row.dueOn||'date not recorded'}`,
      moneyMinor(row.outstandingMinor)
    )));
  }

  function payableRows(payables){
    if(payables?.available===false)return null;
    const rows=Array.isArray(payables?.payables)?payables.payables:[];
    if(!rows.length)return null;
    return listNode(rows.slice(0,5).map(row=>rowNode(
      `${row.payableNumber||'Payable'} · ${row.supplierName||'Supplier'}`,
      `${row.overdue?'Overdue':'Due'} ${row.dueOn||'date not recorded'}${row.expenseCategory?` · ${String(row.expenseCategory).replaceAll('_',' ')}`:''}`,
      moneyMinor(row.outstandingMinor)
    )));
  }

  function accountRows(accounts){
    if(!accounts.length)return [emptyState('No active Finance Core account is returned.')];
    return accounts.slice(0,8).map(account=>rowNode(
      account.name||'Finance account',
      `${String(account.account_type||'account').replaceAll('_',' ')} · ${count(account.transaction_count)} transaction${number(account.transaction_count)===1?'':'s'}`,
      moneyMinor(account.balance_minor)
    ));
  }

  function sourceBoundary(){
    const source=createElement('div',{className:'money-v307-source'});
    source.append(
      textElement('b','','Canonical boundary:'),
      document.createTextNode(' Cash comes from Finance Core; customer balances come from issued invoices plus transaction allocations; supplier balances come from recorded payables plus allocations. This summary is read-only and provider-neutral. Use the money record forms to enter confirmed data. Missing or unavailable source data is never presented as a zero balance.')
    );
    return source;
  }

  function render(summary){
    const root=document.getElementById(ROOT_ID),body=document.getElementById('moneyV307Body'),fresh=document.getElementById('moneyV307Freshness');
    if(!root||!body||!fresh)return;
    const accounts=Array.isArray(summary.accounts)?summary.accounts:[];
    const recon=summary.reconciliation||{};
    const receivables=summary.receivables||{};
    const payables=summary.payables||{};
    const payablesAvailable=payables.available!==false;
    const reconCount=number(recon.unresolvedCount),reconExposure=number(recon.unresolvedExposureMinor);
    const overdueReceivables=number(receivables.overdueInvoiceCount),overdueReceivableMinor=number(receivables.overdueMinor);
    const overduePayables=payablesAvailable?number(payables.overduePayableCount):null;
    const lastImport=summary.imports?.lastImportAt||null,lastReconciliation=recon.lastRun?.created_at||null;
    const freshnessParts=[];
    if(lastImport)freshnessParts.push(`Last confirmed import ${formatDate(lastImport)}`);else freshnessParts.push('No completed import timestamp recorded');
    if(lastReconciliation)freshnessParts.push(`last reconciliation ${formatDate(lastReconciliation)}`);
    if(receivables.businessDate)freshnessParts.push(`ledger date ${formatBusinessDate(receivables.businessDate)}`);
    fresh.textContent=freshnessParts.join(' · ');

    const payablesStat=payablesAvailable?moneyMinor(payables.outstandingMinor):'Unavailable';
    const payableTone=payablesAvailable&&number(payables.overduePayableCount)>0?'risk':payablesAvailable&&number(payables.due7dMinor)>0?'warn':'';
    const statusGrid=createElement('div',{
      className:'money-v307-status-grid',
      attrs:{'aria-label':'Confirmed finance status'}
    },[
      statNode('Cash position',moneyMinor(summary.cashPositionMinor),`${count(accounts.length)} active finance account${accounts.length===1?'':'s'}`),
      statNode('Customers owe',moneyMinor(receivables.outstandingMinor),`${count(overdueReceivables)} overdue · ${moneyMinor(overdueReceivableMinor)}`,overdueReceivables>0?'risk':''),
      statNode('Bills to pay',payablesStat,payablesAvailable?`${count(payables.outstandingPayableCount)} open · ${count(payables.overduePayableCount)} overdue`:'Payable ledger could not be confirmed',payableTone),
      statNode('Reconciliation',count(reconCount),reconCount?`${moneyMinor(reconExposure)} unresolved exposure`:recon.stale?'Last reconciliation is stale':'No unresolved exception returned',reconCount>0?'risk':recon.stale?'warn':'')
    ]);

    const cashDetails=detailsNode('Finance source details',listNode(accountRows(accounts)));
    const cashLane=laneNode(
      'Cash control',
      'Reconcile cash',
      reconCount>0?`${count(reconCount)} exception${reconCount===1?'':'s'}`:recon.stale?'Review freshness':'Current',
      reconCount>0?'risk':recon.stale?'warn':'',
      'Start from the canonical ledger and unresolved reconciliation runs before asking AI to interpret the position.',
      [
        metricNode('Cash position',moneyMinor(summary.cashPositionMinor)),
        metricNode('Exception exposure',moneyMinor(reconExposure)),
        metricNode('Completed imports',count(summary.imports?.count)),
        metricNode('Imported transactions',count(summary.imports?.transactions))
      ],
      cashDetails
    );

    const receivableDetailsChildren=[listNode(topReceivableRows(receivables))];
    const invoiceList=invoiceRows(receivables);if(invoiceList)receivableDetailsChildren.push(invoiceList);
    const collectionsLane=laneNode(
      'Collections',
      'Collect customer money',
      overdueReceivables>0?`${count(overdueReceivables)} overdue`:'No overdue invoice',
      overdueReceivables>0?'risk':'',
      'Work the customer balances and due dates first. Thebe can explain priorities after the ledger is visible.',
      [
        metricNode('Outstanding',moneyMinor(receivables.outstandingMinor)),
        metricNode('Overdue',moneyMinor(overdueReceivableMinor)),
        metricNode('Due in 7 days',moneyMinor(receivables.due7dMinor)),
        metricNode('Customers overdue',count(receivables.overdueCustomerCount))
      ],
      detailsNode('Customers & invoices',...receivableDetailsChildren)
    );

    const payableDetailsChildren=[listNode(topPayableRows(payables))];
    const payableList=payableRows(payables);if(payableList)payableDetailsChildren.push(payableList);
    const payableBadgeTone=!payablesAvailable?'unavailable':overduePayables>0?'risk':number(payables.due7dMinor)>0?'warn':'';
    const payablesLane=laneNode(
      'Payables',
      'Pay suppliers deliberately',
      !payablesAvailable?'Unavailable':overduePayables>0?`${count(overduePayables)} overdue`:number(payables.due7dMinor)>0?'Due soon':'No overdue payable',
      payableBadgeTone,
      'See recorded supplier obligations alongside cash and collections. This view never moves money or marks a bill paid.',
      [
        metricNode('Outstanding',payablesAvailable?moneyMinor(payables.outstandingMinor):'—'),
        metricNode('Overdue',payablesAvailable?moneyMinor(payables.overdueMinor):'—'),
        metricNode('Due in 7 days',payablesAvailable?moneyMinor(payables.due7dMinor):'—'),
        metricNode('Suppliers',payablesAvailable?count(payables.supplierCount):'—')
      ],
      detailsNode('Suppliers & bills',...payableDetailsChildren)
    );

    const workGrid=createElement('div',{
      className:'money-v307-work-grid',
      attrs:{'aria-label':'Money work'}
    },[cashLane,collectionsLane,payablesLane]);

    body.replaceChildren(statusGrid,workGrid,sourceBoundary());
    root.dataset.moneyV307State='ready';
    delete root.dataset.moneyV307Error;
    lastLoadedAt=Date.now();
  }

  function renderUnavailable(error){
    const root=document.getElementById(ROOT_ID),body=document.getElementById('moneyV307Body'),fresh=document.getElementById('moneyV307Freshness');
    if(!root||!body||!fresh)return;
    fresh.textContent='Canonical finance data could not be confirmed.';
    const unavailable=createElement('div',{className:'money-v307-unavailable'},[
      textElement('b','','Money workspace unavailable'),
      textElement('p','','The canonical finance summary could not be confirmed. Do not interpret missing cash, receivables, payables or reconciliation figures as zero.'),
      actionButton('Retry finance data','refresh',{alt:true})
    ]);
    body.replaceChildren(unavailable);
    root.dataset.moneyV307State='unavailable';
    root.dataset.moneyV307Error=String(error?.message||error||'finance_unavailable').slice(0,120);
  }

  async function refresh({force=false}={}){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    const mountNode=mount(root);if(!mountNode)return;
    if(!root.classList.contains('active')&&!force)return;
    if(loading){if(force){try{await activeRead}catch{}return refresh({force:true})}return;}
    if(!force&&lastLoadedAt&&Date.now()-lastLoadedAt<STALE_AFTER_MS)return;
    loading=true;root.dataset.moneyV307State='loading';
    const fresh=document.getElementById('moneyV307Freshness');if(fresh)fresh.textContent='Checking canonical Finance Core…';
    activeRead=getSummary();
    try{render(await activeRead)}catch(error){renderUnavailable(error)}finally{loading=false}
  }

  function explain(){
    const prompt='Explain our current canonical money position using the visible Finance Core figures: cash, unresolved reconciliation exceptions, overdue receivables, upcoming collections, outstanding payables and supplier due dates. Distinguish confirmed ledger facts from interpretation. Do not invent balances, market data or payment status.';
    if(typeof globalThis.openThebeFromHome==='function'){globalThis.openThebeFromHome(prompt);return}
    const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');
    if(dock&&dock.hidden&&pill&&!pill.hidden)pill.click();
  }

  function onClick(event){
    const button=event.target?.closest?.('[data-money-v307-action]');if(!button)return;
    const action=button.dataset.moneyV307Action;
    if(action==='refresh')refresh({force:true});
    if(action==='explain')explain();
  }

  function schedule(){
    if(scheduled)return;scheduled=true;
    queueMicrotask(()=>{scheduled=false;const root=document.getElementById(ROOT_ID);if(!root)return;mount(root);if(root.classList.contains('active'))refresh()});
  }

  function start(){
    document.addEventListener('click',onClick);
    schedule();
    observer=new MutationObserver(schedule);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','data-lazy-view']});
    globalThis.ThebeMoneyWorkspaceV307=Object.freeze({release:RELEASE,refresh:()=>refresh({force:true}),state:()=>({release:RELEASE,loadedAt:lastLoadedAt,loading,viewState:document.getElementById(ROOT_ID)?.dataset.moneyV307State||'unmounted'})});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
