/**
 * Staging-only D1 + private R2 adapter for the quotation logo service.
 * Integration requires already authenticated company/tenant ID and a dedicated
 * bucket with public URLs, routes, and unauthenticated reads disabled.
 * Do not mount as a production endpoint without security review.
 */
import {randomUUID} from "node:crypto";
const err=code=>{throw Error(code)};
const safe=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export function createQuotationLogoStore({db,bucket,namespace="quotation-logos"}={}) {
 if(!db?.prepare||!bucket?.put||!bucket?.get)err("quotation_logo_store_unconfigured");
 const meta=async(companyId,logoAssetId)=>{
  if(!safe(companyId)||!safe(logoAssetId))err("invalid_logo_asset_reference");
  return db.prepare("SELECT id,object_key,mime_type,width,height,aspect_ratio FROM quotation_logo_assets WHERE tenant_id=? AND id=? LIMIT 1")
   .bind(companyId,logoAssetId).first();
 };
 return Object.freeze({
  async writePrivateAsset({companyId,mimeType,bytes,width,height}){
   if(!safe(companyId)||!["image/png","image/jpeg"].includes(mimeType)||
     !(bytes instanceof Uint8Array)||bytes.byteLength<12||bytes.byteLength>2*1024*1024||
     !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<30||width>5000||height<20||height>5000)
     err("invalid_logo_asset");
   const logoAssetId=randomUUID().replaceAll("-",""), key=namespace+"/"+companyId+"/"+logoAssetId;
   // Unpublished private key; metadata insertion must succeed, otherwise delete blob.
   await bucket.put(key,bytes,{httpMetadata:{contentType:mimeType}});
   try {
    await db.prepare("INSERT INTO quotation_logo_assets (id,tenant_id,object_key,mime_type,width,height,aspect_ratio) VALUES (?,?,?,?,?,?,?)")
     .bind(logoAssetId,companyId,key,mimeType,width,height,width/height).run();
   }catch(e){await bucket.delete(key);throw e}
   return {logoAssetId};
  },
  async readPrivateAsset({companyId,logoAssetId}){
   const row=await meta(companyId,logoAssetId);if(!row)return null;
   // Refuse malformed or cross-tenant object keys; never use arbitrary user URL.
   if(row.object_key!==namespace+"/"+companyId+"/"+logoAssetId)err("invalid_logo_object_key");
   const object=await bucket.get(row.object_key);if(!object)return null;
   const bytes=new Uint8Array(await object.arrayBuffer());
   if(bytes.byteLength<12||bytes.byteLength>2*1024*1024)err("invalid_logo_object");
   return {bytes,mimeType:row.mime_type,width:row.width,height:row.height,aspectRatio:row.aspect_ratio};
  },
  async upsertCompanyLogoSettings({companyId,settings}){
   if(!safe(companyId)||settings?.companyId!==companyId||!safe(settings?.logoAssetId))err("invalid_logo_settings");
   const record=await meta(companyId,settings.logoAssetId);
   if(!record)err("logo_asset_not_found");
   const p=settings.layout;
   if(!p||![p.xPercent,p.yPercent,p.widthPercent].every(Number.isFinite)||
      p.xPercent<0||p.yPercent<0||p.widthPercent<=0||p.widthPercent>60||
      p.xPercent+p.widthPercent>100+0.00001)err("invalid_logo_layout");
   const heightPercent=p.widthPercent*612.24/(record.aspect_ratio*858.96);
   if(heightPercent>30+0.00001||p.yPercent+heightPercent>100+0.00001)err("invalid_logo_layout");
   await db.prepare("INSERT INTO quotation_logo_settings (tenant_id,asset_id,x_percent,y_percent,width_percent,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id) DO UPDATE SET asset_id=excluded.asset_id,x_percent=excluded.x_percent,y_percent=excluded.y_percent,width_percent=excluded.width_percent,updated_at=CURRENT_TIMESTAMP")
    .bind(companyId,settings.logoAssetId,p.xPercent,p.yPercent,p.widthPercent).run();
  },
  async getCompanyLogoSettings({companyId}){
   if(!safe(companyId))err("invalid_company_id");
   const row=await db.prepare("SELECT tenant_id,asset_id,x_percent,y_percent,width_percent FROM quotation_logo_settings WHERE tenant_id=? LIMIT 1")
    .bind(companyId).first();
   return row?{companyId:row.tenant_id,logoAssetId:row.asset_id,layout:{
    xPercent:row.x_percent,yPercent:row.y_percent,widthPercent:row.width_percent}}:null;
  }
 });
}
