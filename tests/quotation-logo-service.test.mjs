import test from "node:test";
import assert from "node:assert/strict";
import {uploadCompanyQuotationLogo,saveCompanyQuotationLogo,getCompanyQuotationLogo} from "../server/quotation-logo-service.mjs";
const auth={
 assertCompanyEditor:async({actor,companyId})=>actor?.companyId===companyId&&actor?.role==="editor",
 assertCompanyReader:async({actor,companyId})=>actor?.companyId===companyId
};
const assets=new Map(),settings=new Map();
const store={
 async writePrivateAsset({companyId,mimeType,bytes,width,height}){
  const logoAssetId="asset"+(assets.size+1);
  assets.set(companyId+":"+logoAssetId,{mimeType,bytes,aspectRatio:width/height});
  return {logoAssetId};
 },
 async readPrivateAsset({companyId,logoAssetId}){return assets.get(companyId+":"+logoAssetId)||null},
 async upsertCompanyLogoSettings({companyId,settings:record}){settings.set(companyId,record)},
 async getCompanyLogoSettings({companyId}){return settings.get(companyId)||null}
};
const file={type:"image/png",bytes:Uint8Array.from([137,80,78,71,13,10,26,10,...new Array(100).fill(0)]),width:200,height:100};
test("fail closed until authorization and private store configured",async()=>{
 await assert.rejects(uploadCompanyQuotationLogo({actor:{},companyId:"a",file}),/logo_backend_not_configured/);
});
test("only authenticated company editor may upload and set own logo",async()=>{
 const actor={companyId:"a",role:"editor"};
 const result=await uploadCompanyQuotationLogo({actor,companyId:"a",file,authorization:auth,store});
 assert.equal(result.aspectRatio,2);
 const saved=await saveCompanyQuotationLogo({actor,companyId:"a",logoAssetId:result.logoAssetId,aspectRatio:2,layout:{xPercent:10,yPercent:7,widthPercent:40},authorization:auth,store});
 assert.equal(saved.layout.xPercent,10);
 const read=await getCompanyQuotationLogo({actor:{companyId:"a",role:"reader"},companyId:"a",authorization:auth,store});
 assert.equal(read.settings.logoAssetId,result.logoAssetId);
 await assert.rejects(saveCompanyQuotationLogo({actor:{companyId:"b",role:"editor"},companyId:"b",logoAssetId:result.logoAssetId,aspectRatio:2,authorization:auth,store}),/logo_asset_not_found/);
});
test("other tenant and noneditor cannot upload or change settings",async()=>{
 await assert.rejects(uploadCompanyQuotationLogo({actor:{companyId:"b",role:"editor"},companyId:"a",file,authorization:auth,store}),/logo_access_denied/);
 await assert.rejects(uploadCompanyQuotationLogo({actor:{companyId:"a",role:"reader"},companyId:"a",file,authorization:auth,store}),/logo_access_denied/);
 await assert.rejects(getCompanyQuotationLogo({actor:{companyId:"b",role:"reader"},companyId:"a",authorization:auth,store}),/logo_access_denied/);
});
test("saved layout cannot lie about image aspect ratio",async()=>{
 const actor={companyId:"a",role:"editor"};
 await assert.rejects(saveCompanyQuotationLogo({actor,companyId:"a",logoAssetId:"asset1",aspectRatio:1,authorization:auth,store}),/logo_aspect_ratio_mismatch/);
});
