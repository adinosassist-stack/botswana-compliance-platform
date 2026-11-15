/**
 * Tenant-scoped quotation logo layout geometry, independent of any PDF renderer.
 * All values are percentages relative to the template page. No file persistence.
 * Consumers must authorize tenant/company on the server before loading or saving.
 */
export const DEFAULT_QUOTE_LOGO_LAYOUT=Object.freeze({xPercent:4,yPercent:2,widthPercent:34});
export const MAX_LOGO_BYTES=2*1024*1024;
export const LOGO_MIME_TYPES=Object.freeze(["image/png","image/jpeg","image/webp"]);
export function validateLogoUploadMetadata({type,size,width,height}={}) {
 if(!LOGO_MIME_TYPES.includes(type)||!Number.isSafeInteger(size)||size<32||size>MAX_LOGO_BYTES)
  throw new Error("unsupported_logo_file");
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<30||height<20||width>5000||height>5000)
  throw new Error("unsupported_logo_dimensions");
 return Object.freeze({mimeType:type,bytes:size,aspectRatio:width/height});
}
export function inspectLogoSignature(bytes,type) {
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
 if(b.length<12)throw new Error("invalid_logo_signature");
 const prefix=(i,s)=>s.split("").every((c,j)=>b[i+j]===c.charCodeAt(0));
 const png=type==="image/png"&&b[0]===137&&prefix(1,"PNG")&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
 const jpeg=type==="image/jpeg"&&b[0]===255&&b[1]===216&&b[2]===255;
 const webp=type==="image/webp"&&prefix(0,"RIFF")&&prefix(8,"WEBP");
 if(!(png||jpeg||webp))throw new Error("invalid_logo_signature");
 return true;
}
const between=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Constrain to printable page, retaining uploaded logo's native aspect ratio. */
export function normalizeQuotationLogoLayout(layout={},pageWidthPt=612.24,pageHeightPt=858.96,aspectRatio=2) {
 if(![pageWidthPt,pageHeightPt,aspectRatio].every(v=>Number.isFinite(v)&&v>0))throw new Error("invalid_logo_geometry");
 const x=layout.xPercent??DEFAULT_QUOTE_LOGO_LAYOUT.xPercent,
 y=layout.yPercent??DEFAULT_QUOTE_LOGO_LAYOUT.yPercent,
 width=layout.widthPercent??DEFAULT_QUOTE_LOGO_LAYOUT.widthPercent;
 if(![x,y,width].every(v=>typeof v==="number"&&Number.isFinite(v)))throw new Error("invalid_logo_layout");
 const maxW=between(88,8,100),w=between(width,8,maxW);
 const h=w*pageWidthPt/aspectRatio/pageHeightPt;
 if(h>100)throw new Error("logo_exceeds_page");
 return Object.freeze({xPercent:between(x,0,100-w),yPercent:between(y,0,100-h),widthPercent:w,heightPercent:h});
}
export function quotationLogoPageRect(layout,pageWidthPt,pageHeightPt,aspectRatio) {
 const r=normalizeQuotationLogoLayout(layout,pageWidthPt,pageHeightPt,aspectRatio);
 return Object.freeze({x:r.xPercent*pageWidthPt/100,y:r.yPercent*pageHeightPt/100,
  width:r.widthPercent*pageWidthPt/100,height:r.heightPercent*pageHeightPt/100});
}
/** Store only numeric geometry and an authorized asset ID, never a base64 upload in company settings. */
export function quotationLogoSettings({companyId,logoAssetId,layout,aspectRatio,pageWidthPt=612.24,pageHeightPt=858.96}={}) {
 if(typeof companyId!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(companyId)||
 typeof logoAssetId!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(logoAssetId))
  throw new Error("invalid_logo_asset_reference");
 return Object.freeze({companyId,logoAssetId,layout:normalizeQuotationLogoLayout(layout,pageWidthPt,pageHeightPt,aspectRatio)});
}
