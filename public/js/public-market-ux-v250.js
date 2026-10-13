(()=>{
  "use strict";
  const RELEASE="20261013-market-gemini-panel-v251";
  const PUBLIC_PATHS=new Set(["/","/home","/home/"]);
  if(!PUBLIC_PATHS.has(window.location.pathname))return;

  const doc=document;
  const WHATSAPP_URL=`https://wa.me/26777723273?text=${encodeURIComponent("Hi Thebe Desk, I would like to know more.")}`;
  const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node};
  const setText=(node,value)=>{if(node)node.textContent=value};

  function ensureStyles(){
    if(doc.getElementById("publicMarketUxV250Styles"))return;
    const link=doc.createElement("link");
    link.id="publicMarketUxV250Styles";
    link.rel="stylesheet";
    link.href=`/assets/public-market-ux-v250.css?v=${RELEASE}`;
    doc.head.appendChild(link);
  }

  function refineHero(gate){
    const hero=gate.querySelector(".marketinghero, .hero");
    if(!hero)return;
    hero.dataset.marketHeroV250="1";

    const actions=hero.querySelector(".marketingactions, .hero-actions");
    if(actions){
      actions.dataset.marketActionsV250="1";
      const primary=actions.querySelector(".hero-primary-cta, .marketing-start-action:not(.alt):not(.soft)");
      let whatsapp=actions.querySelector(".market-whatsapp-cta");
      if(!whatsapp){
        whatsapp=make("a","btn market-whatsapp-cta","Talk to us on WhatsApp");
        whatsapp.href=WHATSAPP_URL;
        whatsapp.target="_blank";
        whatsapp.rel="noopener noreferrer";
        whatsapp.setAttribute("aria-label","Talk to Thebe Desk on WhatsApp");
        primary?.insertAdjacentElement("afterend",whatsapp);
        if(!primary)actions.prepend(whatsapp);
      }

      const explore=actions.querySelector(".marketing-guest-action, .hero-product-cta");
      const pricing=actions.querySelector('.hero-pricing-cta, [data-bw-onclick*="scrollToPricing"]');
      if(explore)explore.classList.add("market-secondary-action");
      if(pricing)pricing.classList.add("market-tertiary-action");
      if(primary)primary.classList.add("market-primary-action");
    }

    const trustline=hero.querySelector(".trustline");
    if(trustline&&!trustline.dataset.marketTrustlineV250){
      trustline.dataset.marketTrustlineV250="1";
      const values=["Botswana live","CIPA & BURS-aware","Evidence-backed"];
      trustline.querySelectorAll("span").forEach((node,index)=>{if(values[index])node.textContent=values[index]});
    }
  }

  function refineTrust(gate){
    const trust=gate.querySelector("#trust");
    if(!trust)return;
    trust.dataset.marketTrustV250="1";
    const lead=trust.querySelector(".sectiontitle, .section-head");
    if(lead){
      setText(lead.querySelector(".section-eyebrow, .kicker"),"Trust & accountability");
      setText(lead.querySelector("h2"),"Built for accountable business.");
      setText(lead.querySelector("p"),"Evidence, permissions, audit trails and compliance intelligence stay connected, so important actions can be reviewed, traced and defended.");
    }
  }

  function refinePricing(gate){
    const pricing=gate.querySelector("#pricing");
    if(!pricing)return;
    pricing.dataset.marketPricingV250="1";
    const cards=[...pricing.querySelectorAll(".pricecard")];
    for(const card of cards){
      const cta=card.querySelector("button.btn, a.btn");
      if(cta)cta.classList.add("market-plan-cta");
      const name=card.querySelector("h3")?.textContent?.trim().toLowerCase();
      if(name==="partner"){
        card.classList.add("market-partner-card");
        if(cta){cta.classList.add("market-partner-cta");cta.setAttribute("aria-label","View Thebe Desk Partner plan details")}
      }
      if(name==="protect")card.classList.add("market-protect-card");
    }
  }

  function footerLink(label,href){const a=make("a","",label);a.href=href;return a}
  function footerGroup(title,items){
    const group=make("div","market-footer-group");
    group.append(make("b","",title));
    const nav=make("nav","");
    nav.setAttribute("aria-label",`${title} links`);
    for(const [label,href] of items)nav.append(footerLink(label,href));
    group.append(nav);
    return group;
  }
  function refineFooter(gate){
    const footer=gate.querySelector(".marketingfooter");
    const card=footer?.querySelector(".footer-card")||footer;
    if(!card||card.dataset.marketFooterV250==="1")return;
    card.dataset.marketFooterV250="1";
    card.classList.add("market-footer-card");

    const brand=make("div","market-footer-brand");
    brand.append(make("b","","Thebe Desk"),make("p","","The AI operating layer for African business. Live in Botswana · Namibia next."));

    const grid=make("div","market-footer-grid");
    grid.append(
      footerGroup("Product",[["How it works","#features"],["Pricing","#pricing"],["Trust","#trust"],["FAQ","#faq"]]),
      footerGroup("Botswana",[["CIPA","/cipa-compliance-botswana/"],["BURS tax","/burs-tax-compliance-botswana/"],["Licences","/business-licences-botswana/"],["Employment","/employment-compliance-botswana/"]]),
      footerGroup("Readiness",[["Tenders","/tender-readiness-botswana/"],["Evidence","/compliance-evidence-botswana/"],["Start free","/auth/?mode=register"]])
    );

    const disclaimer=make("p","market-footer-disclaimer","Not a company-registration agency and not a substitute for professional legal or tax advice.");
    card.replaceChildren(brand,grid,disclaimer);
  }

  function setAiExpanded(expanded){
    doc.body.classList.toggle("market-ai-expanded",expanded);
    doc.body.classList.toggle("market-ai-collapsed",!expanded);
    const launcher=doc.getElementById("marketAskThebe");
    if(launcher){
      launcher.setAttribute("aria-expanded",String(expanded));
      launcher.setAttribute("aria-label",expanded?"Close Thebe AI assistant":"Open Thebe AI assistant");
      launcher.textContent=expanded?"Close Thebe":"Ask Thebe";
    }
    const dock=doc.getElementById("thebeAiDock");
    if(expanded){
      window.ThebeAiDock?.open?.();
      dock?.removeAttribute("hidden");
      dock?.removeAttribute("aria-hidden");
      window.setTimeout(()=>dock?.querySelector("textarea")?.focus({preventScroll:true}),80);
    }else{
      window.ThebeAiDock?.close?.();
      dock?.setAttribute("aria-hidden","true");
      launcher?.focus({preventScroll:true});
    }
  }

  function ensureAiLauncher(){
    if(!doc.body)return;
    doc.body.classList.add("market-ai-public","market-ai-collapsed");
    let launcher=doc.getElementById("marketAskThebe");
    if(!launcher){
      launcher=make("button","market-ai-launcher","Ask Thebe");
      launcher.id="marketAskThebe";
      launcher.type="button";
      launcher.setAttribute("aria-controls","thebeAiDock");
      launcher.setAttribute("aria-expanded","false");
      launcher.setAttribute("aria-label","Open Thebe AI assistant");
      launcher.addEventListener("click",()=>setAiExpanded(!doc.body.classList.contains("market-ai-expanded")));
      doc.body.appendChild(launcher);
    }

    const dock=doc.getElementById("thebeAiDock");
    if(dock&&!dock.dataset.marketUxV250){
      dock.dataset.marketUxV250="1";
      dock.setAttribute("aria-hidden","true");
      dock.addEventListener("click",event=>{
        if(event.target.closest(".thebe-ai-minimize"))window.setTimeout(()=>setAiExpanded(false),0);
      },true);
    }
    const nativePill=doc.getElementById("thebeAiDockPill");
    if(nativePill)nativePill.setAttribute("aria-hidden","true");
  }

  function observeAi(){
    ensureAiLauncher();
    if(!window.MutationObserver)return;
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if([...record.addedNodes].some(node=>node?.nodeType===1&&(node.id==="thebeAiDock"||node.id==="thebeAiDockPill"||node.querySelector?.("#thebeAiDock,#thebeAiDockPill")))){
          ensureAiLauncher();break;
        }
      }
    });
    observer.observe(doc.body,{childList:true,subtree:true});
  }

  function init(){
    const gate=doc.getElementById("marketingGate");
    if(!gate||gate.dataset.marketUxV250==="1")return;
    gate.dataset.marketUxV250="1";
    ensureStyles();
    refineHero(gate);
    refineTrust(gate);
    refinePricing(gate);
    refineFooter(gate);
    observeAi();
  }

  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
