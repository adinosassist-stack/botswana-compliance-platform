/**
 * Inert quotation logo HTTP boundary. NOT registered in any server router.
 *
 * The caller supplies an actor resolved from a verified server session, a
 * tenant/company ID derived from that session, and an independently checked
 * same-origin CSRF condition for every mutation.
 * Image processing adapter must decode/re-encode bytes in a trusted server
 * process and return actual dimensions. Never trust client image metadata.
 */
import {
 uploadCompanyQuotationLogo,saveCompanyQuotationLogo,getCompanyQuotationLogo
} from "./quotation-logo-service.mjs";

const maxRequestBytes=2*1024*1024;
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const invalid=(code,status)=>response({ok:false,error:code},status);
const approvedType=new Set(["image/png","image/jpeg"]);
const bad=code=>{throw Error(code)};
async function readBoundedBody(request,limit) {
 const reader=request.body?.getReader();
 if(!reader)return new Uint8Array();
 const chunks=[];let count=0;
 try {
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))bad("invalid_request_body");
   count+=value.byteLength;
   if(count>limit)bad("logo_request_too_large");
   chunks.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const result=new Uint8Array(count);let offset=0;
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}
 return result;
}

const allowedKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).every(key=>keys.includes(key));
export async function handleQuotationLogoHttp({request,actor,companyId,authorization,store,
  verifyMutation,decodeAndSanitizeLogo}={}) {
 if(!(request instanceof Request)||!actor||typeof companyId!=="string"||!companyId)
  return invalid("logo_access_denied",403);
 if(!authorization||!store)return invalid("logo_backend_not_configured",503);
 const pathname=new URL(request.url).pathname;
 const method=request.method.toUpperCase();
 // Endpoint is deliberately narrowly scoped; route must be mounted explicitly.
 if(!["/api/quotation/logo","/api/quotation/logo/upload","/api/quotation/logo/image"].includes(pathname))
  return invalid("not_found",404);
 if(method==="GET"&&pathname==="/api/quotation/logo/image"){
  try{
   const saved=await getCompanyQuotationLogo({actor,companyId,authorization,store});
   if(!saved)return invalid("company_logo_not_configured",404);
   // getCompanyQuotationLogo checks the private company-scoped asset reference.
   const asset=await store.readPrivateAsset({companyId,logoAssetId:saved.settings.logoAssetId});
   if(!asset||!(asset.bytes instanceof Uint8Array))return invalid("company_logo_not_found",404);
   if(!approvedType.has(asset.mimeType)||asset.bytes.length<32||asset.bytes.length>maxRequestBytes)
    return invalid("invalid_saved_logo",500);
   return new Response(asset.bytes.slice(),{status:200,headers:{
    "content-type":asset.mimeType,"content-length":String(asset.bytes.byteLength),
    "cache-control":"private, no-store","x-content-type-options":"nosniff",
    "content-security-policy":"default-src 'none'; sandbox"
   }});
  }catch(e){
   return invalid(e.message==="logo_access_denied"?"logo_access_denied":"logo_read_failed",
    e.message==="logo_access_denied"?403:500);
  }
 }
 if(method==="GET"&&pathname==="/api/quotation/logo"){
  try{
   const saved=await getCompanyQuotationLogo({actor,companyId,authorization,store});
   return response({ok:true,settings:saved?.settings??null,aspectRatio:saved?.aspectRatio??null});
  }catch(e){
   return invalid(e.message==="logo_access_denied"?"logo_access_denied":"logo_read_failed",
    e.message==="logo_access_denied"?403:500);
  }
 }
 if(!((method==="PUT"&&pathname==="/api/quotation/logo")||
       (method==="POST"&&pathname==="/api/quotation/logo/upload")))
  return invalid("method_not_allowed",405);
 // Perform authorization and CSRF checks before body decoding or costly raster
 // processing. Domain services independently re-check scope before writes.
 try{
  if(typeof authorization.assertCompanyEditor!=="function"||
     await authorization.assertCompanyEditor({actor,companyId})!==true)
   return invalid("logo_access_denied",403);
  if(typeof verifyMutation!=="function"||
     await verifyMutation({request,actor,companyId})!==true)
   return invalid("logo_mutation_denied",403);
  if(method==="POST"){
   if(typeof decodeAndSanitizeLogo!=="function")return invalid("logo_image_processor_unavailable",503);
   const type=request.headers.get("content-type")?.toLowerCase().split(";")[0].trim();
   if(!approvedType.has(type))return invalid("unsupported_logo_type",415);
   const headerLength=Number(request.headers.get("content-length"));
   if(Number.isFinite(headerLength)&&headerLength>maxRequestBytes)return invalid("logo_too_large",413);
   const bytes=await readBoundedBody(request,maxRequestBytes);
   if(bytes.length<32||bytes.length>maxRequestBytes)return invalid("invalid_logo_size",413);
   const image=await decodeAndSanitizeLogo({bytes,mimeType:type});
   if(!image||!approvedType.has(image.type)||!(image.bytes instanceof Uint8Array)||
      !Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height))
       return invalid("invalid_processed_logo",422);
   const saved=await uploadCompanyQuotationLogo({actor,companyId,authorization,store,
     file:image});
   return response({ok:true,logoAssetId:saved.logoAssetId,aspectRatio:saved.aspectRatio},201);
  }
  const raw=new TextDecoder("utf-8",{fatal:true}).decode(await readBoundedBody(request,4096));
  let value;try{value=JSON.parse(raw)}catch{return invalid("invalid_logo_settings",400)}
  if(!allowedKeys(value,["logoAssetId","aspectRatio","layout"])||
     !allowedKeys(value.layout,["xPercent","yPercent","widthPercent"]))
   return invalid("invalid_logo_settings",400);
  const saved=await saveCompanyQuotationLogo({actor,companyId,
    logoAssetId:value.logoAssetId,aspectRatio:value.aspectRatio,layout:value.layout,
    authorization,store});
  return response({ok:true,settings:saved});
 }catch(e){
  const code=e?.message||"logo_request_failed";
  if(code==="logo_access_denied")return invalid(code,403);
  if(code==="logo_mutation_denied")return invalid(code,403);
  if(["invalid_logo_file","invalid_money","invalid_logo_settings",
      "invalid_logo_layout","invalid_logo_asset_reference","logo_aspect_ratio_mismatch",
      "invalid_logo_signature","unsupported_logo_file","unsupported_logo_dimensions"].includes(code))
   return invalid(code,400);
  if(code==="logo_asset_not_found")return invalid(code,404);
  if(code==="logo_request_too_large")return invalid(code,413);
  if(code==="invalid_request_body")return invalid(code,400);
  return invalid("logo_request_failed",500);
 }
}
