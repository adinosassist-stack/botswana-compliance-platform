/**
 * An explicitly mounted bridge between the full Lovely quotation editor and
 * tenant-scoped D1 draft endpoint. SOURCE ONLY: no route or customer issuance.
 * Host must authenticate staff and pass genuine server-session capabilities.
 */
import {mountQuotationCustomizablePage} from "./quotation-customizable-page.mjs";
import {validateQuotationCustomPage} from "./quotation-customizable-page-model.mjs";
import {createQuotationDraftStorageClient} from "./quotation-draft-storage-client.mjs";
import {mountQuotationDraftManager} from "./quotation-draft-manager.mjs";

const fail=code=>{throw Error(code)};
const clone=data=>JSON.parse(JSON.stringify(data));
export function customQuotationToStoredDraft(raw){
 const page=validateQuotationCustomPage(raw);
 return {
  quoteNumber:page.quoteNumber,issueDate:page.issueDate,
  customerName:page.customerName,customerContact:page.customerPhone,
  items:page.items.map(x=>({
   description:x.description,quantity:x.quantity,unitPriceCents:x.unitPriceCents
  })),
  discountCents:page.discountCents,paymentMethod:page.copy.paymentMethod,
  customPage:clone(raw)
 };
}
export function storedQuotationToCustomPage(draft){
 if(!draft?.customPage)fail("quotation_custom_document_missing");
 const candidate=clone(draft.customPage),canonical=customQuotationToStoredDraft(candidate);
 for(const key of ["quoteNumber","issueDate","customerName","customerContact",
   "discountCents","paymentMethod"]){
  if(canonical[key]!==draft[key])fail("quotation_custom_document_mismatch");
 }
 if(!Array.isArray(draft.items)||draft.items.length!==canonical.items.length)
  fail("quotation_custom_document_mismatch");
 if(canonical.items.some((item,i)=>Object.keys(item).some(k=>item[k]!==draft.items[i]?.[k])))
  fail("quotation_custom_document_mismatch");
 return candidate;
}
export function mountLovelyQuotationProtectedWorkspace(root,{
 capability,fetchImpl,csrfToken,initial,initialDraftId="",initialRevision=0
}={}){
 if(!root||typeof root.replaceChildren!=="function")fail("quotation_workspace_invalid_root");
 if(capability?.enabled!==true||capability?.authenticated!==true||
   capability?.canEditQuotations!==true||
   capability?.canCustomizeQuotationPreview!==true||
   capability?.canStoreQuotationDrafts!==true)
  fail("quotation_workspace_disabled");
 const client=createQuotationDraftStorageClient({enabled:true,fetchImpl,csrfToken});
 const holder=document.createElement("div"),managerHost=document.createElement("div");
 let editorHost=document.createElement("div");
 let activeEditor=null,manager=null,disposed=false;
 try{
  activeEditor=mountQuotationCustomizablePage(editorHost,{capability,initial});
  manager=mountQuotationDraftManager(managerHost,{
   capability,client,initialDraftId,initialRevision,
   getDraft:()=>customQuotationToStoredDraft(activeEditor.getDraft()),
   applyDraft:draft=>{
    const custom=storedQuotationToCustomPage(draft);
    const replacementHost=document.createElement("div");
    const replacement=mountQuotationCustomizablePage(replacementHost,{
     capability,initial:custom
    });
    activeEditor.destroy();
    holder.replaceChildren(replacementHost);
    editorHost=replacementHost;
    activeEditor=replacement;
   }
  });
  holder.replaceChildren(editorHost);
  root.replaceChildren(holder,managerHost);
 }catch(error){manager?.destroy();activeEditor?.destroy();throw error}
 return Object.freeze({
  getDraft:()=>customQuotationToStoredDraft(activeEditor.getDraft()),
  getRevision:()=>manager.getRevision(),
  destroy(){if(disposed)return;disposed=true;manager.destroy();activeEditor.destroy();root.replaceChildren()}
 });
}
