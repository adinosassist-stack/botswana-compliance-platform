/**
 * Fail-closed private D1 / R2 acknowledgement regressions. Synthetic only.
 * No Cloudflare calls, database migration or customer files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";

const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
const expected={companyId:"tenantA",mimeType:"image/png",bytes,width:100,height:50};

function fixture({insertResult={success:true,meta:{changes:1}},
 settingsResult={success:true,meta:{changes:1}},failRead=false,
 failDelete=false,commitOnThrow=false}={}){
 const objects=new Map(),records=new Map(),settings=new Map(),log=[];
 const bucket={
  async put(key,data){objects.set(key,data.slice());log.push("r2_put")},
  async get(key){return objects.has(key)?{size:objects.get(key).length,
   arrayBuffer:async()=>objects.get(key).buffer.slice(0)}:null},
  async delete(key){
   log.push("r2_delete");
   if(failDelete)throw Error("synthetic_delete_failure");
   objects.delete(key);
  }
 };
 const db={prepare(sql){return{bind(...args){return {
  async first(){
   log.push("d1_read");
   if(failRead)throw Error("simulated_d1_read_failure");
   if(sql.includes("FROM quotation_logo_assets"))
    return records.get(args[0]+"|"+args[1])??null;
   if(sql.includes("FROM quotation_logo_settings"))return settings.get(args[0])??null;
   throw Error("unexpected_query");
  },
  async run(){
   if(sql.startsWith("INSERT INTO quotation_logo_assets")){
    log.push("d1_insert");
    const [id,tenant,key,mime_type,width,height,aspect_ratio]=args;
    if((insertResult?.success===true&&insertResult?.meta?.changes===1)||commitOnThrow)
     records.set(tenant+"|"+id,{id,object_key:key,mime_type,width,height,aspect_ratio});
    if(commitOnThrow)throw Error("synthetic_response_lost_after_commit");
    if(insertResult instanceof Error)throw insertResult;
    return insertResult;
   }
   if(sql.startsWith("INSERT INTO quotation_logo_settings")){
    log.push("d1_save_settings");
    if(settingsResult?.success===true&&settingsResult?.meta?.changes===1){
     const [tenant,asset,x,y,width]=args;
     settings.set(tenant,{tenant_id:tenant,asset_id:asset,
      x_percent:x,y_percent:y,width_percent:width});
    }
    return settingsResult;
   }
   throw Error("unexpected_write");
  }
 }}}}};
 return {store:createQuotationLogoStore({db,bucket}),objects,records,settings,log};
}

test("success requires one-row metadata acknowledgement, not just an R2 put",async()=>{
 const f=fixture();
 const {logoAssetId}=await f.store.writePrivateAsset(expected);
 assert.match(logoAssetId,/^[a-f0-9]{32}$/);
 assert.equal(f.objects.size,1);
 assert.equal(f.records.size,1);
 assert.deepEqual(f.log,["r2_put","d1_insert"]);
});

test("negative D1 acknowledgement with no persisted row deletes private R2 blob",async()=>{
 const f=fixture({insertResult:{success:false,meta:{changes:0}}});
 await assert.rejects(f.store.writePrivateAsset(expected),
  /quotation_logo_d1_write_unverified/);
 assert.deepEqual(f.log,["r2_put","d1_insert","d1_read","r2_delete"]);
 assert.equal(f.objects.size,0);
 assert.equal(f.records.size,0);
});

test("zero changes D1 acknowledgement with no row also triggers cleanup",async()=>{
 const f=fixture({insertResult:{success:true,meta:{changes:0}}});
 await assert.rejects(f.store.writePrivateAsset(expected),
  /quotation_logo_d1_write_unverified/);
 assert.equal(f.objects.size,0);
 assert.equal(f.records.size,0);
});

test("lost response AFTER a valid commit must not delete its R2 object",async()=>{
 const f=fixture({insertResult:new Error("unknown"),commitOnThrow:true});
 const result=await f.store.writePrivateAsset(expected);
 assert.equal(f.objects.size,1);
 assert.equal(f.records.size,1);
 assert.ok(!f.log.includes("r2_delete"));
 assert.ok(f.records.has("tenantA|"+result.logoAssetId));
});

test("unavailable D1 readback fails without deleting potentially referenced R2",async()=>{
 const f=fixture({insertResult:new Error("ambiguous_d1_write"),failRead:true});
 await assert.rejects(f.store.writePrivateAsset(expected),
  /quotation_logo_d1_commit_indeterminate/);
 assert.equal(f.objects.size,1);
 assert.ok(!f.log.includes("r2_delete"));
});

test("R2 cleanup failure is explicit and never reported as successful upload",async()=>{
 const f=fixture({insertResult:{success:false,meta:{changes:0}},failDelete:true});
 await assert.rejects(f.store.writePrivateAsset(expected),
  /quotation_logo_orphan_cleanup_failed/);
 assert.equal(f.objects.size,1);
});

test("logo settings fail closed on negative or zero-row D1 acknowledgements",async()=>{
 for(const failed of [{success:false,meta:{changes:0}},
  {success:true,meta:{changes:0}}]){
  const f=fixture({settingsResult:failed});
  const {logoAssetId}=await f.store.writePrivateAsset(expected);
  await assert.rejects(f.store.upsertCompanyLogoSettings({
   companyId:"tenantA",settings:{companyId:"tenantA",logoAssetId,
    layout:{xPercent:4,yPercent:2,widthPercent:22}}
  }),/quotation_logo_d1_write_unverified/);
  assert.equal(f.settings.size,0);
 }
});
