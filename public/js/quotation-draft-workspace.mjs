/**
 * Inert composition only: the host must explicitly mount this in an authenticated
 * staff workspace. No automatic routes, D1 bindings, customer issuance or writes.
 */
import {mountQuotationDraftForm} from "./quotation-draft-form.mjs";
import {mountQuotationDraftManager} from "./quotation-draft-manager.mjs";
import {createQuotationDraftStorageClient} from "./quotation-draft-storage-client.mjs";

export function mountQuotationDraftWorkspace(root,{
 capability,fetchImpl,csrfToken,initialDraft,initialDraftId="",initialRevision=0
}={}){
 if(!root||typeof root.replaceChildren!=="function")
  throw Error("invalid_quotation_workspace_root");
 if(capability?.enabled!==true||capability?.authenticated!==true||
    capability?.canEditQuotations!==true||capability?.canStoreQuotationDrafts!==true)
  throw Error("quotation_draft_workspace_disabled");
 const storage=createQuotationDraftStorageClient({fetchImpl,csrfToken,enabled:true});
 const formRoot=document.createElement("div"),managerRoot=document.createElement("div");
 let editor=null,manager=null;
 try{
  editor=mountQuotationDraftForm(formRoot,{capability,fetchImpl,csrfToken,
   initialDraft,draftStorageEnabled:true});
  manager=mountQuotationDraftManager(managerRoot,{
   capability,client:storage,getDraft:editor.getDraft,applyDraft:editor.applyDraft,
   initialDraftId,initialRevision
  });
  // Nothing is inserted in the page before both components are configured.
  root.replaceChildren(formRoot,managerRoot);
 }catch(error){
  editor?.destroy();manager?.destroy();
  throw error;
 }
 return Object.freeze({
  getDraft:editor.getDraft,
  getRevision:manager.getRevision,
  destroy(){manager.destroy();editor.destroy();root.replaceChildren()}
 });
}
