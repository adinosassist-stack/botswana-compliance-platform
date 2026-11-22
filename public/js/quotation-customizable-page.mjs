/**
 * Private, source-only Lovely quotation customization / print preview.
 * No route is mounted, no network requests, no customer issuance, no storage.
 * The original SHA-pinned two-page contract PDF remains untouched.
 */
import {
 QUOTATION_CUSTOM_DEFAULT_COPY,QUOTATION_CUSTOM_MAX_ITEMS,
 quotationCustomSample,quotationCustomFormatMoney,validateQuotationCustomPage
} from "./quotation-customizable-page-model.mjs";

const css=[
 ".qcp-shell{display:grid;grid-template-columns:minmax(265px,340px) minmax(0,1fr);gap:16px;font:13px/1.45 system-ui,sans-serif;color:#192634;background:#f0f2f5;padding:14px}",
 ".qcp-shell *{box-sizing:border-box}",
 ".qcp-sidebar{background:#fff;border:1px solid #d9dfe6;border-radius:12px;padding:16px;display:grid;align-content:start;gap:11px;max-height:calc(100vh - 28px);overflow-y:auto}",
 ".qcp-sidebar h2{font-size:18px;margin:0}",
 ".qcp-sidebar p{margin:0;color:#526274}",
 ".qcp-sidebar details{border:1px solid #dce1e7;border-radius:8px;padding:10px}",
 ".qcp-sidebar summary{font-weight:700;cursor:pointer}",
 ".qcp-editor-grid{display:grid;gap:8px;margin-top:10px}",
 ".qcp-editor-grid label{display:grid;gap:3px;font-weight:600;font-size:12px}",
 ".qcp-editor-grid input,.qcp-editor-grid textarea{width:100%;min-width:0;font:inherit;color:#152335;border:1px solid #9eadbd;border-radius:6px;padding:7px 8px;background:#fff}",
 ".qcp-editor-grid textarea{resize:vertical;min-height:140px}",
 ".qcp-line-row{display:grid;grid-template-columns:1fr 58px 87px 31px;gap:5px;align-items:end;border-bottom:1px solid #e1e5e9;padding-bottom:7px}",
 ".qcp-line-row input{width:100%;min-width:0}",
 ".qcp-line-row button{padding:5px 3px}",
 ".qcp-shell button{cursor:pointer;padding:8px 10px;border-radius:7px;background:#fff;border:1px solid #afbdc9;color:#182735;font:inherit}",
 ".qcp-shell button[data-primary]{background:#bd1116;border-color:#bd1116;color:#fff;font-weight:700}",
 ".qcp-shell button:disabled{opacity:.5;cursor:not-allowed}",
 ".qcp-first-value-guide{border:1px solid #d0dce9;border-radius:10px;padding:12px;background:#f8fafc;display:grid;gap:8px;min-width:0}",
 ".qcp-first-value-guide h3{font-size:15px;margin:0;color:#17314d}",
 ".qcp-guide-list{margin:0;padding:0;list-style:none;display:grid;gap:6px}",
 ".qcp-first-value-guide .qcp-guide-button{min-height:44px;width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere}",
 ".qcp-first-value-guide .qcp-guide-button[aria-current=step]{border:2px solid #245887;font-weight:750}",
 ".qcp-guide-feedback{margin:0;overflow-wrap:anywhere;color:#23476a}",
 ".qcp-guide-invoice{margin:0;padding-top:8px;border-top:1px solid #d0dce9;color:#405367;overflow-wrap:anywhere}",
 ".qcp-actions{display:flex;flex-wrap:wrap;gap:7px}",
 ".qcp-hint{font-size:12px;color:#66717e}",
 ".qcp-status{font-size:12px;color:#3f5c75;min-height:22px;overflow-wrap:anywhere}",
 ".qcp-status:focus{outline:2px solid #245887;outline-offset:3px}",
 ".qcp-stage{display:grid;justify-items:center;align-content:start;gap:18px;min-width:0;overflow:auto}",
 "@media(max-width:900px){.qcp-actions button{min-height:44px;flex:1 1 155px;touch-action:manipulation}.qcp-status{font-size:13px}}",
 ".qcp-page{width:min(100%,794px);min-height:1055px;background:#fff;position:relative;box-shadow:0 3px 15px #17233220;padding:35px 35px 66px;display:flex;flex-direction:column;gap:16px;color:#1b1b1b}",
 ".qcp-watermark{position:absolute;top:8px;left:35px;color:#9a1318;font-size:10px;letter-spacing:.6px;font-weight:750}",
 ".qcp-masthead{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:2px solid #d20c15;padding-bottom:12px;min-height:116px}",
 ".qcp-brand{font-size:26px;font-weight:800;max-width:55%;min-width:0;line-height:1.12}",
 ".qcp-issuer{font-size:11px;font-weight:600;margin-top:4px}",
 ".qcp-brand img{display:block;max-height:105px;max-width:100%;object-fit:contain;object-position:left center}",
 ".qcp-heading{font-size:23px;background:#d10d16;color:white;font-weight:800;padding:8px 17px;max-width:50%;text-align:right}",
 ".qcp-meta{display:grid;grid-template-columns:1.45fr 1fr;gap:10px}",
 ".qcp-meta section{background:#f2f3f5;padding:9px 12px;min-width:0}",
 ".qcp-meta h3{margin:0 0 5px;color:#c00912;font-size:12px;text-transform:uppercase}",
 ".qcp-meta p{margin:3px 0;overflow-wrap:anywhere}",
 ".qcp-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}",
 ".qcp-page th{background:#bd1018;color:#fff;text-align:left;padding:7px 6px}",
 ".qcp-page td{border-bottom:1px solid #d9dde1;padding:6px;overflow-wrap:anywhere}",
 ".qcp-page th:nth-child(1){width:47%}",
 ".qcp-page th:nth-child(2){width:12%}",
 ".qcp-page th:nth-child(3){width:20%}",
 ".qcp-page th:nth-child(4){width:21%}",
 ".qcp-number{text-align:right;font-variant-numeric:tabular-nums}",
 ".qcp-totals{width:45%;margin-left:auto;font-size:12px}",
 ".qcp-totals p{margin:0;padding:7px 8px;display:flex;justify-content:space-between;gap:10px}",
 ".qcp-totals .qcp-grand{background:#bd1018;color:white;font-weight:750}",
 ".qcp-pay{border-top:1px solid #e0e3e6;padding-top:9px;font-size:11px}",
 ".qcp-pay h3{font-size:12px;margin:0 0 6px}",
 ".qcp-pay p{margin:3px 0;overflow-wrap:anywhere}",
 ".qcp-note{margin:0;font-size:12px}",
 ".qcp-page-footer{margin-top:auto;border-top:2px solid #d20c15;padding-top:9px;display:grid;gap:5px;font-size:10px}",
 ".qcp-contact{font-weight:700;overflow-wrap:anywhere}",
 ".qcp-terms{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.55;flex:1}",
 ".qcp-terms-warning{color:#ab141a;font-size:11px;font-weight:700}",
 ".qcp-signature{font-size:11px;border-top:1px solid #dfe3e6;padding-top:14px}",
 "@media(max-width:900px){.qcp-shell{grid-template-columns:minmax(0,1fr)}.qcp-sidebar{max-height:none;min-width:0}.qcp-page{min-height:930px;min-width:0;padding:24px 18px 52px;overflow-wrap:anywhere}.qcp-masthead{gap:8px}.qcp-brand{font-size:18px}.qcp-heading{font-size:16px;padding:5px 8px;overflow-wrap:anywhere}.qcp-page table{font-size:9px}.qcp-page th,.qcp-page td{padding:4px;overflow-wrap:anywhere}.qcp-totals{width:60%}.qcp-stage{min-width:0;overflow-x:hidden}}",
 "@media print{@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important}.qcp-shell{display:block;padding:0;background:#fff}.qcp-sidebar{display:none!important}.qcp-stage{display:block;overflow:visible}.qcp-page{page-break-after:always;break-after:page;box-shadow:none;margin:0;width:210mm;height:297mm;min-height:0;padding:13mm 13mm 17mm}.qcp-page:last-child{page-break-after:auto;break-after:auto}.qcp-watermark{top:5mm;left:13mm}.qcp-brand img{max-height:26mm}.qcp-page table{font-size:9pt}.qcp-page td{padding:4pt}.qcp-terms{font-size:9pt}}"
].join("\n");

