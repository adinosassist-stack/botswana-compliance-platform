(function installThebeVoiceEvalCockpit(global){
  "use strict";

  const RELEASE="20261004-voice-eval-cockpit-v280";
  const PANEL_ID="thebeVoiceEvalCockpit";
  const DIALOG_ID="thebeVoiceEvalDialog";
  let dialog=null;

  const q=(selector,root=document)=>root.querySelector(selector);
  const cleanId=(value,max=120)=>String(value??"").trim().replace(/[^A-Za-z0-9._:-]/g,"_").slice(0,max);
  const role=()=>{
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  };
  const isOwner=()=>role()==="owner";
  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };
  const button=(label,fn,className="btn soft")=>{
    const node=document.createElement("button");
    node.type="button";
    node.className=className;
    node.textContent=label;
    node.addEventListener("click",fn);
    return node;
  };
  const percent=value=>value==null?"—":`${Math.round(Number(value)*100)}%`;
  const seconds=value=>value==null?"—":`${Number(value).toFixed(Number(value)>=10?0:1)} s`;

  function ensureStyle(){
    if(q("#thebeVoiceEvalCockpitStyle"))return;
    const style=document.createElement("style");
    style.id="thebeVoiceEvalCockpitStyle";
    style.textContent=`
      #${DIALOG_ID}{border:0;border-radius:22px;padding:0;width:min(560px,calc(100vw - 28px));max-height:min(760px,calc(100vh - 28px));box-shadow:0 24px 80px rgba(12,18,28,.22);background:#fff;color:#17202a}
      #${DIALOG_ID}::backdrop{background:rgba(12,18,28,.48);backdrop-filter:blur(4px)}
      .thebe-eval-shell{display:grid;gap:16px;padding:20px}
      .thebe-eval-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .thebe-eval-kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.65}
      .thebe-eval-title{font-size:20px;font-weight:700;margin-top:3px}
      .thebe-eval-copy{font-size:13px;line-height:1.45;opacity:.72;margin-top:4px;max-width:46ch}
      .thebe-eval-close{border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;padding:2px 6px}
      .thebe-eval-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .thebe-eval-stat{border:1px solid rgba(20,35,50,.1);border-radius:14px;padding:11px;min-width:0}
      .thebe-eval-stat strong{display:block;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .thebe-eval-stat span{display:block;font-size:11px;opacity:.65;margin-top:3px}
      .thebe-eval-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
      .thebe-eval-form input{min-width:0;border:1px solid rgba(20,35,50,.18);border-radius:12px;padding:10px 12px;font:inherit}
      .thebe-eval-decision{border-radius:14px;padding:12px 14px;background:rgba(20,35,50,.05);font-size:13px;line-height:1.4}
      .thebe-eval-decision strong{display:block;font-size:14px;margin-bottom:3px}
      .thebe-eval-actions{display:flex;flex-wrap:wrap;gap:8px}
      .thebe-eval-note{font-size:12px;line-height:1.45;opacity:.65}
      .thebe-eval-error{font-size:12px;line-height:1.4;color:#9d2a2a;min-height:1.4em}
      @media(max-width:560px){.thebe-eval-grid{grid-template-columns:1fr 1fr}.thebe-eval-form{grid-template-columns:1fr}.thebe-eval-shell{padding:16px}}
    `;
    document.head.append(style);
  }

  function stat(label,value){
    const card=document.createElement("div");
    card.className="thebe-eval-stat";
    card.append(text("strong",value),text("span",label));
    return card;
  }

  function decisionCopy(summary){
    const evaluation=summary?.evaluation||{};
    if(evaluation?.readyForHumanReview===true){
      return {
        title:"Ready for human review",
        copy:"The recorded evidence meets the V279 review thresholds. Production switching remains blocked and requires a separate governed release decision."
      };
    }
    const failed=Array.isArray(evaluation?.failedCriteria)?evaluation.failedCriteria:[];
    return {
      title:"HOLD",
      copy:failed.length
        ?`Evidence is not ready. Remaining gates: ${failed.join(", ")}.`
        :"Matched-session evidence is not yet sufficient for a review decision."
    };
  }

  async function refreshSummary(){
    if(!dialog)return;
    const error=q(".thebe-eval-error",dialog);
    const decision=q(".thebe-eval-decision",dialog);
    const grid=q(".thebe-eval-grid",dialog);
    if(error)error.textContent="";
    if(decision)decision.replaceChildren(text("strong","Refreshing evidence…"),text("span","Reading sealed tenant-scoped metrics."));
    try{
      if(!global.ThebeVoiceEval?.summary)throw new Error("Voice evaluation recorder is unavailable.");
      const summary=await global.ThebeVoiceEval.summary();
      const evaluation=summary?.evaluation||{};
      const live=evaluation?.live||{};
      const realtime=evaluation?.realtime||{};
      const languageTags=Array.isArray(live?.languageTags)?live.languageTags:[];
      const languageValue=live?.languageContinuityRate==null?"—":`${percent(live.languageContinuityRate)} · ${languageTags.length} lang`;
      const usageValue=live?.medianUsageSeconds==null?"—":`${seconds(live.medianUsageSeconds)} · base ${seconds(realtime?.medianUsageSeconds)}`;
      const matchedValue=`${Number(summary?.pairedScenarios||0)} / ${Number(summary?.evidenceRows||0)}`;
      const copy=decisionCopy(summary);
      grid?.replaceChildren(
        stat("Matched / evidence",matchedValue),
        stat("Language continuity",languageValue),
        stat("Median usage / baseline",usageValue),
        stat("Delegation completion",percent(live?.delegationCompletionRate)),
        stat("Interruption recovery",percent(live?.interruptionRecoveryRate)),
        stat("Median useful answer",live?.medianFirstUsefulAnswerMs==null?"—":`${Math.round(Number(live.medianFirstUsefulAnswerMs))} ms`)
      );
      decision?.replaceChildren(text("strong",copy.title),text("span",copy.copy));
      dialog.dataset.decision=evaluation?.readyForHumanReview===true?"review":"hold";
      return summary;
    }catch(err){
      if(error)error.textContent=String(err?.message||err).slice(0,240);
      decision?.replaceChildren(text("strong","HOLD"),text("span","Evidence could not be loaded. No production decision can be made."));
      dialog.dataset.decision="hold";
      return null;
    }
  }

  function startScenario(input,error){
    try{
      const scenarioId=cleanId(input?.value);
      if(!scenarioId)throw new Error("Enter a scenario ID first.");
      if(!global.ThebeVoiceEval?.beginScenario)throw new Error("Voice evaluation recorder is unavailable.");
      global.ThebeVoiceEval.beginScenario(scenarioId);
      if(error)error.textContent="";
      const note=q(".thebe-eval-note",dialog);
      if(note)note.textContent=`Scenario “${scenarioId}” is armed for this browser session. Run the controlled voice session, then repeat the same scenario ID under the comparison runtime.`;
      input.value=scenarioId;
    }catch(err){
      if(error)error.textContent=String(err?.message||err).slice(0,240);
    }
  }

  function buildDialog(){
    ensureStyle();
    const node=document.createElement("dialog");
    node.id=DIALOG_ID;
    node.setAttribute("aria-labelledby","thebeVoiceEvalTitle");
    const shell=document.createElement("div");
    shell.className="thebe-eval-shell";

    const head=document.createElement("div");
    head.className="thebe-eval-head";
    const copy=document.createElement("div");
    copy.append(
      text("div","Controlled preview","thebe-eval-kicker"),
      text("div","Voice evaluation","thebe-eval-title"),
      text("div","Compare Realtime and GPT-Live performance, language continuity and usage without storing raw audio, transcript, language content or provider pricing.","thebe-eval-copy")
    );
    copy.querySelector(".thebe-eval-title").id="thebeVoiceEvalTitle";
    const close=button("×",()=>node.close(),"thebe-eval-close");
    close.setAttribute("aria-label","Close voice evaluation");
    head.append(copy,close);

    const grid=document.createElement("div");
    grid.className="thebe-eval-grid";
    grid.append(
      stat("Matched / evidence","—"),stat("Language continuity","—"),stat("Median usage / baseline","—"),
      stat("Delegation completion","—"),stat("Interruption recovery","—"),stat("Median useful answer","—")
    );

    const form=document.createElement("div");
    form.className="thebe-eval-form";
    const input=document.createElement("input");
    input.type="text";
    input.maxLength=120;
    input.autocomplete="off";
    input.placeholder="Scenario ID e.g. cashflow-check-01";
    input.setAttribute("aria-label","Voice evaluation scenario ID");
    const error=text("div","","thebe-eval-error");
    const arm=button("Arm scenario",()=>startScenario(input,error));
    form.append(input,arm);

    const decision=document.createElement("div");
    decision.className="thebe-eval-decision";
    decision.append(text("strong","HOLD"),text("span","Matched-session evidence has not been loaded yet."));

    const actions=document.createElement("div");
    actions.className="thebe-eval-actions";
    actions.append(
      button("Refresh evidence",()=>void refreshSummary()),
      button("Clear scenario",()=>{
        global.ThebeVoiceEval?.clearScenario?.();
        input.value="";
        const note=q(".thebe-eval-note",node);
        if(note)note.textContent="No scenario is armed. Evidence collection remains off.";
      },"btn soft")
    );

    const note=text("div","Use the same scenario ID once under each controlled runtime. No provider switch is available from this panel.","thebe-eval-note");
    shell.append(head,grid,form,decision,actions,note,error);
    node.append(shell);
    document.body.append(node);
    node.addEventListener("close",()=>{try{q(`#${PANEL_ID}`)?.focus()}catch{}});
    return node;
  }

  function mount(){
    if(!isOwner()||q(`#${PANEL_ID}`))return false;
    const command=q("#ownerCommandCentre");
    if(!command||!global.ThebeVoiceEval)return false;
    const head=q(".owner-command-head",command)||command;
    const control=button("Voice evaluation",async()=>{
      if(!dialog||!dialog.isConnected)dialog=buildDialog();
      dialog.showModal();
      const state=global.ThebeVoiceEval?.state?.();
      const scenario=cleanId(state?.scenarioId||"");
      const input=q(".thebe-eval-form input",dialog);
      if(input&&scenario)input.value=scenario;
      await refreshSummary();
    },"btn soft");
    control.id=PANEL_ID;
    control.dataset.release=RELEASE;
    control.title="Open controlled Realtime vs GPT-Live evaluation evidence";
    head.append(control);
    return true;
  }

  function boot(){
    if(mount())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      if(mount()||attempts>=40)clearInterval(timer);
    },250);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeVoiceEvalCockpit=Object.freeze({
    release:RELEASE,
    open:async()=>{
      if(!mount()&&!q(`#${PANEL_ID}`))throw new Error("Owner voice evaluation control is unavailable.");
      q(`#${PANEL_ID}`)?.click();
    },
    refresh:refreshSummary
  });
})(window);
