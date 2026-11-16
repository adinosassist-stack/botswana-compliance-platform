import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";
const schema=readFileSync(new URL("../docs/sql/quotation-logo-staging-candidate.sql",import.meta.url),"utf8");
test("schema keys logo assets and settings by tenant",()=>{
 assert.match(schema,/PRIMARY KEY \(tenant_id,id\)/);
 assert.match(schema,/FOREIGN KEY \(tenant_id,asset_id\) REFERENCES quotation_logo_assets\(tenant_id,id\)/);
});
function fixture(){
 const objects=new Map(),assets=new Map(),settings=new Map(),log=[];
 const bucket={
  async put(k,b){objects.set(k,b);log.push(["put",k])},
  async get(k){const b=objects.get(k);return b?{size:b.byteLength,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null},
  async delete(k){objects.delete(k);log.push(["delete",k])}
 };
 const db={prepare(sql){
  return {bind(...args){return {
   async first(){
    if(sql.includes("FROM quotation_logo_assets")){const [tenant,id]=args;return assets.get(tenant+":"+id)||null}
    if(sql.includes("FROM quotation_logo_settings")){return settings.get(args[0])||null}
    throw Error("unexpected_read_sql");
   },async run(){
    if(sql.includes("INSERT INTO quotation_logo_assets")){
     const [id,tenant,object_key,mime_type,width,height,aspect_ratio]=args;
     assets.set(tenant+":"+id,{id,object_key,mime_type,width,height,aspect_ratio});return;
    }
    if(sql.includes("INSERT INTO quotation_logo_settings")){
     const [tenant,asset,x,y,width]=args;
     settings.set(tenant,{tenant_id:tenant,asset_id:asset,x_percent:x,y_percent:y,width_percent:width});return;
    }
    throw Error("unexpected_write_sql");
   }
  }}}
 }};
 return {store:createQuotationLogoStore({db,bucket}),log};
}
test("private object is company-keyed and cannot be read across tenants",async()=>{
 const {store}=fixture();
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
 const {logoAssetId}=await store.writePrivateAsset({companyId:"a",mimeType:"image/png",bytes,width:200,height:100});
 assert.equal((await store.readPrivateAsset({companyId:"a",logoAssetId})).aspectRatio,2);
 assert.equal(await store.readPrivateAsset({companyId:"b",logoAssetId}),null);
 await assert.rejects(store.upsertCompanyLogoSettings({companyId:"b",settings:{
  companyId:"b",logoAssetId,layout:{xPercent:4,yPercent:2,widthPercent:34}}}),/logo_asset_not_found/);
 await store.upsertCompanyLogoSettings({companyId:"a",settings:{
  companyId:"a",logoAssetId,layout:{xPercent:4,yPercent:2,widthPercent:34}}});
 const settings=await store.getCompanyLogoSettings({companyId:"a"});
 assert.equal(settings.logoAssetId,logoAssetId);
 assert.equal(await store.getCompanyLogoSettings({companyId:"b"}),null);
});
test("rejects out-of-bounds height even if width alone passes",async()=>{
 const {store}=fixture();
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
 const {logoAssetId}=await store.writePrivateAsset({companyId:"a",mimeType:"image/png",bytes,width:100,height:900});
 await assert.rejects(store.upsertCompanyLogoSettings({companyId:"a",settings:{
  companyId:"a",logoAssetId,layout:{xPercent:0,yPercent:0,widthPercent:30}}}),/invalid_logo_layout/);
});
