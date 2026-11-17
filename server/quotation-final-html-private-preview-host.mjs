/**
 * INERT, source-only final HTML quotation private preview host.
 * A protected service-binding caller MUST independently verify its isolation
 * before calling handleInternal. No Cloudflare fetch export, route or deployment.
 * Only stored synthetic drafts; never accept customer document contents from
 * the HTTP body. Tenant/actor comes from verified private host session gate.
 */
import {createQuotationPrivateHostSessionGate} from "./quotation-private-host-session-gate.mjs";
import {storedQuotationToCustomPage} from "../public/js/quotation-custom-workspace-bridge.mjs";
import {renderLovelyFinalHtmlWithBrowserRun} from "./quotation-final-html-browser-run.mjs";
import {LOVELY_FINAL_HTML_REFERENCE} from "./quotation-final-html-contract.mjs";

const fail=code=>{throw Error(code)};
const uuid=x=>typeof x==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
const id=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const PATH="/api/quotation/final-html/pdf-preview";
const deny=(status,code)=>new Response(JSON.stringify({ok:false,error:code}),{
 status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store","x-content-type-options":"nosniff"}
});
async function readReference(request){
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(type!=="application/json")fail("invalid_quotation_preview_content_type");
 const length=request.headers.get("content-length");
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>512))
  fail("invalid_quotation_preview_body");
 if(!request.body?.getReader)fail("invalid_quotation_preview_body");
 const reader=request.body.getReader(),parts=[];let total=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     if(!(value instanceof Uint8Array))fail("invalid_quotation_preview_body");
     total+=value.byteLength;
     if(total>512)fail("invalid_quotation_preview_body");
     parts.push(value);
   }
 }finally{
   try{await reader.cancel()}catch{}
   reader.releaseLock();
 }
 if(total===0)fail("invalid_quotation_preview_body");
 const data=new Uint8Array(total);let position=0;
 for(const part of parts){data.set(part,position);position+=part.byteLength}
 let doc;
 try{doc=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data))}
 catch{fail("invalid_quotation_preview_body")}
 if(!doc||typeof doc!=="object"||Array.isArray(doc)||
    Object.keys(doc).sort().join(",")!=="draftId,revision"||
    !id(doc.draftId)||!Number.isSafeInteger(doc.revision)||
    doc.revision<1||doc.revision>2147483647)
  fail("invalid_quotation_preview_reference");
 return doc;
}
/**
 * Separate operational approval for a real Browser Run binding is required.
 * verifyPrivateInvocation is trusted protected-host evidence, not the
 * presence of any HTTP header. The caller must not mount this as public fetch.
 */
export function createFinalLovelyPrivatePdfPreviewHost({
 enabled=false,expectedTenantId,allowedPrivateOrigin,
 readVerifiedSession,verifyActiveMembership,verifyMutation,
 verifyPrivateInvocation,draftStore,logoStore,authority,
 browserBinding,launchBrowser,pdfLib
}={}){
 if(enabled!==true||!uuid(expectedTenantId)||
   typeof verifyPrivateInvocation!=="function"||
   typeof verifyMutation!=="function"||
   typeof draftStore?.read!=="function"||
   typeof logoStore?.getCompanyLogoSettings!=="function"||
   typeof logoStore?.readPrivateAsset!=="function"||
   typeof authority?.assertPrivatePreview!=="function"||
   typeof launchBrowser!=="function"||!browserBinding||
   typeof pdfLib?.PDFDocument?.load!=="function")
  fail("lovely_html_private_preview_host_unconfigured");
 let parsed;
 try{parsed=new URL(allowedPrivateOrigin)}
 catch{fail("lovely_html_private_preview_origin_invalid")}
 if(parsed.protocol!=="https:"||
   !(parsed.hostname.endsWith(".test")||parsed.hostname.endsWith(".invalid"))||
   parsed.pathname!=="/"||parsed.search||parsed.hash||
   parsed.username||parsed.password)
  fail("lovely_html_private_preview_origin_invalid");
 const handlers={
  async handle({request,actor,companyId}){
   if(request.method!=="POST"||new URL(request.url).pathname!==PATH)
     return deny(404,"not_found");
   let ref;
   try{ref=await readReference(request)}
   catch{return deny(400,"invalid_quotation_preview_reference")}
   try{
    const entry=await draftStore.read({companyId,draftId:ref.draftId});
    if(!entry||entry.revision!==ref.revision||!entry.draft?.customPage)
      return deny(404,"quotation_draft_revision_not_found");
    const page=storedQuotationToCustomPage(entry.draft);
    const logoSource={
     async getPrivateCompanyLogo({actor:a,companyId:tenant}){
      if(a!==actor||tenant!==companyId)
       fail("lovely_html_private_logo_tenant_mismatch");
      const settings=await logoStore.getCompanyLogoSettings({companyId:tenant});
      if(!settings||settings.companyId!==tenant||!id(settings.logoAssetId))
       fail("lovely_html_private_logo_missing");
      const logo=await logoStore.readPrivateAsset({companyId:tenant,
       logoAssetId:settings.logoAssetId});
      if(!logo)fail("lovely_html_private_logo_missing");
      return {bytes:logo.bytes,mimeType:logo.mimeType,
       width:logo.width,height:logo.height,
       widthPercent:settings.layout?.widthPercent,
       xPercent:settings.layout?.xPercent};
     }
    };
    const result=await renderLovelyFinalHtmlWithBrowserRun({
     actor,companyId,draft:page,authority,
     verifyPrivateMutation:()=>verifyMutation({request,actor,companyId}),
     browserBinding,launchBrowser,pdfLib,logoSource,
     sourceSha256:LOVELY_FINAL_HTML_REFERENCE.sourceSha256
    });
    return new Response(result.bytes,{
     status:200,headers:{"content-type":"application/pdf",
      "content-disposition":"attachment; filename=\"lovely-quotation-private-preview.pdf\"",
      "cache-control":"private, no-store","x-content-type-options":"nosniff",
      "x-quotation-status":"private-synthetic-preview-only"}
    });
   }catch{return deny(422,"lovely_html_private_pdf_preview_unavailable")}
  }
 };
 const gate=createQuotationPrivateHostSessionGate({
  enabled:true,environment:"quotation-private-staging",
  expectedTenantId,allowedPrivateOrigin:parsed.origin,
  readVerifiedSession,verifyActiveMembership,verifyMutation,
  quotationHandlers:handlers
 });
 return Object.freeze({
  async handleInternal(request){
   // Independent binding admission BEFORE any session, body, D1, R2 or browser.
   if(!(request instanceof Request))return deny(404,"not_found");
   let accepted=false;
   try{accepted=await verifyPrivateInvocation({request})===true}
   catch{}
   if(!accepted)return deny(404,"not_found");
   const url=new URL(request.url);
   if(url.origin!==parsed.origin||url.pathname!==PATH||request.method!=="POST")
    return deny(404,"not_found");
   return gate.handle(request);
  }
 });
}
