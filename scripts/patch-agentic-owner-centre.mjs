import fs from 'node:fs';

const jsPath='public/js/owner-command-centre.js';
const indexPath='public/index.html';
let js=fs.readFileSync(jsPath,'utf8');
let html=fs.readFileSync(indexPath,'utf8');

function replaceOnce(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(needle,replacement);
}

js=replaceOnce(js,'const RELEASE="20260913b";','const RELEASE="20260913c";','browser release');
js=replaceOnce(
  js,
  '  let stateWriteQueue=Promise.resolve();\n',
  '  let stateWriteQueue=Promise.resolve();\n  let agenticLatestPlan=null;\n  let agenticBusy=false;\n',
  'agentic state'
);

const agenticFunctions=String.raw`
  function agenticStatusNode(){return q("#ownerAgenticStatus")}

  function agenticPolicyLabel(proposal){
    if(proposal?.execution_policy==="prohibited_autonomy"||proposal?.executionPolicy==="prohibited_autonomy")return "Human-only · autonomy prohibited";
    if(proposal?.authority==="approval_required")return "Approval required · no execution";
    return "Recommendation only · no execution";
  }

  function agenticProposalTone(proposal){
    const risk=String(proposal?.risk||"").toLowerCase();
    return risk==="high"?"risk":risk==="low"?"positive":"neutral";
  }

  async function decideAgenticProposal(proposalId,decision){
    const status=agenticStatusNode();
    if(agenticBusy)return;
    agenticBusy=true;
    if(status)status.textContent=decision==="approve"?"Recording approval…":"Recording rejection…";
    try{
      const result=await request(`/api/agentic/proposals/${encodeURIComponent(proposalId)}/${decision}`,{
        method:"POST",
        body:"{}"
      });
      const nextStatus=String(result?.status||"");
      if(agenticLatestPlan?.proposals){
        const local=agenticLatestPlan.proposals.find(item=>String(item?.id||"")===String(proposalId));
        if(local&&nextStatus)local.status=nextStatus;
      }
      if(status)status.textContent=result?.execution?.performed===false
        ?"Decision recorded. No action was executed."
        :"Decision recorded.";
      await renderAgenticGovernance(false);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not record decision").slice(0,180);
    }finally{
      agenticBusy=false;
    }
  }

  function agenticProposalCard(proposal){
    const card=document.createElement("article");
    card.className="owner-agentic-proposal";
    card.dataset.tone=agenticProposalTone(proposal);

    const top=document.createElement("div");
    top.className="owner-agentic-proposal-head";
    const copy=document.createElement("div");
    copy.append(
      text("span",`Priority ${String(proposal?.priority||"medium")}`,"owner-agentic-kicker"),
      text("h5",proposal?.title||"Governed recommendation")
    );
    const badges=document.createElement("div");
    badges.className="owner-agentic-badges";
    badges.append(
      text("span",String(proposal?.risk||"medium").toUpperCase(),`owner-agentic-risk ${String(proposal?.risk||"medium")}`),
      text("span",String(proposal?.status||"pending").toUpperCase(),`owner-agentic-status-badge ${String(proposal?.status||"pending")}`)
    );
    top.append(copy,badges);
    card.append(top);

    if(proposal?.reason)card.append(text("p",proposal.reason,"owner-agentic-reason"));
    card.append(text("div",agenticPolicyLabel(proposal),"owner-agentic-policy"));

    const refs=Array.isArray(proposal?.sourceRefs)?proposal.sourceRefs:[];
    if(refs.length){
      const sourceRow=document.createElement("div");
      sourceRow.className="owner-agentic-sources";
      refs.slice(0,8).forEach(ref=>sourceRow.append(text("span",ref,"owner-agentic-source")));
      card.append(sourceRow);
    }

    if(String(proposal?.status||"pending")==="pending"){
      const actions=document.createElement("div");
      actions.className="owner-agentic-actions";
      if(role()==="owner"){
        actions.append(button("Record approval",()=>decideAgenticProposal(proposal.id,"approve"),"btn soft"));
      }
      if(["owner","manager"].includes(role())){
        actions.append(button("Reject",()=>decideAgenticProposal(proposal.id,"reject"),"btn soft"));
      }
      if(actions.childNodes.length)card.append(actions);
    }
    return card;
  }

  function renderAgenticSnapshot(statusPayload,runsPayload){
    const body=q("#ownerAgenticBody");
    if(!body)return;
    body.replaceChildren();

    const controls=document.createElement("div");
    controls.className="owner-agentic-controls";
    const copy=document.createElement("div");
    copy.append(
      text("b","Governed planning is active."),
      text("span","Thebe may observe, reason, simulate and recommend. Approval records intent for audit; it does not execute an action.")
    );
    const buttons=document.createElement("div");
    buttons.className="owner-agentic-control-buttons";
    if(["owner","manager"].includes(role())){
      const generate=button(agenticBusy?"Generating…":"Generate governed plan",generateAgenticPlan,"btn");
      generate.disabled=agenticBusy;
      buttons.append(generate);
    }
    buttons.append(button("Refresh",()=>renderAgenticGovernance(true),"btn alt"));
    controls.append(copy,buttons);
    body.append(controls);

    const boundary=document.createElement("div");
    boundary.className="owner-agentic-boundary";
    boundary.append(
      text("span","Stage 1 · execution disabled","badge"),
      text("span",`${Array.isArray(statusPayload?.prohibitedAutonomy)?statusPayload.prohibitedAutonomy.length:0} high-impact autonomy classes remain prohibited.`)
    );
    body.append(boundary);

    const latestRun=agenticLatestPlan?.run||(Array.isArray(runsPayload?.items)?runsPayload.items[0]:null);
    if(!latestRun){
      body.append(text("div","No governed plan has been generated for this workspace yet. Generate one to turn current finance and operating signals into auditable proposals.","owner-command-empty"));
      return;
    }

    const runCard=document.createElement("div");
    runCard.className="owner-agentic-run";
    const confidence=String(latestRun?.confidence||"medium");
    const mode=String(latestRun?.generationMode||latestRun?.generation_mode||"governed").replaceAll("_"," ");
    runCard.append(
      text("span",`${confidence.toUpperCase()} confidence · ${mode}`,"owner-agentic-kicker"),
      text("h4",latestRun?.goal||"Latest governed plan"),
      text("p",latestRun?.summary||"Plan generated from current tenant-scoped business signals.")
    );
    body.append(runCard);

    let proposals=[];
    if(agenticLatestPlan?.run?.id===latestRun?.id&&Array.isArray(agenticLatestPlan?.proposals)){
      proposals=agenticLatestPlan.proposals;
    }else if(Array.isArray(runsPayload?.proposals)){
      proposals=runsPayload.proposals.filter(item=>String(item?.run_id||"")===String(latestRun?.id||""));
    }

    const list=document.createElement("div");
    list.className="owner-agentic-proposals";
    if(proposals.length){
      proposals.sort((a,b)=>Number(a?.ordinal||0)-Number(b?.ordinal||0)).forEach(item=>list.append(agenticProposalCard(item)));
    }else{
      list.append(text("div","This plan has no pending proposals. Thebe will remain conservative rather than manufacture an action.","owner-command-empty"));
    }
    body.append(list);
  }

  async function renderAgenticGovernance(force=false){
    const body=q("#ownerAgenticBody");
    if(!body)return;
    if(force)agenticLatestPlan=null;
    const status=agenticStatusNode();
    if(status)status.textContent="Refreshing governed plan…";
    try{
      const [statusPayload,runsPayload]=await Promise.all([
        request("/api/agentic/status"),
        request("/api/agentic/runs")
      ]);
      renderAgenticSnapshot(statusPayload,runsPayload);
      if(status)status.textContent="Execution remains disabled";
    }catch(error){
      body.replaceChildren(text(
        "div",
        "Governed planning is temporarily unavailable. No fallback action will be executed.",
        "owner-command-empty"
      ));
      if(status)status.textContent=String(error?.message||"Agentic planning unavailable").slice(0,180);
    }
  }

  async function generateAgenticPlan(){
    if(agenticBusy)return;
    agenticBusy=true;
    const status=agenticStatusNode();
    if(status)status.textContent="Observing business state and generating a governed plan…";
    try{
      agenticLatestPlan=await request("/api/agentic/plan",{
        method:"POST",
        body:JSON.stringify({goal:"Protect the business and identify the safest next actions from current authoritative workspace signals."})
      });
      if(status)status.textContent="Plan generated. Review proposals before recording any decision.";
      await renderAgenticGovernance(false);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not generate governed plan").slice(0,180);
    }finally{
      agenticBusy=false;
      const buttonNode=q("#ownerAgenticBody .owner-agentic-control-buttons .btn");
      if(buttonNode)buttonNode.disabled=false;
    }
  }

`;
js=replaceOnce(js,'  function createShell(){',agenticFunctions+'  function createShell(){','agentic functions');

