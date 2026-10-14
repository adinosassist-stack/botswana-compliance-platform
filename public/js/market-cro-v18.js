(()=>{
  "use strict";

  function make(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!=null)node.textContent=text;
    return node;
  }

  function isPricingCta(node){return Boolean(node.closest("#pricing"))}

  function simplifyHero(gate){
    const hero=gate.querySelector(".hero");
    if(!hero)return;

    // Keep the real Botswana business-owner photograph as human context.
    // The sanitized product snapshot remains the primary product proof beneath it.
    const photo=hero.querySelector(".market-hero-photo");
    if(photo)photo.dataset.marketHumanContext="1";

    const eyebrow=hero.querySelector(".eyebrow");
    if(eyebrow){
      eyebrow.replaceChildren();
      const dot=make("span","dot");
      dot.setAttribute("aria-hidden","true");
      eyebrow.append(dot,document.createTextNode("Built for Botswana SMEs"));
    }

    const copy=hero.querySelector(".hero-grid>div:first-child>p");
    if(copy)copy.textContent="Keep money, people, daily work and business obligations in one clear operating view. See what needs attention next and keep the proof behind the work.";

    const secondary=hero.querySelector(".hero-cta .btn.secondary");
    if(secondary){secondary.textContent="See how Thebe works";secondary.href="#product"}

    const reassurance=hero.querySelector(".reassure");
    if(reassurance)reassurance.textContent="14 days free · No card required · Pula pricing";

    hero.querySelector(".control-ribbon")?.remove();
    gate.querySelector(".proof-strip")?.remove();
  }

  function standardizeTrialCtas(gate){
    gate.querySelectorAll(".marketing-start-action").forEach(action=>{
      if(isPricingCta(action)){
        action.textContent="Start free for 14 days";
        return;
      }
      action.href="/auth/?mode=register";
      action.textContent=action.closest(".nav")?"Start free":"Start free for 14 days";
      action.dataset.trialEntry="neutral";
    });
  }

  function tightenAi(gate){
    const section=gate.querySelector("#thebe-ai");
    if(!section)return;
    const prompts=[...section.querySelectorAll(".ai-prompt")];
    prompts.slice(3).forEach(node=>node.remove());
    const safety=section.querySelector(".ai-safety");
    if(safety)safety.textContent="Business-aware · role-aware · human-reviewed. Thebe can prepare and suggest; important business decisions remain with people.";
  }

  function clarifyPricing(gate){
    const section=gate.querySelector("#pricing");
    if(!section)return;
    const cards=[...section.querySelectorAll(".pricecard")];
    const middle=cards[1];
    if(middle){
      const title=middle.querySelector("h3");
      if(title)title.textContent="Business";
      middle.dataset.displayPlan="business";
      const label=middle.querySelector(".label");
      if(label)label.textContent="Best for growing SMEs";
    }
    const control=cards[2];
    if(control){
      const first=control.querySelector("li");
      if(first&&first.textContent.trim()==="Everything in Protect")first.textContent="Everything in Business";
    }
    cards.forEach(card=>{
      const action=card.querySelector(".marketing-start-action");
      if(action)action.textContent="Start free for 14 days";
    });

    const note=section.querySelector(".payment-note");
    if(note){
      const heading=note.querySelector("h3");
      if(heading)heading.textContent="After your free trial";
      const steps=note.querySelector(".payment-steps");
      if(steps){
        steps.setAttribute("aria-label","Paid plan activation steps");
        steps.setAttribute("role","list");
        steps.querySelectorAll("span").forEach(step=>step.setAttribute("role","listitem"));
      }
    }
  }

  function fixFinalCta(gate){
    const final=gate.querySelector(".final .cta-box");
    if(!final)return;
    const trial=final.querySelector(".marketing-start-action");
    const whatsapp=[...final.querySelectorAll("a")].find(a=>a.href.includes("wa.me"));
    if(trial){trial.classList.remove("secondary");trial.classList.add("primary")}
    if(whatsapp){whatsapp.classList.remove("primary");whatsapp.classList.add("secondary","whatsapp-secondary")}
    const paragraph=final.querySelector("p");
    if(paragraph)paragraph.textContent="14 days free · No card required · Built for Botswana SMEs";
  }

  function init(){
    const gate=document.getElementById("marketingGate");
    if(!gate||gate.dataset.marketCroV18==="1")return;
    gate.dataset.marketCroV18="1";
    simplifyHero(gate);
    tightenAi(gate);
    clarifyPricing(gate);
    fixFinalCta(gate);
    standardizeTrialCtas(gate);
  }

  const run=()=>requestAnimationFrame(init);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();
})();
