(function regulatoryReviewConsole(global){
  "use strict";

  const ALLOWED_PLATFORM_ROLES=new Set(["editor","reviewer","admin"]);
  const REVIEWER_ROLES=new Set(["reviewer","admin"]);
  let csrfToken="";
  let platformRole="";
  let readiness=null;
  let client=null;
  let busy=false;

  const byId=id=>global.document.getElementById(id);
  const text=(node,value)=>{if(node)node.textContent=String(value??"")};
  const el=(tag,className="",value="")=>{const node=global.document.createElement(tag);if(className)node.className=className;if(value!=="")node.textContent=String(value);return node};

  function setNotice(message,kind=""){
    const node=byId("sessionNotice");if(!node)return;
    node.className=`notice${kind?` ${kind}`:""}`;
    node.textContent=String(message||"");
  }
  function redirectToLogin(){
    const next=encodeURIComponent("/regulatory-review.html");
    global.location.assign(`/auth/?mode=login&next=${next}`);
  }
  function clientErrorMessage(error){
    const code=String(error?.code||error?.data?.error||"");
    const known={maker_checker_required:"A different authorized checker must complete this action.",verified_source_snapshot_required:"This source needs a verified current snapshot before approval.",review_notes_required:"Enter review notes of at least 10 characters.",rule_must_be_approved_first:"Approve this rule before publishing it.",approval_review_record_required:"A governed approval record is required before publication.",rule_changed_after_approval:"The rule changed after approval and must be reviewed again.",sources_changed_after_approval:"A linked source changed after approval and the rule must be reviewed again.",open_source_conflict:"Resolve the linked source conflict before progressing this rule.",invalid_state_transition:"This rule is no longer in the expected state. Refresh the page."};
    return known[code]||String(error?.message||"The governed action could not be completed.");
  }
  async function api(path,options={}){return client.request(path,options)}
  async function post(path,payload){return api(path,{method:"POST",body:JSON.stringify(payload||{})})}

  function makeButton(label,{primary=false,warn=false,disabled=false,onClick}={}){
    const button=el("button",`btn${primary?" primary":""}${warn?" warn":""}`,label);
    button.type="button";button.disabled=!!disabled;
    if(typeof onClick==="function")button.addEventListener("click",onClick);
    return button;
  }
  function notesBox(id,placeholder){
    const box=el("textarea");box.id=id;box.maxLength=1000;box.placeholder=placeholder;box.setAttribute("aria-label",placeholder);return box;
  }
  function requireNotes(id){
    const value=String(byId(id)?.value||"").trim();
    if(value.length<10)throw new Error("Enter review notes of at least 10 characters.");
    return value;
  }
  async function governedAction(button,action){
    if(busy)return;
    busy=true;const root=byId("reviewConsole");root?.classList.add("loading");
    const original=button?.textContent||"";if(button){button.disabled=true;button.textContent="Working…"}
    try{await action();setNotice("Governed action completed and the live readiness state was refreshed.","good");await refresh()}
    catch(error){setNotice(clientErrorMessage(error),"bad")}
    finally{busy=false;root?.classList.remove("loading");if(button){button.disabled=false;button.textContent=original}}
  }

  function sourceActionAllowed(source){
    return REVIEWER_ROLES.has(platformRole)&&!!readiness?.makerCheckerReady&&String(source.status)==="pending"&&String(source.verification_status)==="verified"&&Number(source.latest_snapshot_version||0)>0;
  }
  function renderSources(items){
    const list=byId("sourceList");if(!list)return;list.replaceChildren();
    text(byId("sourceCount"),items.length);
    if(!items.length){list.append(el("div","empty","No regulatory sources found."));return}
    items.forEach(source=>{
      const card=el("div","card"),top=el("div","card-top"),left=el("div"),title=el("div","title",source.title||"Untitled source");
      left.append(title,el("div","meta",`${source.authority||"Unknown authority"} · ${source.status||"unknown"} · snapshot ${Number(source.latest_snapshot_version||0)} · ${source.verification_status||"unverified"}`));
      top.append(left,el("span","pill",source.status||"unknown"));card.append(top);
      if(source.source_url){const link=el("a","source-link","Open official source");link.href=String(source.source_url);link.target="_blank";link.rel="noopener noreferrer";card.append(link)}
      if(["pending","conflict"].includes(String(source.status||""))){
        const review=el("div","review"),notesId=`source-notes-${source.id}`,box=notesBox(notesId,"Review notes (minimum 10 characters)");
        const row=el("div","row"),canApprove=sourceActionAllowed(source);
        const approve=makeButton("Approve source",{primary:true,disabled:!canApprove});
        approve.addEventListener("click",()=>governedAction(approve,async()=>{const notes=requireNotes(notesId);await post(`/api/platform/regulatory/sources/${encodeURIComponent(source.id)}/status`,{status:"approved",notes})}));
        const reject=makeButton("Reject",{warn:true,disabled:!REVIEWER_ROLES.has(platformRole)});
        reject.addEventListener("click",()=>governedAction(reject,async()=>{const notes=requireNotes(notesId);await post(`/api/platform/regulatory/sources/${encodeURIComponent(source.id)}/status`,{status:"rejected",notes})}));
        row.append(approve,reject);review.append(box,row);
        if(!readiness?.makerCheckerReady)review.append(el("div","meta","Approval stays disabled until a distinct maker/checker pair is provisioned."));
        else if(String(source.verification_status)!=="verified"||Number(source.latest_snapshot_version||0)<1)review.append(el("div","meta","Approval stays disabled until the source has a verified current snapshot."));
        card.append(review);
      }
      list.append(card);
    });
  }

  function nextRuleAction(rule){
    const status=String(rule.status||"");
    if(status==="draft"||status==="blocked")return {label:"Send to review",next:"review",needsReviewer:false,notesRequired:false};
    if(status==="review")return {label:"Approve rule",next:"approved",needsReviewer:true,notesRequired:true};
    if(status==="approved")return {label:"Publish rule",next:"published",needsReviewer:true,notesRequired:true};
    return null;
  }
  function renderRules(items){
    const list=byId("ruleList");if(!list)return;list.replaceChildren();text(byId("ruleCount"),items.length);
    if(!items.length){list.append(el("div","empty","No regulatory rules found."));return}
    items.forEach(rule=>{
      const card=el("div","card"),top=el("div","card-top"),left=el("div"),title=el("div","title",rule.title||"Untitled rule");
      left.append(title,el("div","meta",`v${Number(rule.version||0)} · ${rule.status||"unknown"} · ${rule.confidence||"unknown"} confidence`));
      top.append(left,el("span","pill",rule.status||"unknown"));card.append(top);
      if(rule.summary)card.append(el("div","meta",rule.summary));
      const action=nextRuleAction(rule);
      if(action){
        const review=el("div","review"),notesId=`rule-notes-${rule.id}`,box=notesBox(notesId,"Review / publication notes");
        const needsChecker=action.needsReviewer,roleOkay=needsChecker?REVIEWER_ROLES.has(platformRole):ALLOWED_PLATFORM_ROLES.has(platformRole),separationOkay=!needsChecker||!!readiness?.makerCheckerReady;
        const button=makeButton(action.label,{primary:true,disabled:!roleOkay||!separationOkay});
        button.addEventListener("click",()=>governedAction(button,async()=>{
          const notes=action.notesRequired?requireNotes(notesId):String(byId(notesId)?.value||"").trim();
          await post(`/api/platform/regulatory/rules/${encodeURIComponent(rule.id)}/advance`,{status:action.next,reviewNotes:notes});
        }));
        review.append(box,button);
        if(needsChecker&&!readiness?.makerCheckerReady)review.append(el("div","meta","Checker actions stay disabled until a distinct maker/checker pair is provisioned."));
        card.append(review);
      }
      list.append(card);
    });
  }

  function renderReadiness(data){
    readiness=data||{};
    text(byId("principalCount"),readiness.principals?.active||0);
    text(byId("approvedSourceCount"),readiness.sources?.verifiedApproved||0);
    text(byId("publishedRuleCount"),readiness.rules?.published||0);
    text(byId("conflictCount"),readiness.openConflicts||0);
    const notice=byId("readinessNotice");if(!notice)return;
    const blockers=Array.isArray(readiness.blockers)?readiness.blockers:[];
    if(!blockers.length){notice.hidden=false;notice.className="notice good";notice.textContent="Publishing readiness is green. Governed reviewer controls remain item-by-item.";return}
    const labels={maker_checker_principals_required:"Independent checker account still required",foundation_pack_not_imported:"Foundation pack has not been imported",no_verified_approved_sources:"At least one verified source still needs independent approval",no_published_rules:"At least one validated rule still needs approval and publication",open_source_conflicts:"Open source conflicts must be resolved"};
    notice.hidden=false;notice.className="notice warn";notice.textContent=`Publishing blockers: ${blockers.map(x=>labels[x]||x).join(" · ")}`;
  }

  async function refresh(){
    const [ready,sources,rules]=await Promise.all([
      api("/api/platform/regulatory/readiness"),
      api("/api/platform/regulatory/sources"),
      api("/api/platform/regulatory/rules")
    ]);
    renderReadiness(ready);renderSources(Array.isArray(sources?.items)?sources.items:[]);renderRules(Array.isArray(rules?.items)?rules.items:[]);
  }

  async function start(){
    if(!global.BW?.api?.createClient){setNotice("The secure API client did not load. Refresh the page.","bad");return}
    client=global.BW.api.createClient({getCsrfToken:()=>csrfToken,onUnauthorized:redirectToLogin,retries:0});
    try{
      const me=await api("/api/auth/me");csrfToken=String(me?.csrfToken||"");
      const status=await api("/api/platform/regulatory/status");platformRole=String(status?.role||"");
      if(!ALLOWED_PLATFORM_ROLES.has(platformRole)){setNotice("This signed-in account is not provisioned for platform regulatory governance.","bad");return}
      setNotice(`Governed platform role: ${platformRole.toUpperCase()}. Server-side maker/checker controls are active.`,"good");
      byId("refreshBtn")?.addEventListener("click",()=>governedAction(byId("refreshBtn"),refresh));
      await refresh();
    }catch(error){
      if(String(error?.code||"")==="unauthenticated"||Number(error?.status||0)===401){redirectToLogin();return}
      setNotice(clientErrorMessage(error),"bad");
    }
  }

  if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);
