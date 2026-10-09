(()=>{
  function text(node,value){if(node)node.textContent=value}
  function make(tag,className,content){const node=document.createElement(tag);if(className)node.className=className;if(content!=null)node.textContent=content;return node}
  function setMeta(name,content){const node=document.querySelector(`meta[name="${name}"]`);if(node)node.setAttribute("content",content)}
  function setProperty(property,content){const node=document.querySelector(`meta[property="${property}"]`);if(node)node.setAttribute("content",content)}
  function pillar(title,kicker,copy,signal){
    const card=make("article","pillar-card");
    card.append(make("div","pillar-kicker",kicker),make("h3","",title),make("p","",copy),make("div","pillar-signal",signal));
    return card
  }
  function proofStep(number,title,copy){
    const step=make("div","proof-step");
    step.append(make("em","",String(number)),make("b","",title),make("span","",copy));
    return step
  }
  function init(){
    const gate=document.getElementById("marketingGate");
    if(!gate||gate.dataset.publicStoryV249==="1")return;
    gate.dataset.publicStoryV249="1";

    document.title="Thebe Desk | Run Your Business from One Intelligent Desk";
    const description="Run money, work, people and business protection from one intelligent desk. Thebe Desk connects operations, finance, compliance, evidence and decision support for Botswana businesses, with Africa-ready expansion.";
    setMeta("description",description);
    setProperty("og:title","Thebe Desk | Run Your Business from One Intelligent Desk");
    setProperty("og:description","Money, work, people and protection in one intelligent business workspace. Live in Botswana.");

    const eyebrow=gate.querySelector(".hero .eyebrow");
    if(eyebrow){eyebrow.dataset.v249Eyebrow="1";eyebrow.replaceChildren(make("span","dot"),document.createTextNode("AI operating layer for African business · Live in Botswana"))}
    text(gate.querySelector(".hero h1"),"Run your whole business from one intelligent desk.");
    const heroCopy=gate.querySelector(".hero h1 + p");
    if(heroCopy){heroCopy.dataset.v249Subline="1";text(heroCopy,"See your money, work, people and business protection in one place. Thebe shows what needs attention, connects the supporting evidence and helps you move the next action forward.")}

    const navFeature=gate.querySelector('.nav .links a[href="#features"]');
    if(navFeature){text(navFeature,"How it works");navFeature.dataset.v249Nav="pillars"}

    const ribbon=gate.querySelector(".hero .control-ribbon");
    if(ribbon){
      ribbon.dataset.v249Pillars="1";
      ribbon.setAttribute("aria-label","Thebe Desk business pillars");
      ribbon.replaceChildren(...["Money","Work","People","Protect"].map(label=>make("span","",label)))
    }

    const snapshot=gate.querySelector(".product-snapshot");
    if(snapshot){
      snapshot.dataset.v249Snapshot="1";
      text(snapshot.querySelector(".product-snapshot-head b"),"Your business at a glance");
      text(snapshot.querySelector(".status-chip"),"Owner brief");
      const rows=[
        ["Money","Cash and receivables signals"],
        ["Work","Priority actions grouped"],
        ["People","People controls visible"],
        ["Protect","Evidence linked to obligations"]
      ];
      snapshot.querySelectorAll(".signal-row").forEach(row=>row.remove());
      for(const [label,value] of rows){const row=make("div","signal-row");row.append(make("span","",label),make("strong","",value));snapshot.append(row)}
    }

    const features=gate.querySelector("#features");
    if(features){
      features.dataset.v249PillarsSection="1";
      text(features.querySelector(".kicker"),"Money · Work · People · Protect");
      text(features.querySelector("h2"),"Know what is happening across the business—and what needs your attention next.");
      text(features.querySelector(".section-head p"),"Thebe turns scattered business information into four clear operating views. Each view connects signals to actions, owners and evidence instead of leaving you with another dashboard to interpret.");
      const oldGrid=features.querySelector(".featuregrid");
      if(oldGrid){
        const grid=make("div","pillar-grid");
        grid.append(
          pillar("Money","01 · Financial control","See cash movement, receivables, reconciliation and the financial signals that need an owner decision.","From numbers → next financial action"),
          pillar("Work","02 · Execution","Bring priorities, deadlines, sites, projects and operating exceptions into one action surface.","From activity → owned work"),
          pillar("People","03 · Team control","Keep employee records, reporting, accountability and people-risk workflows visible without exposing owner-only information.","From people data → responsible follow-through"),
          pillar("Protect","04 · Compliance & evidence","Connect CIPA, BURS, licences, employment duties, tenders and supporting proof to the business actions they affect.","From obligation → defensible evidence")
        );
        oldGrid.replaceWith(grid);
        const proof=make("div","proof-panel");
        proof.setAttribute("aria-label","Thebe Desk evidence flow");
        proof.append(make("div","kicker","Evidence, not assumptions"),make("h3","","Thebe shows its work."),make("p","","A reminder tells you when something matters. Thebe’s operating model keeps the source, responsibility, action and proof connected so a status can be reviewed instead of merely trusted."));
        const flow=make("div","proof-flow");
        flow.append(
          proofStep(1,"Source","Start from a business fact, official requirement or verified internal record."),
          proofStep(2,"Requirement","Translate the source into the obligation, risk or operating condition that matters."),
          proofStep(3,"Action","Assign the next step to the right owner with context and a clear boundary."),
          proofStep(4,"Evidence","Keep the receipt, record, document or supporting proof connected to the action."),
          proofStep(5,"Review","Show what is complete, what is uncertain and where human judgement is still required.")
        );
        proof.append(flow);
        const workflow=features.querySelector(".workflow-strip");
        if(workflow)workflow.insertAdjacentElement("afterend",proof);else grid.insertAdjacentElement("afterend",proof)
      }
    }

    const botswana=gate.querySelector("#botswana-compliance");
    if(botswana){
      text(botswana.querySelector(".kicker"),"Built for Botswana business");
      text(botswana.querySelector("h2"),"Local business reality, connected to one operating system.");
      text(botswana.querySelector(".section-head p"),"Botswana is Thebe Desk’s live launch market. Company records, tax, employment, licences, tender readiness and evidence remain locally grounded while the core Money · Work · People · Protect model can expand market by market across Africa.");
      const compliance=botswana.querySelector(".compliance");
      if(compliance&&!botswana.querySelector(".country-links")){
        const links=make("nav","country-links");
        links.setAttribute("aria-label","Botswana business guidance");
        const items=[
          ["CIPA","/cipa-compliance-botswana/"],["BURS tax","/burs-tax-compliance-botswana/"],["Licences","/business-licences-botswana/"],["Employment","/employment-compliance-botswana/"],["Tender readiness","/tender-readiness-botswana/"],["Evidence","/compliance-evidence-botswana/"]
        ];
        for(const [label,href] of items){const link=make("a","",label);link.href=href;links.append(link)}
        compliance.insertAdjacentElement("afterend",links)
      }
    }

    const pricing=gate.querySelector("#pricing");
    if(pricing){
      text(pricing.querySelector("h2"),"Choose the level of control your business needs now.");
      text(pricing.querySelector(".section-head p"),"Start with the operating controls you need today and move up as locations, staff, reporting, evidence and AI usage grow. Every new workspace starts with a 14-day trial.")
    }

    const trustItems=gate.querySelectorAll("#trust .trustitem");
    if(trustItems[0]){text(trustItems[0].querySelector("b"),"Botswana-first");text(trustItems[0].querySelector("div"),"Live local business intelligence now, with one core platform designed to expand market by market.")}

    const final=gate.querySelector(".final .cta-box");
    if(final){text(final.querySelector("h2"),"Put the whole business on one desk.");text(final.querySelector("p"),"Start with Money, Work, People and Protect—then let Thebe help you focus on what needs attention next.")}
    const footerLead=gate.querySelector(".footerin > div:first-child");
    if(footerLead)footerLead.textContent="© 2026 Thebe Desk · Money · Work · People · Protect · Live in Botswana.";
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
