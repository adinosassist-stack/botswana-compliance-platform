/**
 * Server-only quotation logo domain service.
 * No HTTP route is enabled by importing this module. The caller MUST authenticate
 * the session and supply a tenant-resolving authorization adapter. Fail closed.
 * Store provider must be private, tenant-isolated, and implement the documented methods.
 */
import {inspectLogoSignature,validateLogoUploadMetadata,quotationLogoSettings} from "../public/js/quotation-logo-layout.mjs";

const deny=(code)=>{throw new Error(code)};
const safeId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
function assertAdapters({authorization,store}) {
 if(typeof authorization?.assertCompanyEditor!=="function" ||
    typeof authorization?.assertCompanyReader!=="function" ||
    typeof store?.writePrivateAsset!=="function" ||
    typeof store?.readPrivateAsset!=="function" ||
    typeof store?.upsertCompanyLogoSettings!=="function" ||
    typeof store?.getCompanyLogoSettings!=="function")
    deny("logo_backend_not_configured");
}
async function authorize(authorization,actor,companyId,operation) {
 if(!actor||!safeId(companyId))deny("logo_access_denied");
 // Never trust client claims of role/tenant; adapter resolves authentic session.
 const fn=operation==="read"?authorization.assertCompanyReader:authorization.assertCompanyEditor;
 if(await fn({actor,companyId})!==true)deny("logo_access_denied");
}
export async function uploadCompanyQuotationLogo({actor,companyId,file,authorization,store}={}) {
 assertAdapters({authorization,store});
 await authorize(authorization,actor,companyId,"write");
 if(!file||!(file.bytes instanceof Uint8Array))deny("invalid_logo_file");
 const verified=validateLogoUploadMetadata({type:file.type,size:file.bytes.byteLength,width:file.width,height:file.height});
 inspectLogoSignature(file.bytes,verified.mimeType);
 // Store MUST generate an opaque company-bound ID, privately, using scoped keys.
 // Decoding / malware validation and content rasterization must precede production acceptance.
 const saved=await store.writePrivateAsset({companyId,mimeType:verified.mimeType,bytes:file.bytes,
    width:file.width,height:file.height});
 if(!safeId(saved?.logoAssetId))deny("invalid_logo_store_result");
 return Object.freeze({logoAssetId:saved.logoAssetId,aspectRatio:verified.aspectRatio});
}
export async function saveCompanyQuotationLogo({actor,companyId,logoAssetId,aspectRatio,layout,authorization,store}={}) {
 assertAdapters({authorization,store});
 await authorize(authorization,actor,companyId,"write");
 // Lookup by both company and asset: no cross-company asset reference allowed.
 const asset=await store.readPrivateAsset({companyId,logoAssetId});
 if(!asset||!safeId(logoAssetId))deny("logo_asset_not_found");
 if(!Number.isFinite(asset.aspectRatio)||asset.aspectRatio<=0||
    !Number.isFinite(aspectRatio)||Math.abs(asset.aspectRatio-aspectRatio)>0.0001)
    deny("logo_aspect_ratio_mismatch");
 const value=quotationLogoSettings({companyId,logoAssetId,aspectRatio:asset.aspectRatio,layout});
 // Tenant scope must be encoded in DB query predicate by store adapter, not only app logic.
 await store.upsertCompanyLogoSettings({companyId,settings:value});
 return value;
}
export async function getCompanyQuotationLogo({actor,companyId,authorization,store}={}) {
 assertAdapters({authorization,store});
 await authorize(authorization,actor,companyId,"read");
 const settings=await store.getCompanyLogoSettings({companyId});
 if(!settings)return null;
 if(settings.companyId!==companyId||!safeId(settings.logoAssetId))deny("invalid_logo_saved_state");
 const asset=await store.readPrivateAsset({companyId,logoAssetId:settings.logoAssetId});
 if(!asset)deny("logo_asset_not_found");
 return Object.freeze({settings,aspectRatio:asset.aspectRatio});
}
