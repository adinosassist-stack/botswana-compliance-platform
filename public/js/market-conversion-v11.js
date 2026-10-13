(()=>{
  const answers={
    attention:{title:'What needs my attention before Friday?',html:'<ol><li><b>CIPA annual return</b> — due in 21 days</li><li><b>Employee record</b> — ID copy missing</li><li><b>Gaborone branch licence</b> — expires in 34 days</li></ol><p>Suggested next steps: review the annual return record, request the missing employee document and schedule the licence renewal check.</p>'},
    licences:{title:'Which licences expire next?',html:'<ol><li><b>Gaborone branch licence</b> — expires in 34 days</li><li><b>Trade licence record</b> — review date in 67 days</li></ol><p>Demo data only. Open the related record in your authenticated workspace before taking action.</p>'},
    month:{title:'How is the business doing this month?',html:'<ol><li><b>Collections</b> — below the demo target</li><li><b>Open work</b> — 4 follow-ups need an owner</li><li><b>People records</b> — 1 required document is missing</li></ol><p>Thebe can bring permitted operating context together; financial conclusions still require user review.</p>'},
    tender:{title:'What am I missing for this tender?',html:'<ol><li><b>Tax clearance evidence</b> — review current document</li><li><b>Employee record</b> — one supporting ID is missing</li><li><b>Company profile</b> — available in the demo evidence list</li></ol><p>Use the checklist as preparation support, not as a guarantee of tender eligibility.</p>'}
  };

  function el(tag,className,html){const node=document.createElement(tag);if(className)node.className=className;if(html!=null)node.innerHTML=html;return node}

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

  function initLocalProof(gate){
    const strip=gate.querySelector('.proof-strip');
    const inner=strip?.querySelector('.proof-inner');
    if(!strip||!inner)return;
    strip.classList.add('local-fit');
    strip.setAttribute('aria-label','Botswana market fit');
    if(!strip.querySelector('.local-fit-head')){
      const head=el('div','local-fit-head','Built around work Botswana businesses already manage.');
      inner.parentElement.insertBefore(head,inner);
    }
    inner.classList.add('proof-six');
    inner.innerHTML=''+
      '<div class="proof-item"><b>CIPA workflows</b><span>Company records &amp; recurring obligations.</span></div>'+
      '<div class="proof-item"><b>BURS readiness</b><span>Deadlines, records &amp; evidence.</span></div>'+
      '<div class="proof-item"><b>Business licences</b><span>Renewal dates kept visible.</span></div>'+
      '<div class="proof-item"><b>Tender evidence</b><span>Reusable supporting records.</span></div>'+
      '<div class="proof-item"><b>Pula pricing</b><span>Plans from P149 per month.</span></div>'+
      '<div class="proof-item"><b>14-day trial</b><span>No payment card required.</span></div>';
  }

  function productProofMarkup(){
    return '<section class="section product-proof" id="product-proof"><div class="wrap">'+
      '<div class="section-head"><div class="kicker">Inside Thebe Desk</div><h2>See the business clearly before something gets missed.</h2><p>These views use sample business data. Your private workspace never loads on the public website.</p></div>'+
      '<div class="proof-view-grid">'+
        '<article class="proof-view"><div class="proof-view-head"><b>Owner Home</b><span class="demo-label">Demo workspace</span></div><div class="proof-window"><div class="proof-sidebar"><span class="active">Home</span><span>Money</span><span>Work</span><span>People</span><span>Protect</span></div><div class="proof-screen"><small>Owner view · Today</small><h3>What needs attention</h3><div class="proof-metrics"><div class="proof-metric"><b>3</b><span>priority items</span></div><div class="proof-metric"><b>4</b><span>open follow-ups</span></div></div><div class="proof-list"><div>CIPA annual return<strong>21 days</strong></div><div>Collections target<strong>Check</strong></div><div>Employee record<strong>Missing</strong></div></div></div></div><div class="proof-view-copy"><b>Owner Home</b><p>See deadlines, operating issues and follow-ups that need attention.</p></div></article>'+
        '<article class="proof-view"><div class="proof-view-head"><b>People</b><span class="demo-label">Demo workspace</span></div><div class="proof-window"><div class="proof-sidebar"><span>Home</span><span>Money</span><span>Work</span><span class="active">People</span><span>Protect</span></div><div class="proof-screen"><small>People · Records</small><h3>Team readiness</h3><div class="proof-metrics"><div class="proof-metric"><b>8</b><span>active records</span></div><div class="proof-metric"><b>1</b><span>document missing</span></div></div><div class="proof-list"><div>Employee ID copy<strong>Request</strong></div><div>Role responsibility<strong>Current</strong></div><div>Daily report<strong>Received</strong></div></div></div></div><div class="proof-view-copy"><b>People</b><p>Keep employee records, responsibilities and missing documents visible.</p></div></article>'+
        '<article class="proof-view"><div class="proof-view-head"><b>Protect</b><span class="demo-label">Demo workspace</span></div><div class="proof-window"><div class="proof-sidebar"><span>Home</span><span>Money</span><span>Work</span><span>People</span><span class="active">Protect</span></div><div class="proof-screen"><small>Protect · Evidence</small><h3>Upcoming obligations</h3><div class="proof-metrics"><div class="proof-metric"><b>2</b><span>upcoming reviews</span></div><div class="proof-metric"><b>6</b><span>evidence records</span></div></div><div class="proof-list"><div>Branch licence<strong>34 days</strong></div><div>BURS record<strong>Review</strong></div><div>Tender evidence<strong>Ready</strong></div></div></div></div><div class="proof-view-copy"><b>Protect</b><p>Track licences, obligations and supporting evidence in one place.</p></div></article>'+
      '</div><div class="proof-cta"><a class="btn primary marketing-start-action" href="/auth/?mode=register&amp;plan=business">Start free for 14 days</a><span class="proof-cta-note">Demo views only · no customer workspace data</span></div></div></section>';
  }

  function initProductProof(gate){
    if(gate.querySelector('#product-proof'))return;
    const problem=gate.querySelector('#problem');
    if(problem)problem.insertAdjacentHTML('afterend',productProofMarkup());
  }

  function initAI(gate){
    const section=gate.querySelector('#thebe-ai');
    const panel=section?.querySelector('.ai-panel');
    if(!panel)return;
    panel.innerHTML='<div class="ai-copy"><div class="kicker">Thebe AI</div><h2>Ask Thebe what needs attention next.</h2><p>Thebe can use information already available in your permitted workspace to help summarise issues, explain records and suggest practical next steps.</p><div class="ai-safety">Thebe can summarise permitted workspace information, identify missing items and suggest next steps. It does not replace legal, tax or accounting professionals, and high-impact business actions should remain subject to user review and approval.</div><div class="ai-prompts" aria-label="Illustrative example questions"><button type="button" class="ai-prompt" data-market-ai-question="attention"><b>“What needs my attention before Friday?”</b><span>Prioritise deadlines and missing records.</span></button><button type="button" class="ai-prompt" data-market-ai-question="licences"><b>“Which licences expire next?”</b><span>Review known dates and supporting records.</span></button><button type="button" class="ai-prompt" data-market-ai-question="month"><b>“How is the business doing this month?”</b><span>Bring permitted operating context together.</span></button><button type="button" class="ai-prompt" data-market-ai-question="tender"><b>“What am I missing for this tender?”</b><span>Review demo readiness evidence.</span></button></div></div><div class="ai-example" data-market-ai-response aria-live="polite"><span class="ai-example-label">Illustrative example · demo data only</span><div class="ai-example-q" data-market-ai-response-title>What needs my attention before Friday?</div><div class="ai-example-a" data-market-ai-response-body>'+answers.attention.html+'</div><div class="ai-example-note">No customer workspace data is used on this public page.</div></div>';
    const q=panel.querySelectorAll('[data-market-ai-question]');
    const box=panel.querySelector('[data-market-ai-response]');
    const title=box.querySelector('[data-market-ai-response-title]');
    const body=box.querySelector('[data-market-ai-response-body]');
    q.forEach((btn,index)=>{btn.setAttribute('aria-pressed',index===0?'true':'false');btn.addEventListener('click',()=>{q.forEach(x=>x.setAttribute('aria-pressed','false'));btn.setAttribute('aria-pressed','true');const a=answers[btn.dataset.marketAiQuestion];if(!a)return;title.textContent=a.title;body.innerHTML=a.html;});});
  }

  function initBotswana(gate){
    const photo=gate.querySelector('#botswana .country-photo');
    if(!photo)return;
    const card=el('div','readiness-card','<div class="readiness-top"><div class="readiness-badge"><span class="dot"></span>Live product · Botswana</div><h3>Local workflows. One operating layer.</h3><p>Money, people, business obligations and property can sit in one operating view while Botswana-specific records stay locally grounded.</p></div><div class="readiness-grid"><div><b>Money</b><span>Collections &amp; reconciliation</span></div><div><b>People</b><span>Records &amp; responsibilities</span></div><div><b>Protect</b><span>Obligations &amp; evidence</span></div><div><b>Property</b><span>Portfolio visibility</span></div></div>');
    photo.replaceWith(card);
  }

  function initTrust(gate){
    const section=gate.querySelector('#trust');
    if(!section)return;
    const h2=section.querySelector('h2');
    const p=section.querySelector('.section-head p');
    if(h2)h2.textContent='Important actions stay under human control.';
    if(p)p.textContent='Thebe Desk is designed to help organise work, evidence and decisions without silently taking over high-impact business actions.';
    const items=section.querySelectorAll('.trust-item');
    const copy=[
      ['Role-aware workspace','Thebe Desk is designed to limit workspace access according to assigned roles and permissions.'],
      ['Evidence with the work','Keep supporting records alongside the work or obligation they relate to.'],
      ['Clearer activity record','Keep a clearer record of important workspace activity and follow-up.'],
      ['Human review','AI can assist and prepare; people remain responsible for high-impact decisions.']
    ];
    items.forEach((item,i)=>{if(!copy[i])return;const b=item.querySelector('b'),x=item.querySelector('p');if(b)b.textContent=copy[i][0];if(x)x.textContent=copy[i][1]});
  }

  function initPricing(gate){
    const section=gate.querySelector('#pricing');
    if(!section)return;
    const cards=section.querySelectorAll('.pricecard');
    const audiences=['For owner-managed SMEs','For growing SMEs with staff','For multi-location & tender-active SMEs'];
    cards.forEach((card,i)=>{if(card.querySelector('.audience'))return;const h=card.querySelector('h3');if(h){const pill=el('span','audience',audiences[i]);h.insertAdjacentElement('afterend',pill)}});
    if(cards[1]){const p=cards[1].querySelector('p');if(p)p.textContent='For growing SMEs with staff, licences, tenders and regular operating work.'}
    const note=section.querySelector('.payment-note');
    if(note)note.innerHTML='<h3>How payment works</h3><p>Start your 14-day workspace, choose the plan you want to continue with, follow the payment instructions shown, and your paid plan activates after payment is confirmed.</p><div class="payment-steps"><span><i>1</i>Start trial</span><span><i>2</i>Choose plan</span><span><i>3</i>Follow payment instructions</span><span><i>4</i>Plan activates after confirmation</span></div>';
    const secondary=section.querySelector('.secondary-plans');
    if(secondary){const callout=el('div','commercial-callout','<div><b>Need more than 10 locations or manage businesses for clients?</b><p>Talk to us about a larger operating structure or professional-service workflow.</p></div><a href="https://wa.me/26777723273?text=Thebe%2C%20brief%20me%20about%20larger%20plans." target="_blank" rel="noopener noreferrer">Talk to us →</a>');secondary.replaceWith(callout)}
  }

  function initWhatsApp(gate){
    if(gate.querySelector('#whatsapp-start'))return;
    const faq=gate.querySelector('#faq');
    if(!faq)return;
    faq.insertAdjacentHTML('beforebegin','<section class="whatsapp-section" id="whatsapp-start"><div class="wrap"><div class="whatsapp-block"><div><div class="kicker">A lower-friction way to start</div><h2>Prefer WhatsApp? Start there.</h2><p>Use WhatsApp to ask about Thebe Desk, get help choosing a plan or find your way into the right workspace feature.</p><div class="whatsapp-actions"><a class="btn primary" href="https://wa.me/26777723273?text=Thebe%2C%20brief%20me." target="_blank" rel="noopener noreferrer">Chat with Thebe Desk on WhatsApp</a></div><div class="whatsapp-note">WhatsApp is an entry point. Your authenticated workspace remains the system of record.</div></div><div class="whatsapp-points"><div><span>✓</span>Ask questions before starting your trial.</div><div><span>✓</span>Get help choosing the right plan.</div><div><span>✓</span>Keep governed business records and approvals inside your authenticated workspace.</div></div></div></div></section>');
  }

  function initFaq(gate){
    const faq=gate.querySelector('#faq .faq');
    if(!faq||faq.querySelector('details'))return;
    const articles=[...faq.querySelectorAll('article')];
    articles.forEach((article,i)=>{const h=article.querySelector('h3');const p=article.querySelector('p');if(!h||!p)return;const details=document.createElement('details');if(i===0)details.open=true;const summary=document.createElement('summary');summary.textContent=h.textContent;const answer=document.createElement('p');answer.textContent=p.textContent;details.append(summary,answer);article.replaceWith(details)});
  }

  function initSticky(gate){
    const heroCta=gate.querySelector('.hero .marketing-start-action');
    const sticky=gate.querySelector('.mobile-sticky');
    if(heroCta&&sticky&&'IntersectionObserver'in window){document.documentElement.classList.add('market-js');const io=new IntersectionObserver(entries=>{entries.forEach(entry=>{sticky.dataset.visible=entry.isIntersecting?'false':'true'})},{threshold:.1});io.observe(heroCta)}
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