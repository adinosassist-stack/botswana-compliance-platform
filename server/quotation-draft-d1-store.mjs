/**
 * UNMOUNTED private quotation-only D1 adapter candidate.
 * Never bind this to production or staging before exact-schema approval.
 * The caller must derive companyId from a verified server session.
 * Each INSERT/UPDATE is a single atomic D1 statement. No read/modify/write.
 */
import {validateQuotationDraft} from "./quotation-draft-model.mjs";
const fail=code=>{throw Error(code)};
const safeId=id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
const canonical=data=>{
 const d=validateQuotationDraft(data);
 return {quoteNumber:d.quoteNumber,issueDate:d.issueDate,
  customerName:d.customerName,customerContact:d.customerContact,
  paymentMethod:d.paymentMethod,
  items:d.items.map(({description,quantity,unitPriceCents})=>({description,quantity,unitPriceCents})),
  discountCents:d.discountCents};
};
export function createQuotationDraftD1Store({db}={}){
 if(typeof db?.prepare!=="function")fail("quotation_draft_d1_unconfigured");
 return Object.freeze({
  async read({companyId,draftId}={}){
   if(!safeId(companyId)||!safeId(draftId))fail("invalid_draft_reference");
   const row=await db.prepare(
    "SELECT revision, draft_json FROM quotation_drafts WHERE tenant_id=? AND id=? LIMIT 1"
   ).bind(companyId,draftId).first();
   if(!row)return null;
   if(!Number.isSafeInteger(row.revision)||row.revision<1||
      typeof row.draft_json!=="string"||row.draft_json.length>32768)
    fail("quotation_draft_d1_corrupt");
   try{return {revision:row.revision,draft:canonical(JSON.parse(row.draft_json))}}
   catch{fail("quotation_draft_d1_corrupt")}
  },
  async save({companyId,draftId,expectedRevision,draft}={}){
   if(!safeId(companyId)||!safeId(draftId)||
      !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
      expectedRevision>=2_147_483_647)fail("invalid_draft_reference");
   const text=JSON.stringify(canonical(draft));
   if(new TextEncoder().encode(text).byteLength>32768)fail("quotation_draft_too_large");
   // Separate CAS statements for first creation and updates: an UPDATE must
   // never create a missing draft at an arbitrary higher revision.
   const statement=expectedRevision===0?
    db.prepare("INSERT OR IGNORE INTO quotation_drafts (tenant_id,id,revision,draft_json) VALUES (?,?,1,?)")
     .bind(companyId,draftId,text):
    db.prepare("UPDATE quotation_drafts SET revision=revision+1,draft_json=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND revision=?")
     .bind(text,companyId,draftId,expectedRevision);
   const result=await statement.run();
   if(!result?.success)fail("quotation_draft_d1_write_failed");
   if(result?.meta?.changes===0)return {conflict:true};
   if(result?.meta?.changes!==1)fail("quotation_draft_d1_write_unverified");
   return {revision:expectedRevision+1};
  }
 });
}