const shellInsert=String.raw`    const agentic=document.createElement("section");
    agentic.className="owner-agentic-panel";
    agentic.id="ownerAgenticPanel";
    const agenticHead=document.createElement("div");
    agenticHead.className="owner-agentic-head";
    const agenticCopy=document.createElement("div");
    agenticCopy.append(
      text("div","Thebe AI · governed decisions","section-eyebrow"),
      text("h4","Observe → reason → simulate → recommend → approve"),
      text("p","Thebe can prepare auditable next-action proposals from tenant-scoped business data. Stage 1 cannot execute those proposals.","muted")
    );
    const agenticStatus=text("span","Execution disabled","owner-input-status");
    agenticStatus.id="ownerAgenticStatus";
    agenticHead.append(agenticCopy,agenticStatus);
    const agenticBody=document.createElement("div");
    agenticBody.className="owner-agentic-body";
    agenticBody.id="ownerAgenticBody";
    agentic.append(agenticHead,agenticBody);
    shell.append(agentic);

`;
js=replaceOnce(js,'    shell.append(grid);\n\n    const salesDetails=',`    shell.append(grid);\n\n${shellInsert}    const salesDetails=`,'agentic shell');
js=replaceOnce(js,'      renderInputs(inputs);\n','      renderInputs(inputs);\n      await renderAgenticGovernance();\n','agentic render');
js=replaceOnce(
  js,
  '    openSales:openSalesWorkspace\n',
  '    openSales:openSalesWorkspace,\n    refreshAgentic:()=>renderAgenticGovernance(true),\n    generatePlan:generateAgenticPlan\n',
  'owner command exports'
);

