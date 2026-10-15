(()=>{
  "use strict";

  const VERSION="21";

  function text(node,value){if(node)node.textContent=value}
  function make(tag,className,value){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(value!=null)node.textContent=value;
    return node;
  }

  function updateHero(gate){
    const hero=gate.querySelector(".hero");
    if(!hero)return;

    const eyebrow=hero.querySelector(".eyebrow");
    if(eyebrow){
      eyebrow.replaceChildren();
      const dot=make("span","dot");
      dot.setAttribute("aria-hidden","true");
      eyebrow.append(dot,document.createTextNode("Live in Botswana · Namibia next"));
    }

    text(hero.querySelector("h1"),"Run money, people, work and compliance from one intelligent desk.");
    text(
      hero.querySelector(".hero-grid>div:first-child>p"),
      "Thebe Desk brings the business into one clear operating view, with Thebe AI showing what needs attention next and keeping the evidence behind the work."
    );

    const primary=hero.querySelector(".hero-cta .btn.primary, .hero-cta .marketing-start-action");
    if(primary)text(primary,"Start free for 14 days");
    const secondary=hero.querySelector(".hero-cta .btn.secondary");
    if(secondary){
      text(secondary,"See the workspace");
      secondary.setAttribute("href","#product-proof");
    }
    text(hero.querySelector(".reassure"),"14 days free · No card required · Pula pricing");

    const copy=hero.querySelector(".hero-grid>div:first-child");
    if(copy&&!copy.querySelector(".market-africa-note")){
      const note=make("div","market-africa-note","Built for African businesses");
      const reassurance=copy.querySelector(".reassure");
      if(reassurance)reassurance.insertAdjacentElement("afterend",note);
      else copy.append(note);
    }
  }

  function updateAi(gate){
    const section=gate.querySelector("#thebe-ai");
    if(!section)return;

    text(section.querySelector(".kicker"),"Thebe AI");
    text(section.querySelector("h2"),"An AI operator that understands the page you are on.");
    text(
      section.querySelector(".section-head p"),
      "Ask what changed, what needs attention or what to do next. Thebe uses the business context already in the workspace while important business actions remain human-reviewed."
    );

    const prompts=[...section.querySelectorAll(".ai-prompt")];
    const labels=["Brief me on this page","What needs attention?","Prepare the next action"];
    prompts.slice(0,3).forEach((prompt,index)=>text(prompt,labels[index]));
    prompts.slice(3).forEach(prompt=>prompt.remove());
  }

  function concisePlan(card,index){
    const headings=["Monitor","Business","Control"];
    const descriptions=[
      "For owners who need visibility, reminders and a clear operating view.",
      "For growing SMEs running staff, licences, tenders and recurring work.",
      "For multi-branch or higher-control operations that need deeper oversight."
    ];
    if(headings[index])text(card.querySelector("h3"),headings[index]);
    const descriptor=card.querySelector(".muted.small, p");
    if(descriptor&&descriptions[index])text(descriptor,descriptions[index]);

    const list=card.querySelector("ul");
    if(!list||card.querySelector("details.plan-more"))return;
    const items=[...list.children].filter(node=>node.tagName==="LI");
    if(items.length<=4)return;

    const details=make("details","plan-more");
    const summary=make("summary","","See all features");
    const extraList=make("ul","plan-more-list");
    items.slice(4).forEach(item=>extraList.append(item));
    details.append(summary,extraList);
    list.insertAdjacentElement("afterend",details);
  }

  function updatePricing(gate){
    const pricing=gate.querySelector("#pricing");
    if(!pricing)return;

    text(pricing.querySelector("h2"),"Start with the control you need. Upgrade when the business grows.");
    text(pricing.querySelector(".section-head p"),"Five plans. One workspace. Start lean, then scale as the business needs more control.");

    const cards=[...pricing.querySelectorAll(".pricecard")];
    cards.forEach((card,index)=>{
      card.dataset.marketPlanIndex=String(index);
      concisePlan(card,index);
      const button=card.querySelector(".marketing-start-action");
      if(button)text(button,"Start free for 14 days");
    });
  }

  function updateBotswana(gate){
    const section=gate.querySelector("#botswana-compliance");
    if(!section)return;
    text(section.querySelector(".kicker"),"Live in Botswana · Namibia next");
    text(section.querySelector("h2"),"Local where it matters. Built to expand across Africa.");
    text(
      section.querySelector(".section-head p"),
      "Botswana is Thebe Desk’s live launch market. CIPA, BURS, licences, employment and evidence stay locally grounded while the same Money · Work · People · Protect operating model expands market by market."
    );
  }

  function updateFinal(gate){
    const box=gate.querySelector(".final .cta-box");
    if(!box)return;
    text(box.querySelector("h2"),"Run the business from one desk.");
    text(box.querySelector("p"),"Money. People. Work. Compliance. Thebe AI helps you see what needs attention next.");
  }

  function apply(){
    const gate=document.getElementById("marketingGate");
    if(!gate)return;
    updateHero(gate);
    updateAi(gate);
    updatePricing(gate);
    updateBotswana(gate);
    updateFinal(gate);
    gate.dataset.marketRefinementV21=VERSION;
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{
      apply();
      setTimeout(apply,0);
      setTimeout(apply,300);
    },{once:true});
  }else{
    apply();
    setTimeout(apply,0);
  }
})();
