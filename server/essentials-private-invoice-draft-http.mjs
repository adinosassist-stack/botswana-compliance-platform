/**
 * Offline-only, unmounted quote-to-invoice draft HTTP adapter.
 * The host MUST supply authenticated session, active membership, CSRF and
 * a tenant-scoped transactional repository. This module does not mount a route,
 * read D1, send messages, issue invoices or deploy a Worker.
 */
import {createEssentialsInvoiceDraft} from "./essentials-invoice-transaction.mjs";

const PATH="/api/essentials/invoice-drafts";
const MAX_BODY=4096;
const validId=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const respond=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{
 "content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff"
}});
const reject=(status,error)=>respond(status,{ok:false,error});

async function boundedJson(request){
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(type!=="application/json")throw Error("unsupported_media_type");
 const stated=request.headers.get("content-length");
 if(stated!==null&&(!/^\d+$/.test(stated)||Number(stated)>MAX_BODY))throw Error("payload_too_large");
 if(!request.body?.getReader)throw Error("invalid_body");
 const reader=request.body.getReader();const chunks=[];let length=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("invalid_body");
   length+=value.length;
   if(length>MAX_BODY)throw Error("payload_too_large");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 if(!length)throw Error("invalid_body");
 const bytes=new Uint8Array(length);let position=0;
 for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
 catch{throw Error("invalid_body")}
}

export function createEssentialsPrivateInvoiceDraftHandler({
 enabled=false,environment,allowedPrivateOrigin,
 readVerifiedSession,verifyActiveMembership,verifyMutation,repository
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")throw Error("essentials_handler_disabled");
 if(typeof readVerifiedSession!=="function"||typeof verifyActiveMembership!=="function"||
    typeof verifyMutation!=="function"||typeof repository?.transaction!=="function")
  throw Error("essentials_handler_unconfigured");
 let origin;
 try{
  const u=new URL(allowedPrivateOrigin);
  if(u.protocol!=="https:"||u.username||u.password||u.port||
     u.pathname!=="/"||u.search||u.hash||
     !u.hostname.endsWith(".thebedesk.com")||
     ["thebedesk.com","www.thebedesk.com","app.thebedesk.com"].includes(u.hostname))
   throw Error("private_origin_required");
  origin=u.origin;
 }catch{throw Error("private_origin_required")}
 return Object.freeze({
  async handle(request){
   if(!(request instanceof Request))return reject(400,"invalid_request");
   const url=new URL(request.url);
   if(url.origin!==origin||url.pathname!==PATH||url.search)return reject(404,"not_found");
   if(request.method!=="POST")return reject(405,"method_not_allowed");
   let session;
   try{session=await readVerifiedSession({request})}catch{return reject(401,"unauthenticated")}
   if(!session||session.authenticated!==true||!validId(session.userId)||
      !validId(session.tenantId)||!Array.isArray(session.permissions))
    return reject(401,"unauthenticated");
   const principal=Object.freeze({userId:session.userId,tenantId:session.tenantId,
     permissions:Object.freeze([...session.permissions])});
   if(!principal.permissions.includes("invoice:draft:create"))return reject(403,"permission_denied");
   let membership;
   try{membership=await verifyActiveMembership({request,principal})}
   catch{return reject(403,"membership_unverified")}
   if(!membership||membership.active!==true||membership.tenantId!==principal.tenantId||
      membership.userId!==principal.userId)return reject(403,"membership_unverified");
   if(request.headers.get("origin")!==origin)return reject(403,"origin_denied");
   let csrf;
   try{csrf=await verifyMutation({request,principal})}catch{return reject(403,"mutation_denied")}
   if(csrf!==true)return reject(403,"mutation_denied");
   let body;
   try{body=await boundedJson(request)}
   catch(e){
    if(e.message==="payload_too_large")return reject(413,"payload_too_large");
    if(e.message==="unsupported_media_type")return reject(415,"unsupported_media_type");
    return reject(400,"invalid_body");
   }
   if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(k=>!["quotationId","idempotencyKey"].includes(k))||
     !validId(body.quotationId)||!validId(body.idempotencyKey))
    return reject(400,"invalid_request_body");
   try{
    const createdAt=new Date().toISOString().slice(0,10);
    const result=await createEssentialsInvoiceDraft({
     principal,tenantId:principal.tenantId,quotationId:body.quotationId,
     idempotencyKey:body.idempotencyKey,createdAt,repository
    });
    // Never present an untrusted or incomplete repository result as a saved draft.
    // An actual invoice may only be issued by a separately reviewed workflow.
    if(!result||typeof result.replayed!=="boolean"||
       !result.invoice||result.invoice.status!=="draft"||
       !validId(result.invoice.id)||!validId(result.invoice.invoiceReference)||
       result.invoice.tenantId!==principal.tenantId||
       result.invoice.sourceQuotationId!==body.quotationId)
     return reject(503,"draft_creation_unavailable");
    return respond(result.replayed?200:201,{ok:true,replayed:result.replayed,
      invoice:{id:result.invoice.id,status:"draft",reference:result.invoice.invoiceReference}});
   }catch(e){
    const code=String(e?.message||"");
    if(code==="quotation_not_found")return reject(404,code);
    if(code==="quotation_not_accepted"||code==="idempotency_conflict")return reject(409,code);
    if(code==="permission_denied"||code==="tenant_access_denied")return reject(403,"permission_denied");
    return reject(500,"draft_creation_failed");
   }
  }
 });
}
