/* Thebe Life — opt-in workspace view. No routes, persistence or production finance actions. */
(function(global){
  'use strict';
  const tabs=[
    ['overview','Overview'],['household','Household Budget'],['motshelo','Motshelo'],
    ['insurance','Insurance'],['goals','Life Goals']
  ];
  const format=(n)=>'P '+Number(n).toLocaleString('en-BW',{maximumFractionDigits:0});
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  function mount(root,opts={}){
    if(!(root instanceof Element))throw new TypeError('root element required');
    if(root.dataset.thebeLifeMounted==='true') return {destroy:()=>{}};
    root.dataset.thebeLifeMounted='true'; root.classList.add('thebe-life-view');
    const state={tab:'overview',transactions:[{name:'Groceries',category:'Food',amount:850},{name:'Electricity',category:'Utilities',amount:400}],goals:[{name:'School Fees',saved:3200,target:6000}],motsheloReports:[{member:'Member 1',amount:1000},{member:'Member 2',amount:1000},{member:'Member 3',amount:1000},{member:'Member 4',amount:1000},{member:'Member 5',amount:1000},{member:'Member 6',amount:1000},{member:'Member 7',amount:1000},{member:'Member 8',amount:1000},{member:'Member 9',amount:1000},{member:'Member 10',amount:1000}]};
    // This preview never initiates beta requests automatically. Only the
    // authenticated host adapter may supply the synthetic staging opt-in.
    const privateBeta=opts.privateBeta?.enabled===true &&
      typeof opts.privateBeta?.groupId==='string' &&
      /^[A-Za-z0-9_-]{1,80}$/.test(opts.privateBeta.groupId)?opts.privateBeta:null;
    let alive=true,activeRead=null;
    state.betaStatus='idle';state.betaSnapshot=null;
    // Demo-only derived totals; separate from persisted household finance and verified cash.
    const budget=()=>{
      const addedMinor=state.transactions.reduce((sum,item)=>sum+Math.round(item.amount*100),0);
      const incomeMinor=2000000,baselineExpenseMinor=1180000,commitmentMinor=100000;
      const spentMinor=baselineExpenseMinor+addedMinor;
      return {incomeMinor,spentMinor,commitmentMinor,
        remainingMinor:incomeMinor-spentMinor-commitmentMinor};
    };
    const render=()=>{
      root.replaceChildren();
      const heading=node('div','tl-head');
      const caption=node('div','tl-eyebrow','THEBE DESK / LIFE');
      heading.append(caption,node('h1','', 'Thebe Life'),node('p','tl-muted','Your family finances, community savings and protection — together in Thebe Desk.'));
      root.append(heading);
      const nav=node('div','tl-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Thebe Life sections');
      for(const [id,label] of tabs){const b=node('button','tl-tab'+(state.tab===id?' is-active':''),label);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.tab===id));b.addEventListener('click',()=>{state.tab=id;render();});nav.append(b);}root.append(nav);
      const body=node('section','tl-body');body.setAttribute('aria-live','polite');
      const card=(name,value,description)=>{const c=node('div','tl-card');c.append(node('span','tl-muted',name),node('strong','tl-number',value),node('small','tl-muted',description));return c;};
      const grid=node('div','tl-grid');
      if(state.tab==='overview'){
        grid.append(card('Household remaining',format(budget().remainingMinor/100),'Illustrative after expenses and commitments'),card('Motshelo contribution',format(1000),'Planned; not verified cash'),card('Insurance','Explore partners','Regulated partner setup required'),card('Savings goals',String(state.goals.length),'Household priorities'));
        body.append(grid);body.append(node('div','tl-note','Demo only. Thebe Life uses the existing Workspace sidebar, top bar and Thebe AI dock. No real financial data is loaded.'));
      }
      if(state.tab==='household'){
        grid.append(card('Income',format(budget().incomeMinor/100),'Sample'),card('Expenses',format(budget().spentMinor/100),'Baseline and demo transactions'),card('Motshelo commitment',format(budget().commitmentMinor/100),'Tracked separately from expenses'),card('Budget remaining',format(budget().remainingMinor/100),'Planning estimate, not bank balance'));body.append(grid);
        const section=node('div','tl-panel');section.append(node('h2','','Recent household transactions'));
        const list=node('ul','tl-list');for(const x of state.transactions)list.append(node('li','',x.name+' · '+x.category+' · '+format(x.amount)));
        section.append(list);
        const form=node('form','tl-form');const name=node('input','');name.placeholder='Expense description';name.maxLength=80;name.required=true;name.setAttribute('aria-label','Expense description');
        const amount=node('input','');amount.type='number';amount.min='1';amount.max='1000000';amount.step='1';amount.placeholder='Amount (P)';amount.required=true;amount.setAttribute('aria-label','Expense amount in pula');
        const button=node('button','tl-primary','Add demo expense');button.type='submit';form.append(name,amount,button);
        form.addEventListener('submit',e=>{e.preventDefault();const v=Number(amount.value);if(!Number.isSafeInteger(v)||v<1||v>1000000)return;state.transactions.push({name:name.value.trim().slice(0,80),category:'Other',amount:v});render();});
        section.append(form);body.append(section);body.append(node('div','tl-note','All budget figures are illustrative. Demo entries affect this preview only; changes are not saved and do not verify funds or initiate payments.'));
      }
      if(state.tab==='motshelo'){
        const expected=12000;
        const reported=state.motsheloReports.reduce((sum,item)=>sum+item.amount,0);
        grid.append(card('Group members','12','Illustrative group'),card('Expected monthly',format(expected),'12 × P 1,000'),card('Reported contributions',format(reported),'Unverified member reports'),card('Reporting difference',format(Math.abs(expected-reported)),reported>expected?'Reported above expected':'Not yet reported'));body.append(grid);
        const panel=node('div','tl-panel');panel.append(node('h2','','Member contribution reports'));
        const list=node('ul','tl-list');
        for(const item of state.motsheloReports)list.append(node('li','',item.member+' · '+format(item.amount)+' · Unverified'));
        panel.append(list);
        const form=node('form','tl-form');
        const member=node('input','');member.placeholder='Member name';member.maxLength=60;member.required=true;member.setAttribute('aria-label','Demo member name');
        const amount=node('input','');amount.type='number';amount.min='1';amount.max='100000';amount.step='1';amount.required=true;amount.placeholder='Reported amount (P)';amount.setAttribute('aria-label','Demo reported amount in pula');
        const button=node('button','tl-primary','Record demo report');button.type='submit';form.append(member,amount,button);
        form.addEventListener('submit',e=>{e.preventDefault();const v=Number(amount.value);const name=member.value.trim();if(!name||!Number.isSafeInteger(v)||v<1||v>100000||state.motsheloReports.length>=50)return;state.motsheloReports.push({member:name.slice(0,60),amount:v});render();});
        panel.append(form);body.append(panel);
        if(privateBeta){
          const betaPanel=node('div','tl-panel');
          betaPanel.append(node('h2','','Private beta · read-only group records'));
          betaPanel.append(node('p','tl-muted','Isolated synthetic staging data only. No payments, transfers or bank verification.'));
          const refresh=node('button','tl-primary',state.betaStatus==='loading'?'Loading…':'Load private beta records');
          refresh.type='button';refresh.disabled=state.betaStatus==='loading';
          refresh.addEventListener('click',async()=>{
            if(!alive||activeRead||typeof global.ThebeLifePrivateReadClient?.loadGroup!=='function'){
              state.betaStatus='unavailable';render();return;
            }
            const abort=new AbortController();activeRead=abort;
            state.betaStatus='loading';render();
            const result=await global.ThebeLifePrivateReadClient.loadGroup({
              enabled:true,groupId:privateBeta.groupId,signal:abort.signal
            });
            if(!alive||activeRead!==abort)return;
            activeRead=null;
            state.betaSnapshot=result?.ok===true?result:null;
            state.betaStatus=result?.ok===true?'loaded':'unavailable';
            render();
          });
          betaPanel.append(refresh);
          if(state.betaStatus==='unavailable')betaPanel.append(node('p','tl-muted','Private beta records unavailable or access denied.'));
          if(state.betaStatus==='loaded'&&state.betaSnapshot){
            const snapshot=state.betaSnapshot;
            betaPanel.append(node('p','tl-muted','Reported: '+format(snapshot.reportedMinor/100)+' · Matched: '+format(snapshot.matchedMinor/100)+' · Recorded as cleared: '+format(snapshot.clearedMinor/100)));
            betaPanel.append(node('p','tl-muted','These are staging ledger figures, NOT independently verified bank funds.'));
            const history=node('ul','tl-list');
            for(const item of snapshot.contributions.slice(0,50))
              history.append(node('li','',item.memberId+' · Reported '+format(item.reportedMinor/100)+' · Unverified bank status'));
            betaPanel.append(history);
          }
          body.append(betaPanel);
        }
        body.append(node('div','tl-note','Demo reports are NOT bank-cleared contributions, wallet balances or proof of payment. Only independent settlement verification and committee approval can qualify a disbursement. No payouts or bank operations are available.'));
      }
      if(state.tab==='insurance'){
        grid.append(card('Marketplace','Not activated','Insurer partnerships pending'),card('Commission tracking','Not activated','Agreements and approvals required'),card('Policy organizer','Planned','Personal policies are separate from corporate assets'));body.append(grid);
        body.append(node('div','tl-note','Thebe is not the underwriter. Quotes, policy issuance and insurance commissions require approved licensed partners and applicable regulatory permissions.'));
      }
      if(state.tab==='goals'){
        const panel=node('div','tl-panel');panel.append(node('h2','','Family savings goals'));
        for(const x of state.goals){const item=node('div','tl-goal');item.append(node('strong','',x.name),node('span','tl-muted',format(x.saved)+' of '+format(x.target)));const bar=node('div','tl-track');const progress=node('div','tl-progress');progress.style.width=Math.min(100,100*x.saved/x.target)+'%';bar.append(progress);item.append(bar);panel.append(item);}
        const form=node('form','tl-form');const name=node('input','');name.placeholder='Goal name';name.required=true;name.maxLength=60;name.setAttribute('aria-label','Goal name');const amount=node('input','');amount.type='number';amount.min='1';amount.step='1';amount.placeholder='Target (P)';amount.required=true;amount.setAttribute('aria-label','Goal target pula');const button=node('button','tl-primary','Add demo goal');button.type='submit';form.append(name,amount,button);form.addEventListener('submit',e=>{e.preventDefault();const n=Number(amount.value);if(!name.value.trim()||!Number.isSafeInteger(n)||n<1||n>100000000)return;state.goals.push({name:name.value.trim().slice(0,60),saved:0,target:n});render();});panel.append(form);body.append(panel);
      }
      root.append(body);
    };
    render();return {destroy(){alive=false;activeRead?.abort();activeRead=null;root.replaceChildren();root.classList.remove('thebe-life-view');delete root.dataset.thebeLifeMounted;}};
  }
  global.ThebeLifeWorkspacePreview=Object.freeze({mount});
})(window);