html=html.replace(/owner-command-centre\.js\?v=[^"']+/g,'owner-command-centre.js?v=20260913c');
if(!html.includes('owner-agentic-panel')){
  const css=String.raw`<style id="ownerAgenticStyles">
.owner-agentic-panel{margin-top:18px;border:1px solid #e3e7ea;border-radius:18px;background:#fff;padding:18px;box-shadow:0 10px 30px rgba(15,23,42,.04)}
.owner-agentic-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.owner-agentic-head h4{margin:4px 0 6px;font-size:18px}.owner-agentic-head p{margin:0;max-width:760px}.owner-agentic-body{display:grid;gap:12px}
.owner-agentic-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;border:1px solid #e8ecef;border-radius:14px;background:#fafbfb}.owner-agentic-controls>div:first-child{display:grid;gap:4px}.owner-agentic-controls span{font-size:13px;color:#667078;line-height:1.45}.owner-agentic-control-buttons{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.owner-agentic-boundary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#667078}.owner-agentic-run{display:grid;gap:6px;padding:14px;border:1px solid #e5e9ec;border-radius:14px}.owner-agentic-run h4,.owner-agentic-run p{margin:0}.owner-agentic-run p{color:#59636b;font-size:13px;line-height:1.5}
.owner-agentic-kicker{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#65717a;font-weight:700}.owner-agentic-proposals{display:grid;gap:10px}.owner-agentic-proposal{display:grid;gap:10px;border:1px solid #e4e8eb;border-radius:14px;padding:14px;background:#fff}.owner-agentic-proposal[data-tone="risk"]{border-left:4px solid #b63a2e}.owner-agentic-proposal[data-tone="positive"]{border-left:4px solid #2b7554}.owner-agentic-proposal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.owner-agentic-proposal-head h5{margin:3px 0 0;font-size:15px}.owner-agentic-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.owner-agentic-risk,.owner-agentic-status-badge,.owner-agentic-source{font-size:10px;letter-spacing:.03em;text-transform:uppercase;border:1px solid #dfe4e7;border-radius:999px;padding:4px 7px;background:#f7f9fa}.owner-agentic-risk.high{border-color:#e7b9b4;background:#fff5f3}.owner-agentic-status-badge.approved{border-color:#bcdcca;background:#f1faf5}.owner-agentic-status-badge.rejected{border-color:#d9c6c4;background:#faf5f4}.owner-agentic-reason{margin:0;color:#414a50;font-size:13px;line-height:1.5}.owner-agentic-policy{font-size:12px;font-weight:700;color:#384149}.owner-agentic-sources{display:flex;gap:6px;flex-wrap:wrap}.owner-agentic-source{text-transform:none;letter-spacing:0;color:#5e686f}.owner-agentic-actions{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #edf0f2;padding-top:10px}
@media(max-width:760px){.owner-agentic-head,.owner-agentic-controls,.owner-agentic-proposal-head{flex-direction:column}.owner-agentic-control-buttons,.owner-agentic-badges{justify-content:flex-start}.owner-agentic-control-buttons .btn{width:100%}.owner-agentic-panel{padding:14px}}
</style>
`;
  html=replaceOnce(html,'</head>',css+'</head>','agentic style');
}

fs.writeFileSync(jsPath,js);
fs.writeFileSync(indexPath,html);
console.log('Agentic Owner Command Centre patch applied.');
