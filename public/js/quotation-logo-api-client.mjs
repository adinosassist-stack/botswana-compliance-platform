/**
 * Browser adapter for Thebe Desk's quotation company logo controls.
 * Inert until caller mounts the editor, enables the feature through an
 * authenticated capability, and supplies an anti-CSRF token.
 * Company identity is ALWAYS resolved on server; never sent as trusted input.
 */
import {mountQuotationLogoEditor} from "./quotation-logo-editor.mjs";
const endpoint="/api/quotation/logo";
const deny=code=>{throw Error(code)};
async function readBoundedResponse(response,maxBytes){
 const announced=Number(response.headers.get("content-length")||0);
 if(Number.isFinite(announced)&&announced>maxBytes)deny("download_exceeds_limit");
 if(!response.body?.getReader)deny("download_stream_unavailable");
 const reader=response.body.getReader();const chunks=[];let count=0;
 try {
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))deny("invalid_download_chunk");
   count+=value.byteLength;
   if(count>maxBytes)deny("download_exceeds_limit");
   chunks.push(value);
  }
 }finally{
  try{await reader.cancel()}catch{}
  reader.releaseLock();
 }
 const out=new Uint8Array(count);
 let offset=0;
 for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength}
 return out;
}
async function normalizeLogoForUpload(file){
 // The portable private Worker has a vetted PNG sanitizer, not JPEG/WebP
 // decoders. Convert browser-native JPG/WebP to PNG *before transport* rather
 // than inviting formats the server cannot process. The server still verifies
 // and sanitizes the resulting pixels; browser conversion is not a trust gate.
 // Decode and re-encode PNGs too. Many real logos contain palette or
 // ancillary PNG chunks rejected by the strict server sanitizer. A browser
 // canvas produces a small, normalized RGB/RGBA PNG. The server independently
 // validates the resulting bytes; this conversion grants no trust.
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))deny("unsupported_logo_type");
 const kind=file.type==="image/webp"?"webp":file.type==="image/jpeg"?"jpeg":"png";
 if(typeof createImageBitmap!=="function"||typeof document==="undefined"){
  if(kind==="png")return file; // Node synthetic clients: server still validates
  deny(kind+"_conversion_unavailable");
 }
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);
  if(!Number.isSafeInteger(bitmap.width)||!Number.isSafeInteger(bitmap.height)||
     bitmap.width<30||bitmap.height<20||bitmap.width>5000||bitmap.height>5000)
   deny("invalid_logo_dimensions");
  const canvas=document.createElement("canvas");
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext("2d");
  if(!ctx)deny(kind+"_conversion_unavailable");
  ctx.drawImage(bitmap,0,0);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(
   blob=>blob?resolve(blob):reject(Error(kind+"_conversion_failed")),"image/png"));
  if(!(png instanceof Blob)||png.type!=="image/png")deny(kind+"_conversion_failed");
  if(png.size>2*1024*1024)deny("converted_logo_too_large");
  return png;
 }finally{bitmap?.close?.()}
}
const parseJson=async response=>{
 const contentType=response.headers.get("content-type")||"";
 if(!contentType.toLowerCase().includes("application/json"))deny("invalid_logo_api_response");
 const result=await response.json();
 if(!response.ok||result?.ok!==true)deny(result?.error||"quotation_logo_request_failed");
 return result;
};
export function createQuotationLogoHttpClient({fetchImpl,csrfToken,enabled=false}={}) {
 if(enabled!==true)deny("quotation_logo_feature_disabled");
 if(typeof fetchImpl!=="function"||typeof csrfToken!=="string"||
    csrfToken.length<12||csrfToken.length>4096)deny("quotation_logo_client_unconfigured");
 const api=async(path,options={})=>parseJson(await fetchImpl(path,{
  credentials:"same-origin",cache:"no-store",redirect:"error",...options
 }));
 return Object.freeze({
  async load(){
   const body=await api(endpoint,{method:"GET"});
   return {settings:body.settings||null,aspectRatio:body.aspectRatio||null};
  },
  async loadImage(){
   const result=await fetchImpl(endpoint+"/image",{method:"GET",
    credentials:"same-origin",cache:"no-store",redirect:"error"});
   if(!result.ok)deny("saved_logo_image_unavailable");
   const type=(result.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   if(!["image/png","image/jpeg"].includes(type))deny("invalid_saved_logo_type");
   const bytes=await readBoundedResponse(result,2*1024*1024);
   if(bytes.length<32||bytes.length>2*1024*1024)deny("invalid_saved_logo_size");
   return new Blob([bytes],{type});
  },
  async upload(file){
   if(!(file instanceof Blob))deny("invalid_logo_upload");
   if(file.size>2*1024*1024||file.size<32)deny("invalid_logo_upload");
   if(!["image/png","image/jpeg","image/webp"].includes(file.type))deny("unsupported_logo_type");
   const uploaded=await normalizeLogoForUpload(file);
   if(uploaded.size<32||uploaded.size>2*1024*1024)deny("invalid_logo_upload");
   const result=await api(endpoint+"/upload",{method:"POST",
    headers:{"content-type":uploaded.type,"x-csrf-token":csrfToken},body:uploaded});
   if(typeof result.logoAssetId!=="string"||!result.logoAssetId)deny("invalid_logo_upload_response");
   return {logoAssetId:result.logoAssetId,aspectRatio:result.aspectRatio};
  },
  async previewPdf(){
   // PDF preview is deliberately read-only: never issues a customer quotation.
   const result=await fetchImpl(endpoint+"/pdf-preview",{method:"GET",
    credentials:"same-origin",cache:"no-store",redirect:"error"});
   if(!result.ok)deny("quotation_pdf_preview_unavailable");
   const mime=(result.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   if(mime!=="application/pdf")deny("invalid_quotation_pdf_type");
   // Enforce the cap during streaming, even when Content-Length is absent.
   const bytes=await readBoundedResponse(result,10*1024*1024);
   if(bytes.length<5||bytes.length>10*1024*1024||
      bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70||bytes[4]!==45)
    deny("invalid_quotation_pdf_payload");
   return new Blob([bytes],{type:"application/pdf"});
  },
  async save(settings){
   if(!settings||!settings.logoAssetId||!settings.layout)deny("invalid_logo_settings");
   await api(endpoint,{method:"PUT",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({logoAssetId:settings.logoAssetId,
     aspectRatio:settings.aspectRatio,layout:settings.layout})});
  }
 });
}
/**
 * Explicit user-driven mounting. Do not call from public page boot.
 * The backend must be independently authorized and configured before enabling.
 */
export async function mountCompanyQuotationLogoEditor(root,{companyId,capability,fetchImpl,csrfToken,pdfPreviewEnabled=false}={}) {
 if(capability?.enabled!==true||capability?.authenticated!==true)
  deny("quotation_logo_feature_disabled");
 const api=createQuotationLogoHttpClient({fetchImpl,csrfToken,enabled:true});
 const current=await api.load();
 const savedLogoBlob=current.settings?.logoAssetId?await api.loadImage():null;
 let verifiedAspectRatio=current.aspectRatio;
 const editor=mountQuotationLogoEditor(root,{
  companyId,logoAssetId:current.settings?.logoAssetId,
  initialLayout:current.settings?.layout,
  initialLogoBlob:savedLogoBlob,initialAspectRatio:verifiedAspectRatio,
  onUpload:async file=>{const uploaded=await api.upload(file);verifiedAspectRatio=uploaded.aspectRatio;return uploaded},
  onPreviewPdf:pdfPreviewEnabled?()=>api.previewPdf():undefined,
  onSave:async settings=>{
   if(!Number.isFinite(verifiedAspectRatio)||verifiedAspectRatio<=0)deny('logo_aspect_ratio_unavailable');
   return api.save({...settings,aspectRatio:verifiedAspectRatio});
  }
 });
 return Object.freeze({editor,initialState:current});
}
