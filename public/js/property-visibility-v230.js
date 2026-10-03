(function(global){
  "use strict";
  const RELEASE="20261001-property-visible-v230";
  const COMPACT_RELEASE="20261003-property-compact-ai-v260";
  let propertyAiPending=false;
  let compactObserver=null;

  function visible(node){
    if(!node)return false;
    const style=global.getComputedStyle?.(node);
    const rect=node.getBoundingClientRect?.();
    return !!style&&style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity||1)>0&&!!rect&&rect.width>0&&rect.height>0;
  }
  function repairNode(node,display){
    if(!node)return;
    node.hidden=false;
    node.removeAttribute("hidden");
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
    node.style.removeProperty("visibility");
    node.style.removeProperty("opacity");
    if(global.getComputedStyle?.(node)?.display==="none")node.style.setProperty("display",display,"important");
  }
  function ensurePropertyVisible(){
    const view=document.getElementById("propertyintelligence");
    if(!view||!view.classList.contains("active"))return false;
    repairNode(view,"block");
    const layout=view.querySelector(".property-layout-v224");
    const calculator=view.querySelector(".property-calculator-v224");
    const price=view.querySelector("#propertyPurchasePrice");
    const rent=view.querySelector("#propertyMonthlyRent");
    const analyse=view.querySelector(".property-analyse-button");
    repairNode(layout,"block");
    repairNode(calculator,"block");
    for(const node of [layout,calculator])if(node){
      node.style.setProperty("width","100%","important");
      node.style.setProperty("max-width","680px","important");
      node.style.setProperty("min-width","0","important");
      node.style.setProperty("margin-inline","auto","important");
      node.style.setProperty("box-sizing","border-box","important");
    }
    repairNode(view.querySelector(".property-quick-rows"),"grid");
    view.querySelectorAll(".property-input-row").forEach(node=>repairNode(node,"flex"));
    repairNode(view.querySelector(".property-input-pair"),"grid");
    repairNode(analyse,"block");
    const ok=[calculator,price,rent,analyse].every(visible);
    view.dataset.propertyVisibility=ok?"ready":"repairing";
    return ok;
  }

  function compactButton(label,targetSelector){
    const button=document.createElement("button");
    button.type="button";
    button.textContent=label;
    button.dataset.propertyTarget=targetSelector;
    button.addEventListener("click",()=>{
      const view=document.getElementById("propertyintelligence");
      const target=view?.querySelector(targetSelector);
      if(target){
        target.scrollIntoView({behavior:"smooth",block:"start"});
        target.setAttribute("tabindex","-1");
        target.focus({preventScroll:true});
      }
      document.querySelectorAll(".property-primary-v260 button").forEach(node=>node.classList.toggle("active",node===button));
    });
    return button;
  }

  function mountCompactPropertyChrome(){
    const view=document.getElementById("propertyintelligence");
    if(!view)return false;
    view.classList.add("property-compact-v260");
    view.dataset.propertyCompactRelease=COMPACT_RELEASE;
    if(!view.querySelector(".property-primary-v260")){
      const nav=document.createElement("nav");
      nav.className="property-primary-v260";
      nav.setAttribute("aria-label","Property workspace");
      nav.append(
        compactButton("Today",".property-hero-compact"),
        compactButton("Properties","#propertyPortfolioWorkspace"),
        compactButton("Analyse",".property-calculator-v224"),
        compactButton("Operations","#propertyValuationServicePanel")
      );
      const hero=view.querySelector(".property-hero-compact");
      if(hero)hero.insertAdjacentElement("afterend",nav);else view.prepend(nav);
      nav.querySelector("button")?.classList.add("active");
    }
    const calculator=view.querySelector(".property-calculator-v224");
    if(calculator)calculator.setAttribute("data-property-pane","analyse");
    const portfolio=view.querySelector("#propertyPortfolioWorkspace");
    if(portfolio)portfolio.setAttribute("data-property-pane","properties");
    const operations=view.querySelector("#propertyValuationServicePanel");
    if(operations)operations.setAttribute("data-property-pane","operations");
    return true;
  }

  function ensureCompactObserver(){
    const view=document.getElementById("propertyintelligence");
    if(!view||compactObserver)return;
    compactObserver=new MutationObserver(()=>{
      if(!view.classList.contains("active"))return;
      mountCompactPropertyChrome();
    });
    compactObserver.observe(view,{childList:true,subtree:true});
  }

  function propertyPromptSnapshot(){
    const get=id=>String(document.getElementById(id)?.value||"").trim();
    const name=get("propertyDealName")||"Current property scenario";
    const price=get("propertyPurchasePrice");
    const rent=get("propertyMonthlyRent");
    const bits=[name];
    if(price)bits.push(`purchase price P${price}`);
    if(rent)bits.push(`monthly rent P${rent}`);
    return bits.join(" · ");
  }

  function clearPropertyAiConversation(){
    const question=document.getElementById("aiAdvisorQuestion");
    const output=document.getElementById("aiAdvisorOutput");
    if(question){question.value="";question.focus()}
    if(output){
      const empty=document.createElement("div");
      empty.className="property-ai-empty-v260";
      const heading=document.createElement("b");
      heading.textContent="Property AI";
      const detail=document.createElement("span");
      detail.textContent="Ask about this deal, documents, risk, cash flow or next actions.";
      empty.append(heading,detail);
      output.replaceChildren(empty);
      output.className="copilot-empty";
    }
  }

  function closePropertyAi(){
    document.body.classList.remove("property-ai-fullscreen-v260");
    document.documentElement.removeAttribute("data-property-ai-source");
    propertyAiPending=false;
    if(typeof global.showView==="function")global.showView("propertyintelligence");
  }

  function activatePropertyAiVoice(){
    const candidate=document.querySelector("[data-thebe-voice],#thebeVoiceButton,.thebe-voice-button,[data-bw-onclick*='Voice'],[data-bw-onclick*='voice']");
    if(candidate&&typeof candidate.click==="function"){candidate.click();return}
    document.getElementById("aiAdvisorQuestion")?.focus();
  }

  function mountPropertyAiToolbar(){
    const view=document.getElementById("aiservices");
    if(!view)return false;
    document.body.classList.add("property-ai-fullscreen-v260");
    document.documentElement.dataset.propertyAiSource="property";
    let toolbar=view.querySelector(".property-ai-toolbar-v260");
    if(!toolbar){
      toolbar=document.createElement("header");
      toolbar.className="property-ai-toolbar-v260";
      const back=document.createElement("button");back.type="button";back.className="property-ai-back-v260";back.textContent="←";back.setAttribute("aria-label","Back to Property");back.addEventListener("click",closePropertyAi);
      const title=document.createElement("div");title.className="property-ai-title-v260";
      const titleName=document.createElement("b");titleName.textContent="Property AI";
      const titleDetail=document.createElement("span");titleDetail.textContent="Grounded in the current Property workspace";
      title.append(titleName,titleDetail);
      const context=document.createElement("button");context.type="button";context.className="property-ai-chip-v260";context.textContent="+ Context";context.addEventListener("click",()=>{const q=document.getElementById("aiAdvisorQuestion");if(q){q.value=`Use this Property context: ${propertyPromptSnapshot()}. `+q.value;q.focus()}});
      const fresh=document.createElement("button");fresh.type="button";fresh.className="property-ai-icon-v260";fresh.textContent="＋";fresh.title="New chat";fresh.setAttribute("aria-label","New Property AI chat");fresh.addEventListener("click",clearPropertyAiConversation);
      const voice=document.createElement("button");voice.type="button";voice.className="property-ai-icon-v260 property-ai-voice-v260";voice.textContent="◉";voice.title="Voice";voice.setAttribute("aria-label","Open voice");voice.addEventListener("click",activatePropertyAiVoice);
      toolbar.append(back,title,context,fresh,voice);
      view.prepend(toolbar);
    }
    const question=document.getElementById("aiAdvisorQuestion");
    if(question){
      question.placeholder="Message Property AI…";
      question.setAttribute("aria-label","Message Property AI");
    }
    const mode=document.getElementById("aiAdvisorMode");
    if(mode&&mode.value!=="ask")mode.value="ask";
    global.setTimeout?.(()=>question?.focus(),80);
    return true;
  }

  function markPropertyAiSource(event){
    const trigger=event.target?.closest?.("[data-bw-onclick*='askThebeAboutProperty']");
    if(!trigger)return;
    propertyAiPending=true;
    document.documentElement.dataset.propertyAiSource="property";
  }

  function schedule(){
    ensurePropertyVisible();
    mountCompactPropertyChrome();
    ensureCompactObserver();
    global.requestAnimationFrame?.(()=>global.requestAnimationFrame?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome()}));
    global.setTimeout?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome()},180);
    global.setTimeout?.(()=>{ensurePropertyVisible();mountCompactPropertyChrome()},600);
  }

  document.addEventListener("click",markPropertyAiSource,true);
  global.addEventListener("thebe:workspace-view-change",event=>{
    const id=String(event?.detail?.id||"");
    if(id==="propertyintelligence"){
      document.body.classList.remove("property-ai-fullscreen-v260");
      schedule();
      return;
    }
    if(id==="aiservices"&&(propertyAiPending||document.documentElement.dataset.propertyAiSource==="property")){
      global.requestAnimationFrame?.(()=>mountPropertyAiToolbar());
      global.setTimeout?.(mountPropertyAiToolbar,80);
      return;
    }
    if(id!=="aiservices")document.body.classList.remove("property-ai-fullscreen-v260");
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});else schedule();
  global.ThebePropertyVisibility=Object.freeze({
    release:RELEASE,
    compactRelease:COMPACT_RELEASE,
    repair:ensurePropertyVisible,
    mount:mountCompactPropertyChrome,
    openAi:()=>{propertyAiPending=true;return mountPropertyAiToolbar()},
    closeAi:closePropertyAi,
    state:()=>({ready:ensurePropertyVisible(),compact:!!document.getElementById("propertyintelligence")?.classList.contains("property-compact-v260"),aiFullscreen:document.body.classList.contains("property-ai-fullscreen-v260")})
  });
})(window);
