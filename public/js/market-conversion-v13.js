(()=>{
  function make(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!=null)node.textContent=text;
    return node;
  }

  function removeRedundantSections(gate){
    ['#problem','.product-proof','#trust','.whatsapp-section'].forEach(selector=>gate.querySelectorAll(selector).forEach(node=>node.remove()));
  }

  function fixHeroPath(gate){
    const secondary=gate.querySelector('.hero .hero-cta .btn.secondary');
    if(secondary){secondary.textContent='See the product';secondary.href='#product';}
  }

  function addProductCta(gate){
    const section=gate.querySelector('#product .wrap');
    if(!section||section.querySelector('.conversion-inline-cta'))return;
    const box=make('div','conversion-inline-cta');
    const copy=make('div');
    copy.append(make('b',null,'Ready to see your own business in one view?'),make('span',null,'Start free for 14 days · no payment card required.'));
    const action=make('a','btn primary marketing-start-action','Start free for 14 days');
    action.href='/auth/?mode=register&plan=business';
    action.dataset.ctaSource='product';
    box.append(copy,action);
    section.append(box);
  }

  function tightenPricing(gate){
    const section=gate.querySelector('#pricing');
    if(!section)return;
    const intro=section.querySelector('.section-head p');
    if(intro)intro.textContent='Start free for 14 days with no payment card. Choose a paid plan only when you are ready to continue.';
    const cards=[...section.querySelectorAll('.pricecard')];
    cards.forEach((card,index)=>{
      const action=card.querySelector('.marketing-start-action');
      if(action){action.dataset.ctaSource='pricing';action.dataset.plan=['monitor','protect','control'][index]||'plan';}
    });
    section.querySelectorAll('.secondary-plans').forEach(node=>node.remove());
    const callout=section.querySelector('.commercial-callout');
    if(callout){
      const title=callout.querySelector('b');
      const text=callout.querySelector('p');
      const link=callout.querySelector('a');
      if(title)title.textContent='Need more than 10 locations?';
      if(text)text.textContent='Talk to us about a larger operating setup.';
      if(link)link.textContent='WhatsApp us →';
    }
  }

  function trimFaq(gate){
    const faq=gate.querySelector('#faq .faq');
    if(!faq)return;
    [...faq.querySelectorAll('details,article')].slice(6).forEach(node=>node.remove());
  }

  function tagCoreCtas(gate){
    gate.querySelectorAll('.hero .marketing-start-action').forEach(a=>a.dataset.ctaSource='hero');
    gate.querySelectorAll('.nav .marketing-start-action').forEach(a=>a.dataset.ctaSource='nav');
    gate.querySelectorAll('.mobile-sticky .marketing-start-action').forEach(a=>a.dataset.ctaSource='mobile-sticky');
    gate.querySelectorAll('.final .marketing-start-action').forEach(a=>a.dataset.ctaSource='final');
  }

  function init(){
    const gate=document.getElementById('marketingGate');
    if(!gate||gate.dataset.marketConversionV13==='1')return;
    gate.dataset.marketConversionV13='1';
    removeRedundantSections(gate);
    fixHeroPath(gate);
    addProductCta(gate);
    tightenPricing(gate);
    trimFaq(gate);
    tagCoreCtas(gate);
  }

  const run=()=>queueMicrotask(init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
