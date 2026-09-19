(function initOwnerWhatsAppPrepare(global){
  "use strict";

  const RELEASE="20260914a";
  const PANEL_ID="ownerWhatsAppPreparePanel";
  const PURPOSES=Object.freeze([
    Object.freeze({key:"owner_daily_brief",label:"Owner daily brief"}),
    Object.freeze({key:"finance_exception",label:"Finance reconciliation follow-up"}),
    Object.freeze({key:"compliance_followup",label:"Compliance follow-up"}),
    Object.freeze({key:"operations_update",label:"Operations update"})
  ]);
  const PURPOSE_KEYS=new Set(PURPOSES.map(item=>item.key));

  let capabilityReady=false;
  let capabilityRefreshPromise=null;
  let busy=false;
  let currentDraft="";
  let refreshToken=0;

  const q=(selector,root=document)=>root.querySelector(selector);
  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };
  const role=()=>{
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  };
  const roleAllowed=()=>["owner","manager"].includes(role());
  const request=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const makeIdempotencyKey=()=>{
    const token=global.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `whatsapp_prepare_${token}`;
  };
  const statusNode=()=>q("#ownerWhatsAppPrepareStatus");
  const prepareButton=()=>q("#ownerWhatsAppPrepareButton");
  const copyButton=()=>q("#ownerWhatsAppCopyButton");
  const previewNode=()=>q("#ownerWhatsAppPreview");

  function setStatus(message){
    const node=statusNode();
    if(node)node.textContent=String(message||"");
  }

  function setControls(){
    const prepare=prepareButton(),copy=copyButton();
    if(prepare){
      prepare.disabled=busy||!capabilityReady||!roleAllowed();
      prepare.textContent=busy?"Preparing…":"Prepare draft";
    }
    if(copy)copy.disabled=busy||!currentDraft;
  }

  function validateCapability(payload){
    if(
      payload?.enabled!==true
      ||payload?.mode!=="prepare_only"
      ||payload?.humanReviewRequired!==true
      ||payload?.providerSend!==false
      ||payload?.recipientTargeting!==false
      ||payload?.executionEnabled!==false
    )return false;
    const supported=new Set(Array.isArray(payload?.purposes)?payload.purposes.map(item=>String(item?.key||"")):[]);
    return PURPOSES.every(item=>supported.has(item.key));
  }

  function validatePreparedDraft(payload,purpose){
    return payload?.ok===true
      &&payload?.purpose===purpose
      &&PURPOSE_KEYS.has(payload?.purpose)
      &&payload?.policy?.prepareOnly===true
      &&payload?.policy?.humanReviewRequired===true
      &&payload?.execution?.performed===false
      &&payload?.execution?.enabled===false
      &&payload?.execution?.providerSend===false
      &&payload?.execution?.recipientTargeting===false
      &&typeof payload?.messagePreview==="string"
      &&payload.messagePreview.length>0;
  }

  async function refreshCapability(){
    if(capabilityRefreshPromise)return capabilityRefreshPromise;
    capabilityRefreshPromise=(async()=>{
      const token=++refreshToken;
      capabilityReady=false;
      setControls();
      if(!roleAllowed()){
        setStatus("Owner or Manager access is required.");
        return false;
      }
      setStatus("Checking governed WhatsApp preparation…");
      try{
        const payload=await request("/api/agentic/whatsapp/status");
        if(token!==refreshToken)return false;
        if(!validateCapability(payload))throw new Error("WhatsApp preparation is not safely available.");
        capabilityReady=true;
        setStatus("Prepare only · human review required · automatic sending disabled");
        setControls();
        return true;
      }catch(error){
        if(token!==refreshToken)return false;
        capabilityReady=false;
        setStatus(String(error?.message||"WhatsApp preparation unavailable").slice(0,180));
        setControls();
        return false;
      }
    })();
    try{return await capabilityRefreshPromise}
    finally{capabilityRefreshPromise=null}
  }

  async function prepareDraft(){
    if(busy||!roleAllowed())return;
    if(!capabilityReady&&!(await refreshCapability()))return;
    const select=q("#ownerWhatsAppPurpose");
    const purpose=String(select?.value||"");
    if(!PURPOSE_KEYS.has(purpose)){
      setStatus("Choose a supported governed draft type.");
      return;
    }

    busy=true;
    currentDraft="";
    const preview=previewNode();
    if(preview)preview.value="";
    setStatus("Preparing from current tenant-scoped records…");
    setControls();
    try{
      const payload=await request("/api/agentic/whatsapp/prepare",{
        method:"POST",
        headers:{"idempotency-key":makeIdempotencyKey()},
        body:JSON.stringify({purpose})
      });
      if(!validatePreparedDraft(payload,purpose)){
        throw new Error("Prepared draft failed the human-review safety boundary.");
      }
      currentDraft=payload.messagePreview;
      if(preview)preview.value=currentDraft;
      const intent=String(payload?.intent?.id||"");
      setStatus(intent
        ?`Draft prepared for review · audit intent ${intent.slice(0,12)}… · nothing was sent`
        :"Draft prepared for review · nothing was sent");
    }catch(error){
      currentDraft="";
      if(preview)preview.value="";
      setStatus(String(error?.message||"Could not prepare WhatsApp draft").slice(0,180));
    }finally{
      busy=false;
      setControls();
    }
  }

  async function copyDraft(){
    if(!currentDraft)return;
    if(!global.navigator?.clipboard?.writeText){
      setStatus("Clipboard access is unavailable. Select the read-only draft and copy it manually.");
      previewNode()?.focus();
      previewNode()?.select();
      return;
    }
    try{
      await global.navigator.clipboard.writeText(currentDraft);
      setStatus("Draft copied. Review it in WhatsApp before sending manually. Thebe Desk did not send anything.");
    }catch{
      setStatus("Copy was blocked. Select the read-only draft and copy it manually.");
      previewNode()?.focus();
      previewNode()?.select();
    }
  }

  function buildPanel(){
    const panel=document.createElement("section");
    panel.id=PANEL_ID;
    panel.className="owner-agentic-panel";
    panel.dataset.release=RELEASE;

    const head=document.createElement("div");
    head.className="owner-agentic-head";
    const copy=document.createElement("div");
    copy.append(
      text("div","WhatsApp · governed preparation","section-eyebrow"),
      text("h4","Prepare a business update for human review"),
      text("p","Thebe builds a draft from recorded workspace data. It does not choose a recipient, open WhatsApp or send a message.","muted")
    );
    const status=text("span","Checking capability…","owner-input-status");
    status.id="ownerWhatsAppPrepareStatus";
    head.append(copy,status);
    panel.append(head);

    const controls=document.createElement("div");
    controls.className="owner-agentic-controls";
    const field=document.createElement("div");
    const label=text("label","Draft type");
    label.htmlFor="ownerWhatsAppPurpose";
    const select=document.createElement("select");
    select.id="ownerWhatsAppPurpose";
    for(const purpose of PURPOSES){
      const option=document.createElement("option");
      option.value=purpose.key;
      option.textContent=purpose.label;
      select.append(option);
    }
    field.append(label,select);
    const buttons=document.createElement("div");
    buttons.className="owner-agentic-control-buttons";
    const prepare=document.createElement("button");
    prepare.id="ownerWhatsAppPrepareButton";
    prepare.type="button";
    prepare.className="btn";
    prepare.textContent="Prepare draft";
    prepare.disabled=true;
    prepare.addEventListener("click",prepareDraft);
    buttons.append(prepare);
    controls.append(field,buttons);
    panel.append(controls);

    const boundary=document.createElement("div");
    boundary.className="owner-agentic-boundary";
    boundary.append(
      text("span","Prepare only","badge"),
      text("span","No recipient targeting · no automatic sending · every draft requires your review.")
    );
    panel.append(boundary);

    const preview=document.createElement("textarea");
    preview.id="ownerWhatsAppPreview";
    preview.rows=8;
    preview.readOnly=true;
    preview.placeholder="Prepare a governed draft to preview it here.";
    preview.setAttribute("aria-label","Read-only WhatsApp draft preview");
    panel.append(preview);

    const actions=document.createElement("div");
    actions.className="owner-agentic-control-buttons";
    const copyDraftButton=document.createElement("button");
    copyDraftButton.id="ownerWhatsAppCopyButton";
    copyDraftButton.type="button";
    copyDraftButton.className="btn alt";
    copyDraftButton.textContent="Copy reviewed draft";
    copyDraftButton.disabled=true;
    copyDraftButton.addEventListener("click",copyDraft);
    actions.append(copyDraftButton);
    panel.append(actions);
    return panel;
  }

  function mount(){
    const shell=q("#ownerCommandCentre");
    const anchor=q("#ownerAgenticPanel");
    if(!shell||!anchor)return false;
    let panel=q(`#${PANEL_ID}`);
    if(!panel){
      panel=buildPanel();
      anchor.insertAdjacentElement("afterend",panel);
    }
    panel.hidden=!roleAllowed();
    if(roleAllowed()&&!capabilityReady&&!capabilityRefreshPromise&&!busy)void refreshCapability();
    return true;
  }

  function boot(){
    mount();
    const home=q("#homeDecisionCenter");
    if(home)new MutationObserver(()=>mount()).observe(home,{childList:true,subtree:true});
    const dashboard=q("#dashboard");
    if(dashboard)new MutationObserver(()=>{
      if(dashboard.classList.contains("active"))mount();
    }).observe(dashboard,{attributes:true,attributeFilter:["class"]});
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect"){
        capabilityReady=false;
        currentDraft="";
        const preview=previewNode();
        if(preview)preview.value="";
        setTimeout(()=>{mount();refreshCapability()},350);
      }
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerWhatsAppPrepare=Object.freeze({
    release:RELEASE,
    refresh:refreshCapability
  });
})(window);
