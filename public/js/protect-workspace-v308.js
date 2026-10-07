(()=>{
  'use strict';

  const RELEASE='20261007-protect-workspace-v308';
  const ROOT_ID='protecthub';
  const MOUNT_ID='protectWorkspaceV308';
  const STALE_AFTER_MS=30000;
  const ENDPOINTS=Object.freeze({
    obligations:'/api/obligations',
    calendar:'/api/statutory-calendar',
    actions:'/api/next-actions'
  });
  let lastLoadedAt=0;
  let loading=false;
  let observer=null;
  let scheduled=false;
  let apiClient=null;

  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const count=value=>number(value).toLocaleString('en-BW');
  const list=value=>Array.isArray(value)?value:[];
  const openStatuses=new Set(['open','in_progress','review','blocked']);
  const doneStatuses=new Set(['completed','closed','cancelled','not_applicable']);

  function createElement(tag,{className='',text,attrs={},dataset={}}={},children=[]){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
    for(const [name,value] of Object.entries(dataset))node.dataset[name]=String(value);
    for(const child of children)if(child)node.append(child);
    return node;
  }

  function textElement(tag,className,text){return createElement(tag,{className,text})}

  function actionButton(label,action,{alt=false}={}){
    return createElement('button',{
      className:alt?'btn alt':'btn',
      text:label,
      attrs:{type:'button'},
      dataset:{protectV308Action:action}
    });
  }

  function injectStyles(){
    if(document.getElementById('protectWorkspaceV308Styles'))return;
    const style=document.createElement('style');
    style.id='protectWorkspaceV308Styles';
    style.textContent=`
      #${ROOT_ID}.protect-v308-ready>.outcome-status-strip,
      #${ROOT_ID}.protect-v308-ready>.outcome-grid,
      #${ROOT_ID}.protect-v308-ready>.notice{display:none!important}
      #${ROOT_ID}.protect-v308-ready>.hub-hero>.btn{display:none!important}
      .protect-v308-shell{display:grid;gap:12px;margin:0 0 18px}
      .protect-v308-command{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:#fff}
      .protect-v308-command-copy{min-width:0}.protect-v308-command-copy b{display:block;font-size:15px;line-height:1.3}.protect-v308-command-copy span{display:block;margin-top:3px;color:var(--muted,#6b7176);font-size:12.5px;line-height:1.4}
      .protect-v308-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.protect-v308-actions .btn{min-height:44px!important}
      .protect-v308-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .protect-v308-stat{min-width:0;padding:13px 14px;border:1px solid var(--line,#e3e6e8);border-radius:14px;background:#fff}
      .protect-v308-stat span{display:block;color:var(--muted,#6b7176);font-size:10.5px;font-weight:780;letter-spacing:.05em;text-transform:uppercase}.protect-v308-stat b{display:block;margin-top:5px;font-size:22px;line-height:1.1;letter-spacing:-.025em}.protect-v308-stat small{display:block;margin-top:5px;color:var(--muted,#6b7176);font-size:11.5px;line-height:1.35}
      .protect-v308-stat[data-tone="risk"]{border-color:#ecd7cd;background:#fffaf7}.protect-v308-stat[data-tone="warn"]{border-color:#eadfc8;background:#fffcf7}.protect-v308-stat[data-tone="unknown"]{border-style:dashed}
      .protect-v308-work-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
      .protect-v308-lane{display:flex;flex-direction:column;min-width:0;padding:15px;border:1px solid var(--line,#e3e6e8);border-radius:16px;background:#fff}
      .protect-v308-lane-head{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.protect-v308-lane-head>div{min-width:0}.protect-v308-eyebrow{color:var(--muted,#6b7176);font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.protect-v308-lane h3{margin:4px 0 5px;font-size:17px;line-height:1.2;letter-spacing:-.018em}.protect-v308-lane p{margin:0;color:var(--muted,#6b7176);font-size:12.5px;line-height:1.48}
      .protect-v308-badge{display:inline-flex;align-items:center;min-height:28px;padding:4px 8px;border-radius:999px;background:#eef6f2;color:#22684d;font-size:10.5px;font-weight:800;white-space:nowrap}.protect-v308-badge.risk{background:#fdecea;color:#9b3b32}.protect-v308-badge.warn{background:#fff3dc;color:#8a5a08}.protect-v308-badge.unknown{background:#f1f3f4;color:#646b70}
      .protect-v308-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.protect-v308-metric{padding:10px;border-radius:11px;background:#f7f9f8;border:1px solid #e8ece9;min-width:0}.protect-v308-metric span{display:block;color:var(--muted,#6b7176);font-size:10px;line-height:1.25}.protect-v308-metric b{display:block;margin-top:4px;font-size:14.5px;line-height:1.2;overflow-wrap:anywhere}
      .protect-v308-list{display:grid;gap:0;margin-top:auto;border-top:1px solid var(--line,#e3e6e8);padding-top:7px}.protect-v308-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:8px 0;border-top:1px solid #edf0ee}.protect-v308-row:first-child{border-top:0}.protect-v308-row b{display:block;font-size:12px;line-height:1.32;overflow-wrap:anywhere}.protect-v308-row span{display:block;margin-top:2px;color:var(--muted,#6b7176);font-size:11px;line-height:1.35}.protect-v308-row strong{font-size:11.5px;text-align:right;white-space:nowrap}
      .protect-v308-lane>.btn{align-self:flex-start;min-height:44px!important;margin-top:10px}.protect-v308-boundary{padding:11px 12px;border:1px solid #dfe5e1;border-radius:12px;background:#fafbfa;color:var(--muted,#6b7176);font-size:11.7px;line-height:1.5}.protect-v308-boundary b{color:var(--ink,#131516)}
      .protect-v308-unavailable{padding:16px;border:1px solid #ead4cf;border-radius:15px;background:#fff9f7}.protect-v308-unavailable b{display:block;font-size:15px}.protect-v308-unavailable p{margin:5px 0 12px;color:var(--muted,#6b7176);font-size:12.5px;line-height:1.5}
      .protect-v308-shell button:focus-visible{outline:3px solid rgba(11,102,214,.28);outline-offset:2px}
      @media(max-width:1050px){.protect-v308-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.protect-v308-work-grid{grid-template-columns:1fr}}
      @media(max-width:620px){.protect-v308-shell{gap:9px}.protect-v308-command{display:block;padding:12px}.protect-v308-actions{display:grid;grid-template-columns:1fr 1fr;margin-top:10px}.protect-v308-actions .btn{width:100%}.protect-v308-status-grid{grid-template-columns:1fr 1fr;gap:8px}.protect-v308-stat{padding:12px}.protect-v308-stat b{font-size:20px}.protect-v308-lane{padding:13px}.protect-v308-lane>.btn{width:100%}}
      @media(max-width:390px){.protect-v308-status-grid,.protect-v308-actions,.protect-v308-metrics{grid-template-columns:1fr}}
      @media(forced-colors:active){.protect-v308-stat,.protect-v308-lane,.protect-v308-command,.protect-v308-boundary,.protect-v308-metric{border:1px solid CanvasText}.protect-v308-shell button:focus-visible{outline:2px solid Highlight}}
    `;
    document.head.appendChild(style);
  }

  function mount(root){
    if(!root||document.getElementById(MOUNT_ID))return document.getElementById(MOUNT_ID);
    injectStyles();
    const node=createElement('section',{className:'protect-v308-shell',attrs:{id:MOUNT_ID,'aria-label':'Protect workspace'},dataset:{release:RELEASE}});
    const freshness=createElement('span',{text:'Open Protect to confirm current compliance work.',attrs:{id:'protectV308Freshness',role:'status','aria-live':'polite'}});
    const command=createElement('div',{className:'protect-v308-command'},[
      createElement('div',{className:'protect-v308-command-copy'},[textElement('b','','Protection position'),freshness]),
      createElement('div',{className:'protect-v308-actions'},[
        actionButton('Refresh protection','refresh'),
        actionButton('Explain with Thebe','explain',{alt:true})
      ])
    ]);
    const body=createElement('div',{attrs:{id:'protectV308Body'}},[textElement('div','protect-v308-unavailable','Open Protect to load current obligations, filing dates and proof gaps.')]);
    node.append(command,body);
    const hero=root.querySelector('.hub-hero');
    if(hero)hero.insertAdjacentElement('afterend',node);else root.prepend(node);
    root.classList.add('protect-v308-ready');
    return node;
  }

  function client(){
    if(apiClient)return apiClient;
    const createClient=globalThis.BW?.api?.createClient;
    if(typeof createClient!=='function')throw new Error('protect_api_client_unavailable');
    apiClient=createClient();
    return apiClient;
  }

  async function read(path){return client().request(path,{method:'GET'})}

  async function loadProtection(){
    const entries=Object.entries(ENDPOINTS);
    const settled=await Promise.allSettled(entries.map(([,path])=>read(path)));
    const data={},errors={};
    settled.forEach((result,index)=>{
      const key=entries[index][0];
      if(result.status==='fulfilled')data[key]=result.value||{};else errors[key]=String(result.reason?.message||result.reason||'unavailable');
    });
    if(Object.keys(data).length===0)throw new Error('protect_sources_unavailable');
    return {data,errors};
  }

  function dateOnly(value){
    const raw=String(value||'').trim();
    const match=raw.match(/^\d{4}-\d{2}-\d{2}/);return match?match[0]:'';
  }

  function businessDate(value){
    const raw=dateOnly(value);if(!raw)return 'Date not recorded';
    const date=new Date(raw+'T12:00:00+02:00');
    try{return new Intl.DateTimeFormat('en-BW',{timeZone:'Africa/Gaborone',dateStyle:'medium'}).format(date)}catch{return raw}
  }

  function daysUntil(value){
    const raw=dateOnly(value);if(!raw)return null;
    const due=new Date(raw+'T23:59:59+02:00').getTime();
    if(!Number.isFinite(due))return null;
    return Math.ceil((due-Date.now())/86400000);
  }

  function statNode(label,value,detail,tone=''){
    const node=createElement('div',{className:'protect-v308-stat'},[textElement('span','',label),textElement('b','',value),textElement('small','',detail)]);
    if(tone)node.dataset.tone=tone;return node;
  }

  function metricNode(label,value){return createElement('div',{className:'protect-v308-metric'},[textElement('span','',label),textElement('b','',value)])}
  function badgeNode(text,tone=''){return textElement('span',`protect-v308-badge${tone?` ${tone}`:''}`,text)}
  function rowNode(title,meta,right=''){
    return createElement('div',{className:'protect-v308-row'},[
      createElement('div',{},[textElement('b','',title),textElement('span','',meta)]),
      textElement('strong','',right)
    ]);
  }

  function laneNode(eyebrow,title,badgeText,badgeTone,description,metrics,rows,actionLabel,action){
    return createElement('article',{className:'protect-v308-lane'},[
      createElement('div',{className:'protect-v308-lane-head'},[
        createElement('div',{},[textElement('div','protect-v308-eyebrow',eyebrow),textElement('h3','',title)]),
        badgeNode(badgeText,badgeTone)
      ]),
      textElement('p','',description),
      createElement('div',{className:'protect-v308-metrics'},metrics),
      createElement('div',{className:'protect-v308-list'},rows.length?rows:[rowNode('Nothing current returned','This is not a legal all-clear. Keep source data and future dates under review.','—')]),
      actionButton(actionLabel,action,{alt:true})
    ]);
  }

  function summarizeObligations(payload,unavailable){
    if(unavailable)return {available:false,items:[],open:0,blocked:0,overdue:0,review:0};
    const items=list(payload?.items),active=items.filter(item=>openStatuses.has(String(item?.status||'')));
    const overdue=active.filter(item=>{const days=daysUntil(item?.due_at||item?.dueAt);return days!==null&&days<0});
    return {available:true,items:active,open:active.length,blocked:active.filter(x=>x.status==='blocked').length,overdue:overdue.length,review:active.filter(x=>x.status==='review').length};
  }

  function summarizeCalendar(payload,unavailable){
    if(unavailable)return {available:false,items:[],upcoming:0,due30:0,overdue:0,setup:0,next:null};
    const items=list(payload?.obligations).filter(x=>dateOnly(x?.due_at));
    const active=items.filter(x=>!doneStatuses.has(String(x?.status||'')));
    const sorted=[...active].sort((a,b)=>String(a.due_at||'').localeCompare(String(b.due_at||'')));
    const due30=sorted.filter(x=>{const d=daysUntil(x.due_at);return d!==null&&d>=0&&d<=30});
    const overdue=sorted.filter(x=>{const d=daysUntil(x.due_at);return d!==null&&d<0});
    const setup=list(payload?.schedules).filter(x=>x?.config_status==='needs_input');
    return {available:true,items:sorted,upcoming:sorted.length,due30:due30.length,overdue:overdue.length,setup:setup.length,next:sorted[0]||null};
  }

  function summarizeProof(payload,unavailable){
    if(unavailable)return {available:false,items:[],actions:0,missing:0,total:0};
    const items=list(payload?.items).filter(x=>x?.source==='regulatory'&&number(x?.proofMissing)>0);
    return {available:true,items,actions:items.length,missing:items.reduce((sum,x)=>sum+number(x.proofMissing),0),total:items.reduce((sum,x)=>sum+number(x.proofTotal),0)};
  }

  function toneForRisk(value){return value>0?'risk':''}

  function render(result){
    const root=document.getElementById(ROOT_ID),body=document.getElementById('protectV308Body'),fresh=document.getElementById('protectV308Freshness');
    if(!root||!body||!fresh)return;
    const errors=result.errors||{};
    const obligations=summarizeObligations(result.data.obligations,!!errors.obligations);
    const calendar=summarizeCalendar(result.data.calendar,!!errors.calendar);
    const proof=summarizeProof(result.data.actions,!!errors.actions);
    const unavailableCount=Object.keys(errors).length;
    fresh.textContent=unavailableCount?`${3-unavailableCount} of 3 protection sources confirmed · unavailable sources are shown as unknown`:`Obligations, statutory dates and proof actions confirmed now`;

    const statusGrid=createElement('div',{className:'protect-v308-status-grid',attrs:{'aria-label':'Protection status'}},[
      statNode('Open actions',obligations.available?count(obligations.open):'Unknown',obligations.available?`${count(obligations.overdue)} overdue · ${count(obligations.blocked)} blocked`:'Obligation source unavailable',obligations.available?toneForRisk(obligations.overdue+obligations.blocked):'unknown'),
      statNode('Filing dates',calendar.available?count(calendar.upcoming):'Unknown',calendar.available?`${count(calendar.due30)} due within 30 days · ${count(calendar.overdue)} overdue`:'Statutory calendar unavailable',calendar.available?toneForRisk(calendar.overdue):'unknown'),
      statNode('Proof gaps',proof.available?count(proof.missing):'Unknown',proof.available?`${count(proof.actions)} regulatory action${proof.actions===1?'':'s'} affected`:'Proof action queue unavailable',proof.available?toneForRisk(proof.missing):'unknown'),
      statNode('Setup gaps',calendar.available?count(calendar.setup):'Unknown',calendar.available?(calendar.setup?'Schedule inputs still required':'No current schedule setup gap returned'):'Schedule configuration unavailable',calendar.available&&calendar.setup?'warn':calendar.available?'':'unknown')
    ]);

    const obligationRows=obligations.available?obligations.items.slice(0,4).map(item=>{
      const due=item?.due_at||item?.dueAt;const d=daysUntil(due);const meta=[String(item?.area||item?.authority||'Compliance'),String(item?.status||'open').replaceAll('_',' ')];if(due)meta.push(`due ${businessDate(due)}`);
      return rowNode(item?.title||item?.rule_title||'Compliance action',meta.join(' · '),d===null?'':d<0?`${Math.abs(d)}d late`:d===0?'Today':`${d}d`);
    }):[rowNode('Obligations unavailable','Do not assume there are no open compliance actions.','Unknown')];

    const calendarRows=calendar.available?calendar.items.slice(0,4).map(item=>{
      const d=daysUntil(item.due_at);return rowNode(item?.title||item?.rule_title||'Statutory deadline',`${item?.rule_title&&item?.title!==item.rule_title?item.rule_title+' · ':''}due ${businessDate(item.due_at)}`,d===null?'':d<0?`${Math.abs(d)}d late`:d===0?'Today':`${d}d`);
    }):[rowNode('Calendar unavailable','Do not infer that filing dates are clear.','Unknown')];

    const proofRows=proof.available?proof.items.slice(0,4).map(item=>rowNode(String(item?.title||'Compliance proof action').replace(/^Compliance:\s*/i,''),`${count(item?.proofMissing)} mandatory proof requirement${number(item?.proofMissing)===1?'':'s'} open`,`${count(Math.max(0,number(item?.proofTotal)-number(item?.proofMissing)))}/${count(item?.proofTotal)}`)):[rowNode('Proof queue unavailable','Do not treat missing proof data as proof complete.','Unknown')];

    const workGrid=createElement('div',{className:'protect-v308-work-grid',attrs:{'aria-label':'Protection work'}},[
      laneNode('Compliance work','Fix action gaps',obligations.available?(obligations.open?`${count(obligations.open)} open`:'No open action returned'):'Unknown',obligations.available?toneForRisk(obligations.overdue+obligations.blocked):'unknown','Work existing obligations and blocked items before relying on an AI interpretation.',[
        metricNode('Overdue',obligations.available?count(obligations.overdue):'—'),metricNode('Blocked',obligations.available?count(obligations.blocked):'—'),metricNode('In review',obligations.available?count(obligations.review):'—'),metricNode('Open total',obligations.available?count(obligations.open):'—')
      ],obligationRows,'Open compliance actions','obligations'),
      laneNode('Statutory calendar','Meet filing dates',calendar.available?(calendar.overdue?`${count(calendar.overdue)} overdue`:calendar.due30?`${count(calendar.due30)} due soon`:'No near-term date returned'):'Unknown',calendar.available?(calendar.overdue?'risk':calendar.due30?'warn':''):'unknown','Use generated statutory dates and close missing schedule inputs. An empty current list is not a permanent filing all-clear.',[
        metricNode('Due in 30 days',calendar.available?count(calendar.due30):'—'),metricNode('Overdue',calendar.available?count(calendar.overdue):'—'),metricNode('Setup gaps',calendar.available?count(calendar.setup):'—'),metricNode('Next date',calendar.available&&calendar.next?businessDate(calendar.next.due_at):'—')
      ],calendarRows,'Open filing deadlines','statutorycalendar'),
      laneNode('Evidence','Close proof gaps',proof.available?(proof.missing?`${count(proof.missing)} missing`:'No gap returned'):'Unknown',proof.available?toneForRisk(proof.missing):'unknown','Start from mandatory proof requirements already attached to regulatory actions instead of searching the whole document library.',[
        metricNode('Missing proof',proof.available?count(proof.missing):'—'),metricNode('Actions affected',proof.available?count(proof.actions):'—'),metricNode('Requirements total',proof.available?count(proof.total):'—'),metricNode('Verified/other',proof.available?count(Math.max(0,proof.total-proof.missing)):'—')
      ],proofRows,'Open documents & proof','evidencehub')
    ]);

    const boundary=createElement('div',{className:'protect-v308-boundary'});
    boundary.append(textElement('b','','Decision boundary:'),document.createTextNode(' Protect is a read-only operational view over existing obligations, statutory schedules and regulatory proof actions. It does not declare legal compliance, file returns, approve evidence or change an obligation. Unknown source state remains unknown.'));
    body.replaceChildren(statusGrid,workGrid,boundary);
    root.dataset.protectV308State=unavailableCount?'degraded':'ready';
    if(unavailableCount)root.dataset.protectV308Unavailable=Object.keys(errors).join(',');else delete root.dataset.protectV308Unavailable;
    lastLoadedAt=Date.now();
  }

  function renderUnavailable(error){
    const root=document.getElementById(ROOT_ID),body=document.getElementById('protectV308Body'),fresh=document.getElementById('protectV308Freshness');if(!root||!body||!fresh)return;
    fresh.textContent='Protection sources could not be confirmed.';
    body.replaceChildren(createElement('div',{className:'protect-v308-unavailable'},[
      textElement('b','','Protect workspace unavailable'),
      textElement('p','','Thebe Desk could not confirm obligations, filing dates or proof actions. Do not interpret this state as compliant, current or complete.'),
      actionButton('Retry protection data','refresh',{alt:true})
    ]));
    root.dataset.protectV308State='unavailable';root.dataset.protectV308Error=String(error?.message||error||'protect_unavailable').slice(0,120);
  }

  async function refresh({force=false}={}){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    if(!mount(root))return;
    if(!root.classList.contains('active')&&!force)return;
    if(loading)return;
    if(!force&&lastLoadedAt&&Date.now()-lastLoadedAt<STALE_AFTER_MS)return;
    loading=true;root.dataset.protectV308State='loading';
    const fresh=document.getElementById('protectV308Freshness');if(fresh)fresh.textContent='Confirming obligations, dates and proof actions…';
    try{render(await loadProtection())}catch(error){renderUnavailable(error)}finally{loading=false}
  }

  function navigate(view){
    if(typeof globalThis.showView==='function'){globalThis.showView(view);return true}
    const button=document.querySelector(`[data-view="${CSS.escape(view)}"]`);if(button){button.click();return true}return false;
  }

  function explain(){
    const prompt='Explain the current Protect workspace using only the visible confirmed obligations, statutory filing dates, schedule setup gaps and regulatory proof requirements. Separate confirmed source facts from interpretation. Prioritize overdue, blocked and missing-proof work. Do not claim legal compliance, invent deadlines, file returns, approve evidence or change any obligation.';
    if(typeof globalThis.openThebeFromHome==='function'){globalThis.openThebeFromHome(prompt);return}
    const dock=document.getElementById('thebeAiDock'),pill=document.getElementById('thebeAiDockPill');if(dock&&dock.hidden&&pill&&!pill.hidden)pill.click();
  }

  function onClick(event){
    const button=event.target?.closest?.('[data-protect-v308-action]');if(!button)return;
    const action=button.dataset.protectV308Action;
    if(action==='refresh'){refresh({force:true});return}
    if(action==='explain'){explain();return}
    if(['obligations','statutorycalendar','evidencehub'].includes(action))navigate(action);
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
    globalThis.ThebeProtectWorkspaceV308=Object.freeze({release:RELEASE,refresh:()=>refresh({force:true}),state:()=>({release:RELEASE,loadedAt:lastLoadedAt,loading,viewState:document.getElementById(ROOT_ID)?.dataset.protectV308State||'unmounted'})});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
