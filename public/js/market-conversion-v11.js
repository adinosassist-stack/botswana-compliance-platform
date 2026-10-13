(()=>{
  const answers={
    attention:{title:'What needs my attention before Friday?',items:[['CIPA annual return','due in 21 days'],['Employee record','ID copy missing'],['Gaborone branch licence','expires in 34 days']],note:'Suggested next steps: review the annual return record, request the missing employee document and schedule the licence renewal check.'},
    licences:{title:'Which licences expire next?',items:[['Gaborone branch licence','expires in 34 days'],['Trade licence record','review date in 67 days']],note:'Demo data only. Open the related record in your authenticated workspace before taking action.'},
    month:{title:'How is the business doing this month?',items:[['Collections','below the demo target'],['Open work','4 follow-ups need an owner'],['People records','1 required document is missing']],note:'Thebe can bring permitted operating context together; financial conclusions still require user review.'},
    tender:{title:'What am I missing for this tender?',items:[['Tax clearance evidence','review current document'],['Employee record','one supporting ID is missing'],['Company profile','available in the demo evidence list']],note:'Use the checklist as preparation support, not as a guarantee of tender eligibility.'}
  };

  const proofViews=[
    {title:'Owner Home',active:'Home',kicker:'Owner view · Today',heading:'What needs attention',metrics:[['3','priority items'],['4','open follow-ups']],rows:[['CIPA annual return','21 days'],['Collections target','Check'],['Employee record','Missing']],caption:'See deadlines, operating issues and follow-ups that need attention.'},
    {title:'People',active:'People',kicker:'People · Records',heading:'Team readiness',metrics:[['8','active records'],['1','document missing']],rows:[['Employee ID copy','Request'],['Role responsibility','Current'],['Daily report','Received']],caption:'Keep employee records, responsibilities and missing documents visible.'},
    {title:'Protect',active:'Protect',kicker:'Protect · Evidence',heading:'Upcoming obligations',metrics:[['2','upcoming reviews'],['6','evidence records']],rows:[['Branch licence','34 days'],['BURS record','Review'],['Tender evidence','Ready']],caption:'Track licences, obligations and supporting evidence in one place.'}
  ];

  function make(tag,className,text){
    const n=document.createElement(tag);
    if(className)n.className=className;
    if(text!=null)n.textContent=text;
    return n;
  }

  function makeLink(className,text,href){
    const a=make('a',className,text);
    a.href=href;
    return a;
  }

  function setExternal(a){
    a.target='_blank';
    a.rel='noopener noreferrer';
    return a;
  }

  function buildAnswer(container,key){
    const a=answers[key];
    if(!a||!container)return;
    const ol=make('ol');
    a.items.forEach(([label,detail])=>{
      const li=make('li');
      const b=make('b',null,label);
      li.append(b,document.createTextNode(' — '+detail));
      ol.append(li);
    });
    const note=make('p',null,a.note);
    container.replaceChildren(ol,note);
  }

  function initHero(gate){
    const hero=gate.querySelector('.hero');
    if(!hero)return;
    const h1=hero.querySelector('h1');
    const p=hero.querySelector('.hero-grid>div>p');
    if(h1)h1.textContent='Run your business from one place.';
    if(p)p.textContent='Thebe Desk brings your money, work, people and business obligations into one clear operating view. See what needs attention, keep the evidence behind the work, and stay in control as the business grows.';
    const secondary=hero.querySelector('.hero-cta .btn.secondary');
    if(secondary){secondary.textContent='See the product';secondary.href='#product-proof'}
    const reassure=hero.querySelector('.reassure');
    if(reassure)reassure.textContent='No payment card required · 14-day trial · Pula pricing';
  }

  function proofItem(title,detail){
    const item=make('div','proof-item');
    item.append(make('b',null,title),make('span',null,detail));
    return item;
  }

  function initLocalProof(gate){
    const strip=gate.querySelector('.proof-strip');
    const inner=strip?.querySelector('.proof-inner');
    if(!strip||!inner)return;
    strip.classList.add('local-fit');
    strip.setAttribute('aria-label','Botswana market fit');
    if(!strip.querySelector('.local-fit-head')){
      const head=make('div','local-fit-head','Built around work Botswana businesses already manage.');
      inner.parentElement.insertBefore(head,inner);
    }
    inner.classList.add('proof-six');
    inner.replaceChildren(
      proofItem('CIPA workflows','Company records & recurring obligations.'),
      proofItem('BURS readiness','Deadlines, records & evidence.'),
      proofItem('Business licences','Renewal dates kept visible.'),
      proofItem('Tender evidence','Reusable supporting records.'),
      proofItem('Pula pricing','Plans from P149 per month.'),
      proofItem('14-day trial','No payment card required.')
    );
  }

  function buildProofView(config){
    const article=make('article','proof-view');
    const head=make('div','proof-view-head');
    head.append(make('b',null,config.title),make('span','demo-label','Demo workspace'));

    const windowNode=make('div','proof-window');
    const sidebar=make('div','proof-sidebar');
    ['Home','Money','Work','People','Protect'].forEach(label=>sidebar.append(make('span',label===config.active?'active':'',label)));

    const screen=make('div','proof-screen');
    screen.append(make('small',null,config.kicker),make('h3',null,config.heading));
    const metrics=make('div','proof-metrics');
    config.metrics.forEach(([value,label])=>{
      const metric=make('div','proof-metric');
      metric.append(make('b',null,value),make('span',null,label));
      metrics.append(metric);
    });
    screen.append(metrics);
    const list=make('div','proof-list');
    config.rows.forEach(([label,state])=>{
      const row=make('div');
      row.append(document.createTextNode(label),make('strong',null,state));
      list.append(row);
    });
    screen.append(list);
    windowNode.append(sidebar,screen);

    const copy=make('div','proof-view-copy');
    copy.append(make('b',null,config.title),make('p',null,config.caption));
    article.append(head,windowNode,copy);
    return article;
  }

  function buildProductProof(){
    const section=make('section','section product-proof');
    section.id='product-proof';
    const wrap=make('div','wrap');
    const head=make('div','section-head');
    head.append(
      make('div','kicker','Inside Thebe Desk'),
      make('h2',null,'See the business clearly before something gets missed.'),
      make('p',null,'These views use sample business data. Your private workspace never loads on the public website.')
    );
    const grid=make('div','proof-view-grid');
    proofViews.forEach(config=>grid.append(buildProofView(config)));
    const cta=make('div','proof-cta');
    const start=makeLink('btn primary marketing-start-action','Start free for 14 days','/auth/?mode=register&plan=business');
    cta.append(start,make('span','proof-cta-note','Demo views only · no customer workspace data'));
    wrap.append(head,grid,cta);
    section.append(wrap);
    return section;
  }

  function initProductProof(gate){
    if(gate.querySelector('#product-proof'))return;
    const problem=gate.querySelector('#problem');
    if(problem)problem.after(buildProductProof());
  }

  function aiPrompt(key,title,detail){
    const button=make('button','ai-prompt');
    button.type='button';
    button.dataset.marketAiQuestion=key;
    button.append(make('b',null,'“'+title+'”'),make('span',null,detail));
    return button;
  }

  function initAI(gate){
    const section=gate.querySelector('#thebe-ai');
    const panel=section?.querySelector('.ai-panel');
    if(!panel)return;

    const copy=make('div','ai-copy');
    copy.append(
      make('div','kicker','Thebe AI'),
      make('h2',null,'Ask Thebe what needs attention next.'),
      make('p',null,'Thebe can use information already available in your permitted workspace to help summarise issues, explain records and suggest practical next steps.'),
      make('div','ai-safety','Thebe can summarise permitted workspace information, identify missing items and suggest next steps. It does not replace legal, tax or accounting professionals, and high-impact business actions should remain subject to user review and approval.')
    );
    const prompts=make('div','ai-prompts');
    prompts.setAttribute('aria-label','Illustrative example questions');
    prompts.append(
      aiPrompt('attention','What needs my attention before Friday?','Prioritise deadlines and missing records.'),
      aiPrompt('licences','Which licences expire next?','Review known dates and supporting records.'),
      aiPrompt('month','How is the business doing this month?','Bring permitted operating context together.'),
      aiPrompt('tender','What am I missing for this tender?','Review demo readiness evidence.')
    );
    copy.append(prompts);

    const example=make('div','ai-example');
    example.dataset.marketAiResponse='1';
    example.setAttribute('aria-live','polite');
    const label=make('span','ai-example-label','Illustrative example · demo data only');
    const question=make('div','ai-example-q',answers.attention.title);
    question.dataset.marketAiResponseTitle='1';
    const answer=make('div','ai-example-a');
    answer.dataset.marketAiResponseBody='1';
    buildAnswer(answer,'attention');
    example.append(label,question,answer,make('div','ai-example-note','No customer workspace data is used on this public page.'));

    panel.replaceChildren(copy,example);
    const buttons=panel.querySelectorAll('[data-market-ai-question]');
    buttons.forEach((button,index)=>{
      button.setAttribute('aria-pressed',index===0?'true':'false');
      button.addEventListener('click',()=>{
        buttons.forEach(x=>x.setAttribute('aria-pressed','false'));
        button.setAttribute('aria-pressed','true');
        const key=button.dataset.marketAiQuestion;
        const current=answers[key];
        if(!current)return;
        question.textContent=current.title;
        buildAnswer(answer,key);
      });
    });
  }

  function initBotswana(gate){
    const photo=gate.querySelector('#botswana .country-photo');
    if(!photo)return;
    const card=make('div','readiness-card');
    const top=make('div','readiness-top');
    const badge=make('div','readiness-badge');
    badge.append(make('span','dot'),document.createTextNode('Live product · Botswana'));
    top.append(
      badge,
      make('h3',null,'Local workflows. One operating layer.'),
      make('p',null,'Money, people, business obligations and property can sit in one operating view while Botswana-specific records stay locally grounded.')
    );
    const grid=make('div','readiness-grid');
    [['Money','Collections & reconciliation'],['People','Records & responsibilities'],['Protect','Obligations & evidence'],['Property','Portfolio visibility']].forEach(([title,detail])=>{
      const item=make('div');
      item.append(make('b',null,title),make('span',null,detail));
      grid.append(item);
    });
    card.append(top,grid);
    photo.replaceWith(card);
  }

  function initTrust(gate){
    const section=gate.querySelector('#trust');
    if(!section)return;
    const h2=section.querySelector('h2');
    const intro=section.querySelector('.section-head p');
    if(h2)h2.textContent='Important actions stay under human control.';
    if(intro)intro.textContent='Thebe Desk is designed to help organise work, evidence and decisions without silently taking over high-impact business actions.';
    const items=section.querySelectorAll('.trust-item');
    const copy=[
      ['Role-aware workspace','Thebe Desk is designed to limit workspace access according to assigned roles and permissions.'],
      ['Evidence with the work','Keep supporting records alongside the work or obligation they relate to.'],
      ['Clearer activity record','Keep a clearer record of important workspace activity and follow-up.'],
      ['Human review','AI can assist and prepare; people remain responsible for high-impact decisions.']
    ];
    items.forEach((item,i)=>{
      if(!copy[i])return;
      const title=item.querySelector('b');
      const text=item.querySelector('p');
      if(title)title.textContent=copy[i][0];
      if(text)text.textContent=copy[i][1];
    });
  }

  function initPricing(gate){
    const section=gate.querySelector('#pricing');
    if(!section)return;
    const cards=section.querySelectorAll('.pricecard');
    const audiences=['For owner-managed SMEs','For growing SMEs with staff','For multi-location & tender-active SMEs'];
    cards.forEach((card,i)=>{
      if(card.querySelector('.audience'))return;
      const h=card.querySelector('h3');
      if(h)h.after(make('span','audience',audiences[i]||''));
    });
    if(cards[1]){
      const description=cards[1].querySelector('p');
      if(description)description.textContent='For growing SMEs with staff, licences, tenders and regular operating work.';
    }

    const note=section.querySelector('.payment-note');
    if(note){
      const heading=make('h3',null,'How payment works');
      const text=make('p',null,'Start your 14-day workspace, choose the plan you want to continue with, follow the payment instructions shown, and your paid plan activates after payment is confirmed.');
      const steps=make('div','payment-steps');
      ['Start trial','Choose plan','Follow payment instructions','Plan activates after confirmation'].forEach((label,i)=>{
        const step=make('span');
        step.append(make('i',null,String(i+1)),document.createTextNode(label));
        steps.append(step);
      });
      note.replaceChildren(heading,text,steps);
    }

    const secondary=section.querySelector('.secondary-plans');
    if(secondary){
      const callout=make('div','commercial-callout');
      const copy=make('div');
      copy.append(make('b',null,'Need more than 10 locations or manage businesses for clients?'),make('p',null,'Talk to us about a larger operating structure or professional-service workflow.'));
      const link=setExternal(makeLink(null,'Talk to us →','https://wa.me/26777723273?text=Thebe%2C%20brief%20me%20about%20larger%20plans.'));
      callout.append(copy,link);
      secondary.replaceWith(callout);
    }
  }

  function buildWhatsApp(){
    const section=make('section','whatsapp-section');
    section.id='whatsapp-start';
    const wrap=make('div','wrap');
    const block=make('div','whatsapp-block');
    const copy=make('div');
    copy.append(
      make('div','kicker','A lower-friction way to start'),
      make('h2',null,'Prefer WhatsApp? Start there.'),
      make('p',null,'Use WhatsApp to ask about Thebe Desk, get help choosing a plan or find your way into the right workspace feature.')
    );
    const actions=make('div','whatsapp-actions');
    actions.append(setExternal(makeLink('btn primary','Chat with Thebe Desk on WhatsApp','https://wa.me/26777723273?text=Thebe%2C%20brief%20me.')));
    copy.append(actions,make('div','whatsapp-note','WhatsApp is an entry point. Your authenticated workspace remains the system of record.'));
    const points=make('div','whatsapp-points');
    ['Ask questions before starting your trial.','Get help choosing the right plan.','Keep governed business records and approvals inside your authenticated workspace.'].forEach(text=>{
      const row=make('div');
      row.append(make('span',null,'✓'),document.createTextNode(text));
      points.append(row);
    });
    block.append(copy,points);
    wrap.append(block);
    section.append(wrap);
    return section;
  }

  function initWhatsApp(gate){
    if(gate.querySelector('#whatsapp-start'))return;
    const faq=gate.querySelector('#faq');
    if(faq)faq.before(buildWhatsApp());
  }

  function initFaq(gate){
    const faq=gate.querySelector('#faq .faq');
    if(!faq||faq.querySelector('details'))return;
    [...faq.querySelectorAll('article')].forEach((article,i)=>{
      const h=article.querySelector('h3');
      const p=article.querySelector('p');
      if(!h||!p)return;
      const details=make('details');
      if(i===0)details.open=true;
      const summary=make('summary',null,h.textContent);
      const answer=make('p',null,p.textContent);
      details.append(summary,answer);
      article.replaceWith(details);
    });
  }

  function initSticky(gate){
    const heroCta=gate.querySelector('.hero .marketing-start-action');
    const sticky=gate.querySelector('.mobile-sticky');
    if(heroCta&&sticky&&'IntersectionObserver'in window){
      document.documentElement.classList.add('market-js');
      const io=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{sticky.dataset.visible=entry.isIntersecting?'false':'true'});
      },{threshold:.1});
      io.observe(heroCta);
    }
  }

  function init(){
    const gate=document.getElementById('marketingGate');
    if(!gate||gate.dataset.marketConversionV11==='1')return;
    gate.dataset.marketConversionV11='1';
    initHero(gate);
    initLocalProof(gate);
    initProductProof(gate);
    initAI(gate);
    initBotswana(gate);
    initTrust(gate);
    initPricing(gate);
    initWhatsApp(gate);
    initFaq(gate);
    initSticky(gate);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();