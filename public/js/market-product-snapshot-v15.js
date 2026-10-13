(()=>{
  "use strict";

  function make(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!=null)node.textContent=text;
    return node;
  }

  function metric(value,label){
    const node=make("div","snapshot-metric");
    node.append(make("b",null,value),make("span",null,label));
    return node;
  }

  function attention(title,detail,state){
    const row=make("div","snapshot-attention-row");
    const dot=make("span","snapshot-attention-dot");
    dot.setAttribute("aria-hidden","true");
    const copy=make("div","snapshot-attention-copy");
    copy.append(make("b",null,title),make("small",null,detail));
    row.append(dot,copy,make("strong",null,state));
    return row;
  }

  function navItem(label,active=false){
    return make("span",active?"active":"",label);
  }

  function buildSnapshot(stage){
    stage.classList.add("market-product-snapshot-v15");
    stage.setAttribute("aria-label","Thebe Desk product snapshot using demo data");

    const top=make("div","stage-top snapshot-top");
    const brand=make("div","stage-brand");
    const logo=make("img");
    logo.src="/assets/thebe-desk-logo-symbol.png";
    logo.alt="";
    brand.append(logo,document.createTextNode("Thebe Desk"));
    top.append(brand,make("span","stage-live snapshot-badge","Product snapshot · demo data"));

    const body=make("div","stage-body snapshot-body");
    const nav=make("div","stage-nav snapshot-nav");
    nav.append(
      navItem("Today",true),
      navItem("Money"),
      navItem("Work"),
      navItem("People"),
      navItem("Protect"),
      navItem("Property")
    );

    const main=make("div","stage-main snapshot-main");
    const heading=make("div","snapshot-heading");
    const headingCopy=make("div");
    headingCopy.append(
      make("div","stage-kicker","Owner workspace · Today"),
      make("h2",null,"What needs attention")
    );
    heading.append(headingCopy,make("span","snapshot-live-pill","Current view"));

    const metrics=make("div","snapshot-metrics");
    metrics.append(
      metric("3","priority items"),
      metric("2","control reviews"),
      metric("1","proof gap")
    );

    const attentionList=make("div","snapshot-attention");
    attentionList.append(
      attention("Business licence","Review in 34 days","Review"),
      attention("Employee evidence","1 required record missing","Open"),
      attention("Collections follow-up","Owner review needed","Check")
    );

    const lower=make("div","snapshot-lower");
    const protect=make("div","snapshot-panel snapshot-protect");
    const protectHead=make("div","snapshot-panel-head");
    protectHead.append(make("span",null,"Protect"),make("strong",null,"Control health"));
    const controlLine=make("div","snapshot-control-line");
    controlLine.append(
      make("b",null,"6 passing"),
      make("span",null,"2 attention")
    );
    protect.append(protectHead,controlLine,make("small",null,"Actions, deadlines and proof stay connected."));

    const ai=make("div","snapshot-panel snapshot-ai");
    const aiHead=make("div","snapshot-panel-head");
    aiHead.append(make("span",null,"Thebe AI"),make("strong",null,"Workspace intelligence"));
    const prompt=make("div","snapshot-ai-prompt");
    prompt.append(
      make("span",null,"What needs management attention today?"),
      make("b",null,"→")
    );
    ai.append(aiHead,prompt);
    lower.append(protect,ai);

    main.append(heading,metrics,attentionList,lower);
    body.append(nav,main);

    const note=make("div","preview-note snapshot-note","Built from current Thebe Desk workspace patterns · demo data only · no customer workspace data is loaded here.");
    stage.replaceChildren(top,body,note);
  }

  function init(){
    const gate=document.getElementById("marketingGate");
    if(!gate||gate.dataset.marketProductSnapshotV15==="1")return;
    const stage=gate.querySelector(".market-hero-visual .product-stage");
    if(!stage)return;
    gate.dataset.marketProductSnapshotV15="1";
    buildSnapshot(stage);
  }

  const run=()=>queueMicrotask(init);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();
})();
