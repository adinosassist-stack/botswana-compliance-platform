/**
 * Browser adapter for Thebe Desk's quotation company logo controls.
 * Inert until caller mounts the editor, enables the feature through an
 * authenticated capability, and supplies an anti-CSRF token.
 * Company identity is ALWAYS resolved on server; never sent as trusted input.
 */
import {mountQuotationLogoEditor} from "./quotation-logo-editor.mjs";
const endpoint="/api/quotation/logo";
const deny=code=>{throw Error(code)};
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
  async upload(file){
   if(!(file instanceof Blob))deny("invalid_logo_upload");
   if(file.size>2*1024*1024||file.size<32)deny("invalid_logo_upload");
   if(!["image/png","image/jpeg"].includes(file.type))deny("unsupported_logo_type");
   const result=await api(endpoint+"/upload",{method:"POST",
    headers:{"content-type":file.type,"x-csrf-token":csrfToken},body:file});
   if(typeof result.logoAssetId!=="string"||!result.logoAssetId)deny("invalid_logo_upload_response");
   return {logoAssetId:result.logoAssetId,aspectRatio:result.aspectRatio};
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
export async function mountCompanyQuotationLogoEditor(root,{companyId,capability,fetchImpl,csrfToken}={}) {
 if(capability?.enabled!==true||capability?.authenticated!==true)
  deny("quotation_logo_feature_disabled");
 const api=createQuotationLogoHttpClient({fetchImpl,csrfToken,enabled:true});
 const current=await api.load();
 let verifiedAspectRatio=current.aspectRatio;
 const editor=mountQuotationLogoEditor(root,{
  companyId,logoAssetId:current.settings?.logoAssetId,
  initialLayout:current.settings?.layout,
  // Existing image preview requires a separate authorized binary endpoint.
  // Until that is available, saving layout without a newly uploaded image is
  // possible only when UI receives a verified asset image via another adapter.
  onUpload:async file=>{const uploaded=await api.upload(file);verifiedAspectRatio=uploaded.aspectRatio;return uploaded},
  onSave:async settings=>{
   if(!Number.isFinite(verifiedAspectRatio)||verifiedAspectRatio<=0)deny('logo_aspect_ratio_unavailable');
   return api.save({...settings,aspectRatio:verifiedAspectRatio});
  }
 });
 return Object.freeze({editor,initialState:current});
}
