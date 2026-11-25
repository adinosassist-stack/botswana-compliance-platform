/**
 * Feature-gated, mobile-first, non-issuing quotation form.
 * Does not mount automatically, save customer data, or take payments.
 * Server independently authorizes tenant and recalculates submitted totals.
 */
import {prepareDocumentPdf,sharePreparedDocumentPdf} from "./essentials-document-share.mjs";
import {createQuotationDraftPreviewClient} from "./quotation-draft-api-client.mjs";
import {prepareQuotationFormDraft,formatBwpCents,parseBwpCents} from "./quotation-draft-form-model.mjs";
const css=[
 ".thebe-qdf{font:14px/1.45 system-ui,sans-serif;color:#263342;max-width:900px;display:grid;gap:14px}",
 ".thebe-qdf *{box-sizing:border-box}",
 ".thebe-qdf h2{font-size:18px;margin:0;color:#182d40}",
 ".thebe-qdf .qdf-muted{color:#536879;font-size:12px}",
 ".thebe-qdf .qdf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
 ".thebe-qdf label{font-size:12px;font-weight:650;display:grid;gap:5px;min-width:0}",
 ".thebe-qdf input{font:inherit;background:#fff;color:#20354a;border:1px solid #afc1d2;border-radius:8px;padding:9px 10px;min-height:42px;min-width:0;width:100%}",
 ".thebe-qdf .qdf-items{display:grid;gap:10px}",
 ".thebe-qdf .qdf-row{display:grid;grid-template-columns:minmax(0,2fr) 70px minmax(85px,1fr) minmax(95px,1fr) auto;gap:8px;border:1px solid #cedbe7;border-radius:10px;padding:9px;align-items:end}",
 ".thebe-qdf .qdf-line{font-variant-numeric:tabular-nums;font-size:12px;font-weight:650;padding-bottom:13px;text-align:right}",
 ".thebe-qdf button{font:inherit;cursor:pointer;background:white;color:#245074;border:1px solid #93abc0;border-radius:9px;padding:8px 12px;min-height:40px}",
 ".thebe-qdf button[data-primary]{background:#056bc6;color:#fff;border-color:#056bc6;font-weight:700}",
 ".thebe-qdf button:disabled{opacity:.5;cursor:not-allowed}",
 ".thebe-qdf .qdf-download-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border:1px solid #93abc0;border-radius:9px;color:#245074;background:#fff;text-decoration:none;font-weight:650}",
 ".thebe-qdf .qdf-download-link[hidden]{display:none}",
 ".thebe-qdf .qdf-download-link:focus-visible{outline:3px solid #8fc1f5;outline-offset:2px}",
 ".thebe-qdf button:focus-visible,.thebe-qdf input:focus-visible{outline:3px solid #8fc1f5;outline-offset:2px}",
 ".thebe-qdf .qdf-tools,.thebe-qdf .qdf-footer{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}",
 ".thebe-qdf .qdf-totals{display:grid;gap:6px;max-width:330px;margin-left:auto;width:100%}",
 ".thebe-qdf .qdf-total{display:flex;justify-content:space-between;gap:16px;font-variant-numeric:tabular-nums}",
 ".thebe-qdf .qdf-grand{font-size:17px;font-weight:700;border-top:1px solid #bcc8d7;padding-top:8px}",
 ".thebe-qdf .qdf-status{min-height:20px;color:#395e77;font-size:12px}",
 "@media(max-width:650px){.thebe-qdf .qdf-grid{grid-template-columns:1fr}.thebe-qdf .qdf-row{grid-template-columns:repeat(2,minmax(0,1fr))}.thebe-qdf .qdf-row label:first-child{grid-column:1/-1}.thebe-qdf .qdf-line{text-align:left;padding:0}.thebe-qdf .qdf-totals{max-width:none}}"
].join("\n");
function el(tag,text,attrs={}){
 const result=document.createElement(tag);
 if(text!==undefined&&text!==null)result.textContent=text;
 for(const [key,val] of Object.entries(attrs))result.setAttribute(key,val);
 return result;
}
function inputField(label,type,value="",attrs={}){
 const box=el("label",label),input=el("input",null,{type,...attrs});
 input.value=String(value??"");box.append(input);return {box,input};
}
function moneyString(cents){
 return Number.isSafeInteger(cents)?(cents/100).toFixed(2):"";
}
export function mountQuotationDraftForm(root,{capability,fetchImpl,csrfToken,initialDraft,draftStorageEnabled=false}={}){
 if(!root||typeof root.replaceChildren!=="function")throw Error("invalid_quotation_form_root");
 if(capability?.enabled!==true||capability?.authenticated!==true||
    capability?.canEditQuotations!==true)throw Error("quotation_draft_form_disabled");
 const api=createQuotationDraftPreviewClient({fetchImpl,csrfToken,enabled:true});
 const style=el("style",css);
 const nonce=document.querySelector("script[nonce],style[nonce]")?.nonce;
 if(nonce)style.nonce=nonce;
 const section=el("section",null,{class:"thebe-qdf","aria-label":"Quotation draft editor"});
 const title=el("div");
 title.append(el("h2","Quotation preview"),
  el("p",draftStorageEnabled===true?"Edit, explicitly save, or preview your quotation. Nothing is issued.":"Enter customer details and download a draft PDF. Nothing is saved or issued.",{class:"qdf-muted"}));
 const form=el("form",null,{novalidate:"",autocomplete:"off"});
 const fieldsGrid=el("div",null,{class:"qdf-grid"}),fields={};
 for(const [key,label,type,max] of [
  ["quoteNumber","Quotation number","text",40],
  ["issueDate","Quotation date","date",10],
  ["customerName","Customer name","text",60],
  ["customerContact","Customer number","text",40]
 ]){
  const f=inputField(label,type,initialDraft?.[key]??"",{maxlength:String(max),required:""});
  fields[key]=f.input;fieldsGrid.append(f.box);
 }
 const itemsRoot=el("div",null,{class:"qdf-items","aria-label":"Line items"});
 const add=el("button","Add item",{type:"button"});
 const count=el("span","",{class:"qdf-muted"}),itemTools=el("div",null,{class:"qdf-tools"});
 itemTools.append(add,count);
 const discountField=inputField("Discount (P)","text",
  typeof initialDraft?.discount==="string"?initialDraft.discount:
  moneyString(initialDraft?.discountCents??0),{inputmode:"decimal"});
 const paymentField=inputField("Payment method (optional)","text",initialDraft?.paymentMethod??"",{maxlength:"55"});
 const extra=el("div",null,{class:"qdf-grid"});extra.append(discountField.box,paymentField.box);
 const totals=el("div",null,{class:"qdf-totals"});
 function sumRow(label,grand=false){
  const row=el("div",null,{class:grand?"qdf-total qdf-grand":"qdf-total"});
  const amount=el("strong","—");row.append(el("span",label),amount);totals.append(row);return amount;
 }
 const subtotal=sumRow("Subtotal"),discount=sumRow("Discount"),grand=sumRow("Grand total",true);
 const status=el("div","Complete the required fields to preview.",{
  class:"qdf-status",role:"status","aria-live":"polite"
 });
 const submit=el("button","Download PDF preview",{type:"submit","data-primary":""});
 const footer=el("div",null,{class:"qdf-footer"});
 const save=el("a","Save PDF",{class:"qdf-download-link",download:"quotation-draft-preview.pdf",hidden:""});
 const open=el("a","Open PDF",{class:"qdf-download-link",target:"_blank",rel:"noopener",hidden:""});
 const share=el("button","Share PDF (WhatsApp)",{type:"button",hidden:""});
 share.hidden=true;share.disabled=true;
 footer.append(el("span","Preview only · No customer notification",{class:"qdf-muted"}),submit,save,open,share);
 form.append(fieldsGrid,itemsRoot,itemTools,extra,totals,status,footer);
 section.append(title,form);root.replaceChildren(style,section);
 const items=[];let disposed=false,busy=false,preparedPdfUrl=null,preparedShareFile=null,sharing=false,draftRevision=0;
 function clearPreparedPdf(){
  if(preparedPdfUrl)URL.revokeObjectURL(preparedPdfUrl);
  preparedPdfUrl=null;preparedShareFile=null;share.hidden=true;share.disabled=true;
  for(const link of [save,open]){link.hidden=true;link.removeAttribute("href")}
 }
 const values=()=>({
  quoteNumber:fields.quoteNumber.value,issueDate:fields.issueDate.value,
  customerName:fields.customerName.value,customerContact:fields.customerContact.value,
  discount:discountField.input.value,paymentMethod:paymentField.input.value,
  items:items.map(item=>({
   description:item.description.value,quantity:item.quantity.value,
   unitPrice:item.unitPrice.value
  }))
 });
 function refresh(){
  if(disposed)return;
  add.disabled=busy||items.length===8;count.textContent=String(items.length)+" / 8";
  // The only remaining line is required; keep the control visibly disabled.
  for(const item of items)item.remove.disabled=busy||items.length<=1;
  let okay=false;
  try{
   const calc=prepareQuotationFormDraft(values());
   subtotal.textContent=formatBwpCents(calc.subtotalCents);
   discount.textContent="-"+formatBwpCents(calc.discountCents);
   grand.textContent=formatBwpCents(calc.grandTotalCents);
   okay=true;
   if(!busy)status.textContent="Ready to preview. No quotation will be issued.";
  }catch{
   subtotal.textContent="—";discount.textContent="—";grand.textContent="—";
   if(!busy)status.textContent="Complete valid customer details, prices and discount.";
  }
  submit.disabled=busy||!okay;
 }
 function addItem(value={}){
  if(items.length===8)return;
  const row=el("div",null,{class:"qdf-row"});
  const desc=inputField("Description","text",value.description??"",{maxlength:"60"});
  const qty=inputField("Qty","text",value.quantity??"1",{maxlength:"3",inputmode:"numeric"});
  const unit=inputField("Unit price (P)","text",value.unitPrice??"",{inputmode:"decimal"});
  const amount=el("output","—",{class:"qdf-line","aria-label":"Line amount"});
  const remove=el("button","Remove",{type:"button","aria-label":"Remove quotation item"});
  row.append(desc.box,qty.box,unit.box,amount,remove);
  const entry={row,description:desc.input,quantity:qty.input,unitPrice:unit.input,amount,remove};
  items.push(entry);itemsRoot.append(row);
  remove.addEventListener("click",()=>{
   if(busy||items.length<=1)return;
   const index=items.indexOf(entry);if(index<0)return;
   items.splice(index,1);row.remove();draftRevision++;clearPreparedPdf();refresh();
  });
  function refreshLine(){
   try{
    const quantity=entry.quantity.value.trim(),unitCents=parseBwpCents(entry.unitPrice.value);
    if(!/^[1-9][0-9]{0,2}$/.test(quantity))throw Error("invalid_quantity");
    const lineCents=Number(quantity)*unitCents;
    if(!Number.isSafeInteger(lineCents)||lineCents>1_000_000_000)
     throw Error("invalid_quotation_line_total");
    amount.textContent=formatBwpCents(lineCents);
   }catch{amount.textContent="—"}
  }
  row.addEventListener("input",refreshLine);
  refreshLine();
 }
 const start=Array.isArray(initialDraft?.items)?initialDraft.items.slice(0,8):[];
 for(const item of start.length?start:[{}])
  addItem({description:item.description??"",quantity:item.quantity??"1",
   unitPrice:item.unitPrice??moneyString(item.unitPriceCents)});
 add.addEventListener("click",()=>{if(busy)return;addItem();draftRevision++;clearPreparedPdf();refresh()});
 form.addEventListener("input",()=>{draftRevision++;clearPreparedPdf();refresh()});
 share.addEventListener("click",async()=>{
  if(disposed||sharing||!preparedShareFile)return;
  const file=preparedShareFile;
  sharing=true;share.disabled=true;
  try{
   // Invoke share in the click gesture, with already validated PDF bytes.
   const result=await sharePreparedDocumentPdf({navigatorApi:globalThis.navigator,file,message:{title:"Quotation draft",text:"Review attached draft PDF."}});
   if(!disposed&&preparedShareFile===file)status.textContent=result.shared?
    "Share sheet completed. Confirm the attachment in WhatsApp; delivery is not verified.":
    "Native file sharing is unavailable. Tap Save PDF, then attach the downloaded PDF in WhatsApp.";
  }catch(error){
   if(!disposed&&preparedShareFile===file)status.textContent=error?.name==="AbortError"?
    "Sharing cancelled. Your PDF remains available.":
    "Unable to share this file. Tap Save PDF and attach it manually in WhatsApp.";
  }finally{sharing=false;if(!disposed)share.disabled=!preparedShareFile}
 });
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(busy||disposed)return;
  let draft;
  try{draft=prepareQuotationFormDraft(values()).draft}
  catch{refresh();return}
  const requestedRevision=draftRevision;
  clearPreparedPdf();
  busy=true;refresh();status.textContent="Preparing private PDF preview…";
  try{
   const blob=await api.previewPdf(draft);
   if(disposed)return;
   if(!(blob instanceof Blob)||blob.type!=="application/pdf")
    throw Error("invalid_pdf_preview");
   const ref=String(draft.quoteNumber).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,60);
   const filename="quotation-draft-"+(ref||"preview")+".pdf";
   const file=await prepareDocumentPdf({blob,filename});
   if(disposed)return;
   if(requestedRevision!==draftRevision){
    status.textContent="Draft changed while preparing the PDF. Tap Download PDF preview again.";
    return;
   }
   preparedPdfUrl=URL.createObjectURL(blob);
   save.href=preparedPdfUrl;open.href=preparedPdfUrl;save.download=filename;
   save.hidden=false;open.hidden=false;
   preparedShareFile=file;
   share.hidden=!file;share.disabled=!file||sharing;
   // Asynchronous PDF requests can lose browser user activation on mobile.
   // Keep explicit, user-tappable links and the object URL until invalidated.
   try{save.click()}catch{}
   status.textContent="PDF prepared. Tap Save PDF, Open PDF or Share PDF (WhatsApp) when available. Nothing was issued or saved.";
  }catch(err){
   if(!disposed)status.textContent="Preview failed: "+(err?.message||"Unavailable")+".";
  }finally{
   busy=false;
   if(!disposed){
    const note=status.textContent;refresh();
    if(note.startsWith("PDF prepared")||note.startsWith("Preview failed")||note.startsWith("Draft changed"))status.textContent=note;
   }
  }
 });
 // Applying an authenticated stored draft is an explicit user action.
 // Validate the entire candidate before mutating even one visible field.
 function applyDraft(candidate){
  if(disposed||busy)throw Error("quotation_draft_editor_busy");
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||
     Object.keys(candidate).some(k=>!["quoteNumber","issueDate","customerName",
      "customerContact","paymentMethod","items","discountCents"].includes(k))||
     !Array.isArray(candidate.items)||candidate.items.length<1||candidate.items.length>8||
     !Number.isSafeInteger(candidate.discountCents)||candidate.discountCents<0)
   throw Error("invalid_quotation_stored_draft");
  const prepared={
   quoteNumber:candidate.quoteNumber,issueDate:candidate.issueDate,
   customerName:candidate.customerName,customerContact:candidate.customerContact,
   paymentMethod:candidate.paymentMethod??"",
   discount:moneyString(candidate.discountCents),
   items:candidate.items.map(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item)||
       Object.keys(item).some(k=>!["description","quantity","unitPriceCents"].includes(k))||
       !Number.isSafeInteger(item.quantity)||!Number.isSafeInteger(item.unitPriceCents)||
       item.unitPriceCents<0)return {description:"",quantity:"",unitPrice:""};
    return {description:item.description,quantity:String(item.quantity),
     unitPrice:moneyString(item.unitPriceCents)};
   })
  };
  // Fail closed: invalid saved data cannot partially overwrite local edits.
  const checked=prepareQuotationFormDraft(prepared).draft;
  if(checked.discountCents!==candidate.discountCents||
     checked.items.some((item,i)=>item.unitPriceCents!==candidate.items[i].unitPriceCents||
      item.quantity!==candidate.items[i].quantity))
   throw Error("invalid_quotation_stored_draft");
  draftRevision++;clearPreparedPdf();
  for(const key of ["quoteNumber","issueDate","customerName","customerContact"])
   fields[key].value=prepared[key];
  paymentField.input.value=prepared.paymentMethod;
  discountField.input.value=prepared.discount;
  items.splice(0);itemsRoot.replaceChildren();
  for(const item of prepared.items)addItem(item);
  refresh();
 }
 refresh();
 return Object.freeze({
  getDraft:()=>prepareQuotationFormDraft(values()).draft,
  applyDraft,
  destroy(){clearPreparedPdf();disposed=true;root.replaceChildren()}
 });
}