const elt=(tag,cls="",text=null)=>{
 const element=document.createElement(tag);
 if(cls)element.className=cls;
 if(text!==null)element.textContent=String(text);
 return element;
};
const line=(box,text)=>{const p=elt("p","",text);box.append(p);return p};
const label=(name,value,onChange,large=false)=>{
 const wrapper=elt("label"),caption=elt("span","",name);
 const field=elt(large?"textarea":"input");
 if(!large)field.type="text";
 field.value=String(value??"");
 field.addEventListener("input",()=>onChange(field.value));
 wrapper.append(caption,field);
 return wrapper;
};
const details=(heading,open=false)=>{
 const element=elt("details");element.open=open;
 element.append(elt("summary","",heading));
 const content=elt("div","qcp-editor-grid");element.append(content);
 return {element,content};
};
/**
 * First-value guidance for the existing quotation print editor.
 * This guide deliberately has no API, storage, issuance or completion authority.
 * It must never turn a local PDF/JSON export into a server-saved business record.
 */
function mountFirstValueGuide(sidebar,actions,{basic,itemsSection,termsSection,print,customerReady}){
 const guide=elt("section","qcp-first-value-guide");
 guide.id="qcp-first-value-guide";
 guide.setAttribute("role","region");
 guide.setAttribute("aria-label","First quotation walkthrough");
 const title=elt("h3","","Your first quotation — guided steps");
 const intro=elt("p","qcp-hint",
  "Follow these steps to prepare and review a quotation. Progress here is local guidance, not a saved Thebe Desk record.");
 const list=elt("ol","qcp-guide-list");
 const feedback=elt("p","qcp-guide-feedback","");
 feedback.id="qcp-first-value-status";
 feedback.setAttribute("role","status");
 feedback.setAttribute("aria-live","polite");
 feedback.setAttribute("aria-atomic","true");
 let step=0;
 const focusArea=(section,selector)=>{
  section.element.open=true;
  const target=section.content.querySelector(selector)||section.element.querySelector("summary");
  target?.focus({preventScroll:true});
  const reduced=typeof window.matchMedia==="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target?.scrollIntoView?.({block:"nearest",behavior:reduced?"instant":"smooth"});
 };
 const steps=[
  {label:"1. Enter customer details",action:()=>focusArea(basic,"input")},
  {label:"2. Review items and BWP prices",action:()=>focusArea(itemsSection,"input")},
  {label:"3. Check quotation terms",action:()=>focusArea(termsSection,"textarea")},
  {label:"4. Review print / PDF options",action:()=>print.focus({preventScroll:true})}
 ];
 const buttons=steps.map((entry,index)=>{
  const li=elt("li"),button=elt("button","qcp-guide-button",entry.label);
  button.type="button";
  button.addEventListener("click",()=>{
   step=index;
   buttons.forEach((node,i)=>{
    if(i===index)node.setAttribute("aria-current","step");
    else node.removeAttribute("aria-current");
   });
   entry.action();
   feedback.textContent="Step "+(index+1)+" of 4 selected. "+
    (index===3?"A browser PDF or local JSON export is not a saved or issued quotation.":
     "Complete the highlighted section and review the document.");
  });
  li.append(button);list.append(li);return button;
 });
 buttons[0].setAttribute("aria-current","step");
 const invoice=elt("p","qcp-guide-invoice",
  "Next: invoice. Invoice drafting and issuance are not available from this editor. A quotation PDF does not create an invoice. Use only a separately authorized, server-confirmed invoice workflow.");
 guide.append(title,intro,list,feedback,invoice);
 sidebar.insertBefore(guide,actions);
 return Object.freeze({
  update({validated=false,blocker="",error=false}={}){
   const message=error?"Fix the invalid fields before printing. No record was saved.":
    !validated?"Complete the quotation fields; no record was saved.":
    customerReady&&blocker?"Customer-ready print is blocked: "+blocker+" No record was saved.":
    customerReady?"Ready for local print review only. Nothing was saved, sent or issued.":
    "Sample preview only. Nothing was saved, sent or issued.";
   // Announce input-validation changes without changing focus or selecting steps.
   if(feedback.textContent!==message)feedback.textContent=message;
  }
 });
}

