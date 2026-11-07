// Review-only writer for isolated research staging. NOT exposed as a Worker route.
// Authenticated reviewer identity must be supplied by a trusted server-side principal.
import {proposeNamibiaReviewFinding} from "./namibia-rule-review-ledger.js";
export const NAMIBIA_REVIEW_INTAKE_VERSION="2026-11-07.v1";
const fail=error=>Object.freeze({ok:false,error});
const clean=(value,max)=>typeof value==="string"&&value.trim()===value&&value.length>0&&value.length<=max?value:null;
function reviewerPrincipal(principal){
 if(!principal||typeof principal!=="object"||principal.marketCode!=="NA"||
    principal.role!=="reviewer"||principal.authenticatedBy!=="server_session")return null;
 const id=clean(principal.user_id,120);
 return id?Object.freeze({userId:id}):null;
}
export async function appendNamibiaResearchNote(db,principal,rule,note){
 const reviewer=reviewerPrincipal(principal);
 if(!reviewer)return fail("authenticated_namibia_reviewer_required");
 if(!db||typeof db.prepare!=="function")return fail("review_database_unavailable");
 if(!rule||rule.marketCode!=="NA"||rule.status!=="research_draft"||
   typeof rule.sourceId!=="string"||!Number.isSafeInteger(rule.sourceRevision)||
   rule.sourceRevision<1||!(/^[a-f0-9]{64}$/).test(rule.sourceHash||""))
   return fail("source_version_binding_required");
 if(!note||typeof note!=="object"||Array.isArray(note)||Object.hasOwn(note,"reviewerId")||
    Object.hasOwn(note,"approved")||Object.hasOwn(note,"approvalGranted"))return fail("client_reviewer_override_forbidden");
 const prepared=proposeNamibiaReviewFinding(rule,{
   reviewerId:reviewer.userId,finding:note.finding,rationale:note.rationale
 });
 if(!prepared.ok)return fail(prepared.error);
 const noteId=crypto.randomUUID();
 try{
   await db.prepare(
    "INSERT INTO na_source_review_notes(note_id,source_id,source_revision,source_sha256,reviewer_ref,finding,rationale) VALUES(?,?,?,?,?,?,?)"
   ).bind(noteId,rule.sourceId,rule.sourceRevision,rule.sourceHash,reviewer.userId,
     prepared.value.finding,prepared.value.rationale).run();
   return Object.freeze({ok:true,value:Object.freeze({
     noteId,sourceId:rule.sourceId,sourceRevision:rule.sourceRevision,
     sourceSha256:rule.sourceHash,reviewerRef:reviewer.userId,
     finding:prepared.value.finding,status:"research_note_recorded",
     approvalGranted:false,releaseEnabled:false
   })});
 }catch{return fail("review_note_write_failed")}
}
