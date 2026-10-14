(()=>{
  "use strict";

  const TITLE="Business Management Software Botswana | Thebe Desk";
  const DESCRIPTION="Run money, work, people and Botswana compliance in one AI workspace. Track CIPA/BURS deadlines, staff, branches and risks. Start free for 14 days.";
  const SOCIAL_DESCRIPTION="Business management and compliance software for Botswana SMEs. Run money, work, people, CIPA, BURS, licences and business risks from one workspace.";

  function setMeta(selector,content){
    const node=document.querySelector(selector);
    if(node)node.setAttribute("content",content);
  }

  function updateSearchMetadata(){
    document.title=TITLE;
    setMeta('meta[name="description"]',DESCRIPTION);
    setMeta('meta[property="og:title"]',TITLE);
    setMeta('meta[property="og:description"]',SOCIAL_DESCRIPTION);
    setMeta('meta[name="twitter:title"]',TITLE);
    setMeta('meta[name="twitter:description"]',SOCIAL_DESCRIPTION);

    const structured=document.getElementById("seoStructuredData");
    if(structured){
      try{
        const data=JSON.parse(structured.textContent||"{}");
        const graph=Array.isArray(data?.["@graph"])?data["@graph"]:[];
        const service=graph.find(item=>item?.["@type"]==="Service");
        if(service){
          service.serviceType="Business management and compliance software for Botswana SMEs";
          service.description="Thebe Desk brings money, work, people and Botswana compliance into one AI-assisted business workspace, with human review for high-impact actions.";
        }
        structured.textContent=JSON.stringify(data);
      }catch{}
    }
  }

  function text(node,value){if(node)node.textContent=value}

  function updateHero(gate){
    const hero=gate.querySelector(".hero");
    if(!hero)return;
    text(hero.querySelector("h1"),"Run your Botswana business with fewer surprises.");
    text(hero.querySelector(".hero-grid>div>p"),"One workspace for money, staff, daily operations, CIPA, BURS, licences and business risks—with Thebe AI showing you what needs attention next.");

    const primary=hero.querySelector(".hero-cta .btn.primary, .hero-cta .marketing-start-action");
    if(primary)text(primary,"Start free for 14 days");
    const secondary=hero.querySelector(".hero-cta .btn.secondary");
    if(secondary){text(secondary,"See Thebe Desk in action");secondary.setAttribute("href","#product-proof")}
    text(hero.querySelector(".reassure"),"No payment card required · 14-day trial · Pula pricing");
  }

  function updatePricing(gate){
    const pricing=gate.querySelector("#pricing");
    if(!pricing)return;
    const cards=[...pricing.querySelectorAll(".pricecard")];
    const businessCard=cards.find(card=>card.querySelector('[data-bw-onclick*="business"]'))||cards[1];
    if(businessCard){
      text(businessCard.querySelector("h3"),"Business");
      const descriptor=businessCard.querySelector(".muted.small, p");
      text(descriptor,"For growing SMEs with staff, licences, tenders and regular operating work.");
    }
    for(const item of pricing.querySelectorAll("li")){
      if(item.textContent.trim()==="Everything in Protect")item.textContent="Everything in Business";
    }
    for(const button of pricing.querySelectorAll(".pricecard .marketing-start-action"))text(button,"Start 14-day trial");
  }

  function updateWorkspacePlanPresentation(){
    for(const label of document.querySelectorAll('button[data-bw-onclick*="requestPlan(\'business\')"] b'))text(label,"Business");
    if(typeof window.planLabel==="function"&&!window.planLabel.__thebeBusinessLabelV20){
      const prior=window.planLabel;
      const patched=function(plan){return plan==="business"?"Business":prior(plan)};
      patched.__thebeBusinessLabelV20=true;
      window.planLabel=patched;
    }
  }

  function updateClosingMessage(gate){
    const finalBox=gate.querySelector(".final .cta-box");
    if(!finalBox)return;
    text(finalBox.querySelector("h2"),"See what needs attention before it becomes a problem.");
    text(finalBox.querySelector("p"),"Bring money, work, people and business protection into one operating view, then let Thebe help you focus on the next action.");
    const primary=finalBox.querySelector(".marketing-start-action, .btn.primary");
    if(primary)text(primary,"Start free for 14 days");
  }

  function ensureLink(container,label,href){
    if(!container||container.querySelector(`a[href="${href}"]`))return;
    const link=document.createElement("a");
    link.href=href;
    link.textContent=label;
    container.append(link);
  }

  function updateTrustLinks(){
    const nav=document.querySelector(".nav .links");
    ensureLink(nav,"Trust","/trust/");
    const footer=document.querySelector(".footer .footerlinks");
    ensureLink(footer,"Trust","/trust/");
    ensureLink(footer,"Privacy","/privacy/");
    ensureLink(footer,"Terms","/terms/");
    ensureLink(footer,"Security","/security/");
    ensureLink(footer,"AI Data Use","/ai-data/");
  }

  function applyGrowthFixes(){
    updateSearchMetadata();
    const gate=document.getElementById("marketingGate");
    if(gate){
      updateHero(gate);
      updatePricing(gate);
      updateClosingMessage(gate);
      gate.dataset.marketGrowthV20="1";
    }
    updateWorkspacePlanPresentation();
    updateTrustLinks();
  }

  updateSearchMetadata();
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{
      applyGrowthFixes();
      setTimeout(applyGrowthFixes,0);
      setTimeout(applyGrowthFixes,250);
    },{once:true});
  }else{
    applyGrowthFixes();
    setTimeout(applyGrowthFixes,0);
  }
})();