/** Customer-ready printing never uses the untouched sample or an unentered account. */
function customerReadyBlocker(q){
 if(!q.termsText.trim())return "Enter the full contract terms.";
 if(/^(?:DEMO|SAMPLE|TEST)(?:[-\s]|$)/i.test(q.quoteNumber)||
    q.customerName.trim().toLowerCase()==="sample customer"||
    q.customerPhone.trim()==="+267 71 000 000")
    return "Replace the sample quote number and customer details before printing.";
 if(!/^[0-9]{1,34}$/.test(q.copy.bankAccount))
    return "Enter and verify the bank account number (digits only).";
 return "";
}
/** Explicit additional capability required; this does NOT mount automatically. */
export function mountQuotationCustomizablePage(root,{capability,initial,issuerName,defaultBankAccount,documentMode="preview"}={}){
 if(!root||typeof root.replaceChildren!=="function")throw Error("invalid_quotation_custom_root");
 if(documentMode!=="preview"&&documentMode!=="customer")throw Error("invalid_quotation_document_mode");
 const customerReady=documentMode==="customer";
 if(customerReady&&capability?.canPrepareCustomerQuotation!==true)
    throw Error("quotation_customer_ready_disabled");
 if(capability?.enabled!==true||capability?.authenticated!==true||
    capability?.canEditQuotations!==true||
    capability?.canCustomizeQuotationPreview!==true)
    throw Error("quotation_custom_preview_disabled");
 const makeSample=()=> {
  const sample=quotationCustomSample();
  if(defaultBankAccount)sample.copy.bankAccount=defaultBankAccount;
  return sample;
 };
 const state=initial===undefined?makeSample():JSON.parse(JSON.stringify(initial));
 let checked=validateQuotationCustomPage(state);
 let logoUrl=null,logoWidth=32,logoX=0,disposed=false,logoRevision=0;
 const shell=elt("section","qcp-shell");
 const sidebar=elt("aside","qcp-sidebar"),stage=elt("div","qcp-stage");
 const style=elt("style");style.textContent=css;
 const nonce=document.querySelector("script[nonce],style[nonce]")?.nonce;
 if(nonce)style.nonce=nonce;
 sidebar.append(elt("h2","",customerReady?"Customer quotation":"Quotation customization"),
  elt("p","qcp-hint",customerReady?
   "Customer-ready print mode. Verify the customer, amounts, account and full terms before sharing. Printing does not send or save a quotation.":
   "PRIVATE PREVIEW ONLY. All wording can be edited. This is not a customer quotation or the approved two-page contract."));
 const status=elt("div","qcp-status",""),actions=elt("div","qcp-actions");status.id="qcp-print-status";status.setAttribute("aria-live","polite");
 const print=elt("button","",customerReady?"Print customer quotation / Save PDF":"Print / Save PDF");print.type="button";print.dataset.primary="";
 const printHelp=details("How to save as PDF on your phone");
 printHelp.content.append(elt("p","qcp-hint","Android Chrome: tap Print / Save PDF, then select Save as PDF in the destination menu. iPhone Safari: tap Print / Save PDF and use the Share / Print options. Some in-app browsers cannot open print dialogs: open this page in Chrome or Safari first. Printing does not save or send a quote to Thebe Desk."));
 const reset=elt("button","","Reset sample");reset.type="button";
 const download=elt("button","","Export draft JSON");download.type="button";
 const importButton=elt("button","","Import draft JSON");importButton.type="button";
 const importInput=elt("input");importInput.type="file";importInput.accept=".json,application/json";
 importInput.hidden=true;importInput.setAttribute("aria-label","Import quotation draft JSON file");
 actions.append(print,download,importButton,reset,importInput);
 const basic=details("Quotation and customer details",true);
 for(const [key,name] of [
  ["quoteNumber","Quote number"],["issueDate","Date (YYYY-MM-DD)"],
  ["customerName","Customer name"],["customerPhone","Customer number"],
  ["location","Installation/location"]
 ])basic.content.append(label(name,state[key],v=>{state[key]=v;refresh()}));
 basic.content.append(label("Discount (P)",state.discount,v=>{state.discount=v;refresh()}));
 const itemsSection=details("Items and prices",true);
 const itemsRoot=elt("div","qcp-editor-grid"),add=elt("button","","Add line item");add.type="button";
 function drawItemInputs(){
  itemsRoot.replaceChildren();
  state.items.forEach((item,index)=>{
   const row=elt("div","qcp-line-row");
   const desc=elt("input");desc.value=item.description;desc.setAttribute("aria-label","Description "+(index+1));
   const qty=elt("input");qty.value=item.quantity;qty.setAttribute("aria-label","Qty "+(index+1));
   const price=elt("input");price.value=item.unitPrice;price.setAttribute("aria-label","Price "+(index+1));
   const remove=elt("button","","×");remove.type="button";remove.setAttribute("aria-label","Remove line "+(index+1));
   desc.addEventListener("input",()=>{item.description=desc.value;refresh()});
   qty.addEventListener("input",()=>{item.quantity=qty.value;refresh()});
   price.addEventListener("input",()=>{item.unitPrice=price.value;refresh()});
   remove.addEventListener("click",()=>{
    if(state.items.length===1)return;
    state.items.splice(index,1);drawItemInputs();refresh();
   });
   row.append(desc,qty,price,remove);itemsRoot.append(row);
  });
  add.disabled=state.items.length>=QUOTATION_CUSTOM_MAX_ITEMS;
 }
 add.addEventListener("click",()=>{
  if(state.items.length>=QUOTATION_CUSTOM_MAX_ITEMS)return;
  state.items.push({description:"New item",quantity:"1",unitPrice:"0.00"});
  drawItemInputs();refresh();
 });
 itemsSection.content.append(elt("p","qcp-hint","Description · quantity · price (P) · remove"),itemsRoot,add);
 const copySection=details("Customize ALL document wording");
 for(const [key,defaultValue] of Object.entries(QUOTATION_CUSTOM_DEFAULT_COPY)){
  copySection.content.append(label(key.replace(/([A-Z])/g," $1"),state.copy[key]??defaultValue,v=>{
   state.copy[key]=v;refresh();
  }));
 }
 const termsSection=details("Page 2 — terms and conditions",true);
 termsSection.content.append(label("Exact contract wording (editable, preserve line breaks)",state.termsText,v=>{
  state.termsText=v;refresh();
 },true));
 termsSection.content.append(elt("p","qcp-hint","The sample starts with Lovely Tombstones’ terms. You can edit the wording for this draft."));
 const logoSection=details("Logo sizing and placement",true);
 const logoField=elt("input");logoField.type="file";logoField.accept="image/png,image/jpeg,image/webp";
 logoField.setAttribute("aria-label","Upload company logo");
 const sizeField=elt("input");sizeField.type="range";sizeField.min="15";sizeField.max="50";sizeField.value=String(logoWidth);
 const offsetField=elt("input");offsetField.type="range";offsetField.min="0";offsetField.max="60";offsetField.value=String(logoX);
 logoSection.content.append(elt("p","qcp-hint","PNG, JPG or WebP, max 2 MB. The logo appears in the current preview and printed PDF only; it is not saved to your business account."));
 logoSection.content.append(label("Logo image for local preview","",()=>{}));
 logoSection.content.lastChild.replaceChildren(elt("span","","Company logo"),logoField);
 logoSection.content.append(label("Logo width (%)","",()=>{}));
 logoSection.content.lastChild.replaceChildren(elt("span","","Logo width (%)"),sizeField);
 logoSection.content.append(label("Logo horizontal offset","",()=>{}));
 logoSection.content.lastChild.replaceChildren(elt("span","","Logo horizontal offset"),offsetField);
 logoField.addEventListener("change",()=>{
  const file=logoField.files?.[0];
  if(!file)return;
  const revision=++logoRevision;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||
     file.size<32||file.size>2*1024*1024){
   status.textContent="Choose a PNG, JPG or WebP logo under 2 MB.";logoField.value="";return;
  }
  const candidate=URL.createObjectURL(file);
  const probe=new Image();
  probe.onload=()=>{
   if(disposed||revision!==logoRevision){URL.revokeObjectURL(candidate);return}
   if(probe.naturalWidth<30||probe.naturalHeight<20||
      probe.naturalWidth>5000||probe.naturalHeight>5000){
    URL.revokeObjectURL(candidate);logoField.value="";
    status.textContent="Logo dimensions must be 30–5000 px wide and 20–5000 px tall.";return;
   }
   if(logoUrl)URL.revokeObjectURL(logoUrl);
   logoUrl=candidate;refresh();
   status.textContent="Logo added to this preview and print only. It is not saved to your account.";
  };
  probe.onerror=()=>{
   URL.revokeObjectURL(candidate);
   if(disposed||revision!==logoRevision)return;
   logoField.value="";status.textContent="Logo could not be opened. Choose a valid PNG, JPG or WebP image.";
  };
  probe.src=candidate;
 });
 sizeField.addEventListener("input",()=>{logoWidth=Number(sizeField.value);refresh()});
 offsetField.addEventListener("input",()=>{logoX=Number(offsetField.value);refresh()});
 // Keep primary mobile print actions visible before the long editable document.
 sidebar.append(actions,status,printHelp.element,basic.element,itemsSection.element,copySection.element,termsSection.element,logoSection.element);
 const firstValueGuide=mountFirstValueGuide(sidebar,actions,{basic,itemsSection,termsSection,print,customerReady});
 shell.append(sidebar,stage);
 root.replaceChildren(style,shell);
 function masthead(page,heading){
  const head=elt("header","qcp-masthead"),brand=elt("div","qcp-brand");
  if(logoUrl){
   const logo=elt("img");logo.src=logoUrl;logo.alt="Company logo";
   logo.style.width=logoWidth+"%";logo.style.marginLeft=logoX+"%";brand.append(logo);
  }else brand.append(elt("span","",checked.copy.brandName));
  if(issuerName)brand.append(elt("div","qcp-issuer","Issued by "+issuerName));
  head.append(brand,elt("div","qcp-heading",heading));page.append(head);
 }
 function info(section,heading,rows){
  const block=elt("section");block.append(elt("h3","",heading));
  for(const [name,value] of rows)line(block,name+": "+value);
  section.append(block);
 }
 function makePage(index){
  const page=elt("article","qcp-page");page.setAttribute("aria-label","Quotation page "+index);
  if(!customerReady)page.append(elt("div","qcp-watermark","SAMPLE PREVIEW — NOT FOR CUSTOMER ISSUE"));
  return page;
 }
 function rowText(parent,labelText,value){
  const p=elt("p");
  p.append(elt("span","",labelText),elt("strong","",value));parent.append(p);
 }
 function renderPreview(){
  stage.replaceChildren();
  const c=checked.copy;
  const first=makePage(1);masthead(first,c.heading);
  const meta=elt("div","qcp-meta");
  info(meta,c.customerHeading,[
   [c.customerNameLabel,checked.customerName],[c.customerPhoneLabel,checked.customerPhone],
   [c.locationLabel,checked.location]]);
  info(meta,c.heading,[[c.quoteNumberLabel,checked.quoteNumber],[c.dateLabel,checked.issueDate]]);
  first.append(meta);
  const table=elt("table");const thead=elt("thead"),header=elt("tr");
  for(const name of [c.descriptionLabel,c.quantityLabel,c.unitPriceLabel,c.lineTotalLabel]){
   header.append(elt("th","",name));
  }
  thead.append(header);table.append(thead);
  const tbody=elt("tbody");
  for(const row of checked.items){
   const tr=elt("tr");
   tr.append(elt("td","",row.description),elt("td","qcp-number",row.quantity),
    elt("td","qcp-number",quotationCustomFormatMoney(row.unitPriceCents)),
    elt("td","qcp-number",quotationCustomFormatMoney(row.totalCents)));
   tbody.append(tr);
  }
  table.append(tbody);first.append(table);
  const totals=elt("div","qcp-totals");
  rowText(totals,c.subtotalLabel,quotationCustomFormatMoney(checked.subtotalCents));
  rowText(totals,c.discountLabel,"-"+quotationCustomFormatMoney(checked.discountCents));
  const grand=elt("p","qcp-grand");
  grand.append(elt("span","",c.grandTotalLabel),elt("strong","",quotationCustomFormatMoney(checked.totalCents)));
  totals.append(grand);first.append(totals);
  const payment=elt("div","qcp-pay");payment.append(elt("h3","",c.paymentHeading));
  for(const [lab,val] of [
   [c.paymentMethodLabel,c.paymentMethod],[c.bankLabel,c.bankName],
   [c.bankBranchLabel,c.bankBranch],[c.bankAccountLabel,c.bankAccount||"—"]
  ])line(payment,lab+": "+val);
  first.append(payment,elt("p","qcp-note",c.note));
  const footer=elt("footer","qcp-page-footer");
  footer.append(elt("div","",c.footerLocations),
   elt("div","qcp-contact",c.footerEmail+"  |  "+c.footerPhone));
  first.append(footer);
  const second=makePage(2);masthead(second,c.termsHeading);
  const terms=elt("div","qcp-terms",checked.termsText||"The company's existing terms have not been loaded into this private sample. Add the reviewed terms in the editor before external use.");
  second.append(terms);
  if(!checked.termsText)second.append(elt("div","qcp-terms-warning","TERMS MISSING — DEMO ONLY"));
  second.append(elt("div","qcp-signature",c.signatureLabel+"  __________________________"));
  const footer2=elt("footer","qcp-page-footer");
  footer2.append(elt("span","",c.footerLocations));
  second.append(footer2);stage.append(first,second);
 }
 function refresh(){
  if(disposed)return;
  try{
   checked=validateQuotationCustomPage(state);
   renderPreview();download.disabled=false;
   const blocker=customerReady?customerReadyBlocker(checked):"";
   // Keep the action operable so mobile users can see why printing is blocked.
   print.disabled=false;
   print.setAttribute("aria-describedby","qcp-print-status");
   status.setAttribute("tabindex","-1");
   status.textContent=customerReady?
    (blocker?"Customer quotation not ready: "+blocker:
    "Customer-ready two-page print. Check all details before sharing; no quotation has been sent or saved."):
    (checked.termsText?
    "Valid two-page private preview. No data has been saved or issued.":
    "Preview only: terms have not been loaded; not suitable for customer issue.");
  }catch(error){
   print.disabled=false;download.disabled=true;
   status.textContent="Fix the fields: "+String(error?.message||"invalid draft");
   firstValueGuide.update({error:true});
   return;
  }
  firstValueGuide.update({validated:true,blocker:customerReady?customerReadyBlocker(checked):""});
 }
 print.addEventListener("click",()=>{
  if(disposed)return;
  try{
   checked=validateQuotationCustomPage(state);
   const blocker=customerReady?customerReadyBlocker(checked):"";
   if(blocker){status.textContent="Cannot print yet: "+blocker;status.scrollIntoView({block:"nearest"});status.focus({preventScroll:true});return;}
   // Screen-width overflow is not A4 overflow. Narrow mobile previews must not block printing.
   // Some Android embedded browsers omit matchMedia. Do not let that
   // optional layout API prevent the user-triggered print control from working.
   const wideScreen=typeof window.matchMedia==="function"?
     window.matchMedia("(min-width: 901px)").matches:
     (typeof window.innerWidth==="number"&&window.innerWidth>=901);
   if(wideScreen &&
      [...stage.querySelectorAll(".qcp-page")].some(page=>page.scrollHeight>page.clientHeight+2)){
    status.textContent="Page content overflows. Shorten wording before printing.";return;
   }
   if(typeof window.print!=="function"){
    status.textContent="Printing is unavailable in this browser. Open the quotation in Safari or Chrome and use Share / Print.";
    printHelp.element.open=true;
    status.focus({preventScroll:true});
    return;
   }
   // Mobile webviews may ignore print(); never claim a PDF was generated.
   status.textContent="Opening your browser print dialog. Choose Save as PDF. If no dialog appears, open this quotation in Safari or Chrome and use Share / Print.";
   // Keep the browser call in the direct click gesture; no async rendering or fake PDF success.
   window.print();
  }catch(error){status.textContent="Cannot print: "+String(error?.message||"invalid draft");status.focus({preventScroll:true});}
 });
 importButton.addEventListener("click",()=>{if(!disposed)importInput.click()});
 importInput.addEventListener("change",async()=>{
  const file=importInput.files?.[0];importInput.value="";
  if(disposed||!file)return;
  // Export/import is LOCAL ONLY: never send customer data or terms to a server.
  if(file.size>32768){status.textContent="Draft file exceeds 32 KB.";return}
  try{
   const incoming=JSON.parse(await file.text());
   const verified=validateQuotationCustomPage(incoming);
   // Validate before mutating state; a bad document cannot partially replace it.
   if(!verified||typeof incoming!=="object"||Array.isArray(incoming))throw Error("invalid_draft");
   for(const key of ["quoteNumber","issueDate","customerName","customerPhone",
    "location","discount","items","copy","termsText"])state[key]=JSON.parse(JSON.stringify(incoming[key]));
   // Imported JSON does not contain a logo binary. Clear the previous logo
   // instead of falsely implying the imported quote retained that attachment.
   logoRevision++;if(logoUrl)URL.revokeObjectURL(logoUrl);
   logoUrl=null;logoField.value="";logoWidth=32;logoX=0;
   sizeField.value="32";offsetField.value="0";
   const fields=basic.content.querySelectorAll("input");
   ["quoteNumber","issueDate","customerName","customerPhone","location","discount"]
    .forEach((key,i)=>{fields[i].value=state[key]});
   copySection.content.querySelectorAll("input").forEach((input,i)=>{
    input.value=state.copy[Object.keys(QUOTATION_CUSTOM_DEFAULT_COPY)[i]];
   });
   termsSection.content.querySelector("textarea").value=state.termsText;
   drawItemInputs();refresh();
   status.textContent="Draft imported locally. Re-upload your logo if needed; no data was sent or issued.";
  }catch{status.textContent="Invalid quotation JSON; existing draft was preserved."}
 });
 download.addEventListener("click",()=>{
  if(disposed||download.disabled)return;
  const file=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(file),a=elt("a");
  a.href=url;a.download="quotation-customization-draft.json";
  a.hidden=true;shell.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  status.textContent="JSON exported locally; logo image bytes are not included. Nothing uploaded or issued.";
 });
 reset.addEventListener("click",()=>{
  const original=makeSample();
  Object.assign(state,original);
  logoRevision++;if(logoUrl)URL.revokeObjectURL(logoUrl);
  logoUrl=null;logoField.value="";logoWidth=32;logoX=0;
  sizeField.value="32";offsetField.value="0";
  // Reset field controls in-place so the caller's editor handle stays valid.
  const fields=basic.content.querySelectorAll("input");
  ["quoteNumber","issueDate","customerName","customerPhone","location","discount"]
   .forEach((key,i)=>{fields[i].value=state[key]});
  copySection.content.querySelectorAll("input").forEach((input,i)=>{
   input.value=state.copy[Object.keys(QUOTATION_CUSTOM_DEFAULT_COPY)[i]];
  });
  termsSection.content.querySelector("textarea").value=state.termsText;
  drawItemInputs();refresh();
 });
 drawItemInputs();refresh();
 return Object.freeze({
  getDraft(){if(disposed)throw Error("quotation_custom_preview_disposed");return JSON.parse(JSON.stringify(state));},
  destroy(){disposed=true;logoRevision++;if(logoUrl)URL.revokeObjectURL(logoUrl);root.replaceChildren();}
 });
}
