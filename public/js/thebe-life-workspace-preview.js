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
    const state={tab:'overview',transactions:[{name:'Groceries',category:'Food',amount:850},{name:'Electricity',category:'Utilities',amount:400}],goals:[{name:'School Fees',saved:3200,target:6000}]};
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
        grid.append(card('Household remaining',format(7200),'Illustrative monthly budget'),card('Motshelo contribution',format(1000),'Planned; not verified cash'),card('Insurance','Explore partners','Regulated partner setup required'),card('Savings goals',String(state.goals.length),'Household priorities'));
        body.append(grid);body.append(node('div','tl-note','Demo only. Thebe Life uses the existing Workspace sidebar, top bar and Thebe AI dock. No real financial data is loaded.'));
      }
      if(state.tab==='household'){
        grid.append(card('Income',format(20000),'Sample'),card('Expenses',format(11800+state.transactions.reduce((n,x)=>n+x.amount,0)),'Includes demo additions'),card('Motshelo commitment',format(1000),'Tracked separately from expenses'));body.append(grid);
        const section=node('div','tl-panel');section.append(node('h2','','Recent household transactions'));
        const list=node('ul','tl-list');for(const x of state.transactions)list.append(node('li','',x.name+' · '+x.category+' · '+format(x.amount)));
        section.append(list);
        const form=node('form','tl-form');const name=node('input','');name.placeholder='Expense description';name.maxLength=80;name.required=true;name.setAttribute('aria-label','Expense description');
        const amount=node('input','');amount.type='number';amount.min='1';amount.max='1000000';amount.step='1';amount.placeholder='Amount (P)';amount.required=true;amount.setAttribute('aria-label','Expense amount in pula');
        const button=node('button','tl-primary','Add demo expense');button.type='submit';form.append(name,amount,button);
        form.addEventListener('submit',e=>{e.preventDefault();const v=Number(amount.value);if(!Number.isSafeInteger(v)||v<1||v>1000000)return;state.transactions.push({name:name.value.trim().slice(0,80),category:'Other',amount:v});render();});
        section.append(form);body.append(section);
      }
      if(state.tab==='motshelo'){
        grid.append(card('Group members','12','Example group'),card('Expected monthly',format(12000),'12 × P 1,000'),card('Reported contributions',format(10000),'Not settled or available'),card('Still expected',format(2000),'Reconciliation pending'));body.append(grid);
        body.append(node('div','tl-note','Motshelo committee approvals and bank-cleared receipts are required for financial decisions. No payouts can be initiated here.'));
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
    render();return {destroy(){root.replaceChildren();root.classList.remove('thebe-life-view');delete root.dataset.thebeLifeMounted;}};
  }
  global.ThebeLifeWorkspacePreview=Object.freeze({mount});
})(window);
