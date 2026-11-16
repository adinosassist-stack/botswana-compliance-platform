/**
 * Inert, session-scoped quotation draft save/reload contract.
 * NOT mounted in any router, not a D1 migration, and never issues quotations.
 * Host MUST derive companyId and actor from verified server sessions.
 * Store is an injected, tenant-scoped implementation reviewed separately.
 */
import {validateQuotationDraft} from "./quotation-draft-model.mjs";

const PATH="/api/quotation/drafts";
const MAX_BODY=32768;
const validId=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const reply=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
 "x-content-type-options":"nosniff"
}});
const reject=(status,code)=>reply(status,{ok:false,error:code});
const copy=object=>JSON.parse(JSON.stringify(object));

async function readJson(request){
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(type!=="application/json")throw Error("unsupported_content_type");
 const declared=request.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BODY))
  throw Error("payload_too_large");
 if(!request.body?.getReader)throw Error("invalid_draft_body");
 const reader=request.body.getReader(),parts=[];let length=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("invalid_draft_body");
   length+=value.byteLength;
   if(length>MAX_BODY)throw Error("payload_too_large");
   parts.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 if(!length)throw Error("invalid_draft_body");
 const all=new Uint8Array(length);let pos=0;
 for(const part of parts){all.set(part,pos);pos+=part.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all))}
 catch{throw Error("invalid_draft_body")}
}
function validEnvelope(data){
 if(!data||typeof data!=="object"||Array.isArray(data)||
    Object.keys(data).some(k=>!["draftId","revision","draft"].includes(k))||
    !validId(data.draftId)||!Number.isSafeInteger(data.revision)||
    data.revision<0||data.revision>2_147_483_647)
  throw Error("invalid_draft_envelope");
 const validated=validateQuotationDraft(data.draft);
 // Persist only the editable draft contract; derived line totals, subtotal,
 // grand total and currency must always be recomputed, never stored as input.
 const draft={quoteNumber:validated.quoteNumber,issueDate:validated.issueDate,
  customerName:validated.customerName,customerContact:validated.customerContact,
  paymentMethod:validated.paymentMethod,
  items:validated.items.map(({description,quantity,unitPriceCents})=>({description,quantity,unitPriceCents})),
  discountCents:validated.discountCents};
 return {draftId:data.draftId,revision:data.revision,draft};
}
/**
 * store.read({companyId,draftId}) => null | {revision,draft}
 * store.save({companyId,draftId,expectedRevision,draft}) =>
 *     {revision,draft} | {conflict:true}
 * Store implementation MUST enforce tenant binding, atomic revision compare,
 * and no cross-company read/write. This handler does not provide persistence.
 */
export async function handleQuotationDraftPersistence({
 request,actor,companyId,authorization,verifyMutation,store
}={}){
 if(!(request instanceof Request))return reject(400,"invalid_request");
 const path=new URL(request.url).pathname,method=request.method;
 if(path!==PATH||!["GET","PUT"].includes(method))return reject(404,"not_found");
 if(!actor||!validId(companyId)||typeof authorization?.assertCompanyReader!=="function")
  return reject(403,"quotation_draft_access_denied");
 if(typeof store?.read!=="function"||typeof store?.save!=="function")
  return reject(503,"quotation_draft_store_unavailable");
 const draftId=new URL(request.url).searchParams.get("id");
 if(method==="GET"){
  if(!validId(draftId))return reject(400,"invalid_draft_id");
  try{
   if(await authorization.assertCompanyReader({actor,companyId})!==true)
    return reject(403,"quotation_draft_access_denied");
   const item=await store.read({companyId,draftId});
   if(!item)return reject(404,"quotation_draft_not_found");
   if(!Number.isSafeInteger(item.revision)||item.revision<1)
    return reject(500,"quotation_draft_store_invalid");
   // Do not disclose malformed or tampered saved data from the private store.
   const verified=validateQuotationDraft(item.draft);
   const draft={quoteNumber:verified.quoteNumber,issueDate:verified.issueDate,
    customerName:verified.customerName,customerContact:verified.customerContact,
    paymentMethod:verified.paymentMethod,
    items:verified.items.map(({description,quantity,unitPriceCents})=>({description,quantity,unitPriceCents})),
    discountCents:verified.discountCents};
   return reply(200,{ok:true,draftId,revision:item.revision,draft:copy(draft)});
  }catch{return reject(500,"quotation_draft_read_failed")}
 }
 // Explicit edit right AND session-bound CSRF before reading any request body.
 try{
  if(typeof authorization.assertCompanyEditor!=="function"||
     await authorization.assertCompanyEditor({actor,companyId})!==true)
   return reject(403,"quotation_draft_access_denied");
  if(typeof verifyMutation!=="function"||
     await verifyMutation({request,actor,companyId})!==true)
   return reject(403,"quotation_draft_mutation_denied");
 }catch{return reject(403,"quotation_draft_access_denied")}
 try{
  if(draftId!==null)return reject(400,"unexpected_draft_query");
  const item=validEnvelope(await readJson(request));
  const saved=await store.save({companyId,draftId:item.draftId,
   expectedRevision:item.revision,draft:item.draft});
  if(saved?.conflict===true)return reject(409,"quotation_draft_revision_conflict");
  if(!Number.isSafeInteger(saved?.revision)||saved.revision!==item.revision+1)
   return reject(500,"quotation_draft_store_invalid");
  return reply(200,{ok:true,draftId:item.draftId,revision:saved.revision,draft:copy(item.draft)});
 }catch(e){
  const code=String(e?.message||"");
  if(code==="payload_too_large")return reject(413,code);
  if(code==="unsupported_content_type")return reject(415,code);
  if(code==="invalid_draft_body"||code==="invalid_draft_envelope"||
     code==="invalid_draft_id"||code==="unsupported_quotation_field"||
     code.startsWith("invalid_quotation_")||code==="quotation_money_overflow")
   return reject(400,"invalid_quotation_draft");
  return reject(500,"quotation_draft_save_failed");
 }
}
