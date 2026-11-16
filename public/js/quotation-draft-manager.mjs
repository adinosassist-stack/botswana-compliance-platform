/**
 * Opt-in, inert quotation draft controls. Mount separately beside the existing
 * quotation editor only when the host has verified staff editing capability.
 * No client-side persistence, company ID or customer notification.
 *
 * Caller supplies a session-bound createQuotationDraftStorageClient instance,
 * getDraft() for the current validated editor draft, and applyDraft(draft) for
 * replacing editor fields. No automatic network traffic at mount time.
 */
const safeId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
const element=(tag,text,attrs={})=>{
 const node=document.createElement(tag);
 if(text!==null&&text!==undefined)node.textContent=text;
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
 return node;
};
export function mountQuotationDraftManager(root,{
 capability,client,getDraft,applyDraft,initialDraftId="",initialRevision=0
}={}){
 if(!root||typeof root.replaceChildren!=="function")throw Error("invalid_quotation_manager_root");
 if(capability?.enabled!==true||capability?.authenticated!==true||
    capability?.canEditQuotations!==true)throw Error("quotation_manager_disabled");
 if(typeof client?.save!=="function"||typeof client?.load!=="function"||
    typeof getDraft!=="function"||typeof applyDraft!=="function"||
    (initialDraftId!==""&&!safeId(initialDraftId))||
    !Number.isSafeInteger(initialRevision)||initialRevision<0||
    (initialRevision>0&&!safeId(initialDraftId)))
  throw Error("quotation_manager_unconfigured");
 const css=element("style",[
  ".thebe-qdm{font:14px/1.45 system-ui,sans-serif;display:grid;gap:10px;color:#20354a;max-width:900px}",
  ".thebe-qdm *{box-sizing:border-box}",
  ".thebe-qdm .qdm-controls{display:flex;flex-wrap:wrap;align-items:end;gap:9px}",
  ".thebe-qdm label{display:grid;gap:4px;font-size:12px;font-weight:650;min-width:min(100%,190px)}",
  ".thebe-qdm input{font:inherit;min-height:42px;border:1px solid #a8bacd;border-radius:8px;padding:8px 10px;color:#20354a;background:white;max-width:100%}",
  ".thebe-qdm button{font:inherit;min-height:42px;border:1px solid #8da8c1;border-radius:8px;background:white;color:#173650;padding:9px 12px;cursor:pointer}",
  ".thebe-qdm button[data-primary]{background:#056bc6;color:white;border-color:#056bc6}",
  ".thebe-qdm button:disabled{opacity:.5;cursor:not-allowed}",
  ".thebe-qdm button:focus-visible,.thebe-qdm input:focus-visible{outline:3px solid #8fc1f5;outline-offset:2px}",
  ".thebe-qdm .qdm-status{font-size:12px;color:#395e77;min-height:18px}"
 ].join("\n"));
 const nonce=document.querySelector("script[nonce],style[nonce]")?.nonce;
 if(nonce)css.nonce=nonce;
 const panel=element("section",null,{class:"thebe-qdm","aria-label":"Quotation draft management"});
 const row=element("div",null,{class:"qdm-controls"});
 const label=element("label","Draft reference");
 const id=element("input",null,{type:"text",maxlength:"100",autocomplete:"off",spellcheck:"false","aria-label":"Draft reference"});
 id.value=initialDraftId;
 label.append(id);
 const save=element("button","Save Draft",{type:"button","data-primary":""});
 const open=element("button","Open Draft",{type:"button"});
 const confirm=element("button","Confirm Open",{type:"button"});
 confirm.hidden=true;
 const status=element("div","Drafts are private and not issued.",{class:"qdm-status",role:"status","aria-live":"polite"});
 row.append(label,save,open,confirm);
 panel.append(row,status);
 root.replaceChildren(css,panel);
 let activeId=initialDraftId,revision=initialRevision,busy=false,disposed=false,pending=null;
 const currentId=()=>id.value.trim();
 function paint(){
  const valid=safeId(currentId());
  save.disabled=busy||!valid;
  open.disabled=busy||!valid;
  confirm.disabled=busy||!pending;
 }
 const notice=value=>{if(!disposed)status.textContent=value};
 const snapshot=()=>JSON.stringify(getDraft());
 id.addEventListener("input",()=>{
  pending=null;confirm.hidden=true;
  paint();notice("Choose Save Draft or Open Draft. Nothing is sent automatically.");
 });
 async function saveDraft(){
  if(busy||disposed||!safeId(currentId()))return;
  let draft,signature;
  try{draft=getDraft();signature=JSON.stringify(draft)}
  catch{notice("Complete valid quotation details before saving.");return}
  const target=currentId(),expected=target===activeId?revision:0;
  busy=true;paint();notice("Saving private draft…");
  try{
   const receipt=await client.save({draftId:target,revision:expected,draft});
   if(disposed)return;
   if(receipt.draftId!==target||receipt.revision!==expected+1)
    throw Error("invalid_quotation_draft_receipt");
   activeId=target;revision=receipt.revision;
   if(snapshot()===signature)notice("Draft saved. Revision "+revision+". Not issued.");
   else notice("Draft saved, but newer edits remain unsaved. Save again.");
  }catch(e){
   if(!disposed)notice(e?.message==="quotation_draft_revision_conflict"?
    "Another version exists. Open it before saving; your edits are still here.":
    "Draft was not saved. Check your connection and retry.");
  }finally{busy=false;paint()}
 }
 async function openDraft(){
  if(busy||disposed||!safeId(currentId()))return;
  const target=currentId();
  let before;
  try{before=snapshot()}catch{before=null}
  pending=null;confirm.hidden=true;busy=true;paint();
  notice("Loading private draft…");
  try{
   const loaded=await client.load(target);
   if(disposed)return;
   if(loaded.draftId!==target||!Number.isSafeInteger(loaded.revision)||loaded.revision<1)
    throw Error("invalid_quotation_draft_receipt");
   if(currentId()!==target||snapshot()!==before){
    notice("Current editor changed while loading. Open again to avoid overwriting your edits.");
    return;
   }
   pending={target,loaded,signature:before};
   confirm.hidden=false;
   notice("Review before replacing current fields. Select Confirm Open to proceed.");
  }catch{
   if(!disposed)notice("Draft could not be opened. Check the reference and permissions.");
  }finally{busy=false;paint()}
 }
 function confirmOpen(){
  if(busy||disposed||!pending)return;
  const selected=pending;
  pending=null;confirm.hidden=true;
  if(currentId()!==selected.target||snapshot()!==selected.signature){
   notice("Editor has changed. Open again to avoid losing edits.");paint();return;
  }
  try{
   applyDraft(selected.loaded.draft);
   activeId=selected.target;revision=selected.loaded.revision;
   notice("Draft opened. Revision "+revision+". Not issued.");
  }catch{notice("Draft could not be applied. Current fields were not confirmed as replaced.")}
  paint();
 }
 save.addEventListener("click",saveDraft);
 open.addEventListener("click",openDraft);
 confirm.addEventListener("click",confirmOpen);
 paint();
 return Object.freeze({
  getRevision:()=>({draftId:activeId,revision}),
  destroy(){disposed=true;pending=null;root.replaceChildren()}
 });
}
