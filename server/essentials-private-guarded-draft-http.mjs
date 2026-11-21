/**
 * UNMOUNTED private-staging-only HTTP boundary for acceptance-guarded
 * quotation -> invoice DRAFT composition. Never register on a public router.
 * The host MUST implement actual authenticated session, tenant membership,
 * CSRF validation, trusted quotation loader and same-D1 guard configuration.
 * This module itself does not prove customer acceptance, provision Access,
 * mount an endpoint, issue invoices, deploy Workers or use production Finance.
 */
const PATH="/api/essentials/private/guarded-invoice-drafts";
const MAX_BODY=4096;
const validId=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const respond=(status,payload)=>new Response(JSON.stringify(payload),{
 status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store","x-content-type-options":"nosniff"}
});
const reject=(status,error)=>respond(status,{ok:false,error});

async function readJson(request){
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(type!=="application/json")throw Error("unsupported_media_type");
 const stated=request.headers.get("content-length");
 if(stated!==null&&(!/^\d+$/.test(stated)||Number(stated)>MAX_BODY))
  throw Error("payload_too_large");
 if(!request.body?.getReader)throw Error("invalid_body");
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error("invalid_body");
   size+=value.length;
   if(size>MAX_BODY)throw Error("payload_too_large");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 if(!size)throw Error("invalid_body");
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
 catch{throw Error("invalid_body")}
}

function privateOrigin(input){
 try{
  const url=new URL(input);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.pathname!=="/"||url.search||url.hash||
     !url.hostname.endsWith(".thebedesk.com")||
     ["www.thebedesk.com","app.thebedesk.com","thebedesk.com"].includes(url.hostname))
   throw Error("private_origin_required");
  return url.origin;
 }catch{throw Error("private_origin_required")}
}

export function createEssentialsPrivateGuardedDraftHandler({
 enabled=false,environment,allowedPrivateOrigin,readVerifiedSession,
 verifyActiveMembership,verifyMutation,guardedComposition
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("guarded_http_disabled");
 if(typeof readVerifiedSession!=="function"||
    typeof verifyActiveMembership!=="function"||
    typeof verifyMutation!=="function"||
    typeof guardedComposition?.createDraft!=="function")
  throw Error("guarded_http_unconfigured");
 const origin=privateOrigin(allowedPrivateOrigin);
 return Object.freeze({
  async handle(request){
   if(!(request instanceof Request))return reject(400,"invalid_request");
   let url;
   try{url=new URL(request.url)}catch{return reject(400,"invalid_request")}
   if(url.origin!==origin||url.pathname!==PATH||url.search)
    return reject(404,"not_found");
   if(request.method!=="POST")return reject(405,"method_not_allowed");
   let session;
   try{session=await readVerifiedSession({request})}
   catch{return reject(401,"unauthenticated")}
   if(session?.authenticated!==true||!validId(session.userId)||
      !validId(session.tenantId)||!Array.isArray(session.permissions))
    return reject(401,"unauthenticated");
   const principal=Object.freeze({userId:session.userId,tenantId:session.tenantId,
    permissions:Object.freeze([...session.permissions])});
   if(!principal.permissions.includes("invoice:draft:create"))
    return reject(403,"permission_denied");
   let membership;
   try{membership=await verifyActiveMembership({request,principal})}
   catch{return reject(403,"membership_unverified")}
   if(membership?.active!==true||membership.tenantId!==principal.tenantId||
      membership.userId!==principal.userId)
    return reject(403,"membership_unverified");
   if(request.headers.get("origin")!==origin)
    return reject(403,"origin_denied");
   let verified;
   try{verified=await verifyMutation({request,principal})}
   catch{return reject(403,"mutation_denied")}
   if(verified!==true)return reject(403,"mutation_denied");
   let body;
   try{body=await readJson(request)}
   catch(e){
    if(e.message==="payload_too_large")return reject(413,"payload_too_large");
    if(e.message==="unsupported_media_type")return reject(415,"unsupported_media_type");
    return reject(400,"invalid_body");
   }
   if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).some(key=>!["quotationId","idempotencyKey"].includes(key))||
      !validId(body.quotationId)||!validId(body.idempotencyKey))
    return reject(400,"invalid_request_body");
   try{
    const result=await guardedComposition.createDraft({
     principal,quotationId:body.quotationId,idempotencyKey:body.idempotencyKey,
     createdAt:new Date().toISOString().slice(0,10)
    });
    if(!result||typeof result.replayed!=="boolean"||
       !result.invoice||result.invoice.status!=="draft"||
       !validId(result.invoice.id)||!validId(result.invoice.invoiceReference)||
       result.invoice.tenantId!==principal.tenantId||
       result.invoice.sourceQuotationId!==body.quotationId)
     throw Error("invalid_draft_result");
    return respond(result.replayed?200:201,{ok:true,replayed:result.replayed,
     invoice:{id:result.invoice.id,status:"draft",
      reference:result.invoice.invoiceReference}});
   }catch(e){
    const code=String(e?.message??"");
    if(code==="quotation_not_found")return reject(404,code);
    if(["quotation_not_accepted","idempotency_conflict",
        "acceptance_stale_or_unverified"].includes(code))
     return reject(409,code);
    if(["permission_denied","quotation_tenant_mismatch"].includes(code))
     return reject(403,"permission_denied");
    return reject(503,"draft_creation_unavailable");
   }
  }
 });
}
