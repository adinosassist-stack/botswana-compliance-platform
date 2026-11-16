/**
 * Inert staging contract against the actual D1/R2 adapter and PNG sanitizer.
 * Uses deterministic in-memory emulators for D1 statements and R2 object calls;
 * no Cloudflare account, D1 migration or R2 bucket is modified.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";
import {createNodeStagingQuotationLogoHandler} from "../server/quotation-logo-node-staging.mjs";

const PNG_SIGNATURE=Uint8Array.from([137,80,78,71,13,10,26,10]);
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
function crc(arr){let c=0xffffffff;for(const v of arr)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function write32(a,i,v){a[i]=(v>>>24)&255;a[i+1]=(v>>>16)&255;a[i+2]=(v>>>8)&255;a[i+3]=v&255}
function join(chunks){const out=new Uint8Array(chunks.reduce((s,a)=>s+a.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length}return out}
function pngChunk(type,data){
 const r=new Uint8Array(data.length+12);
 write32(r,0,data.length);r.set(Buffer.from(type),4);r.set(data,8);
 write32(r,r.length-4,crc(r.subarray(4,r.length-4)));return r;
}
function image(){
 const width=32,height=24,header=new Uint8Array(13);write32(header,0,width);write32(header,4,height);header[8]=8;header[9]=6;
 const rows=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*(width*4+1)+x*4+1;rows[p]=45;rows[p+1]=90;rows[p+2]=120;rows[p+3]=255;
 }
 return join([PNG_SIGNATURE,pngChunk("IHDR",header),pngChunk("IDAT",new Uint8Array(deflateSync(rows))),pngChunk("IEND",new Uint8Array())]);
}
function emulator({failInsert=false}={}){
 const assets=new Map(),settings=new Map(),objects=new Map(),events=[];
 const db={prepare(query){
  return {bind(...values){return {
   async first(){
    if(query.includes("FROM quotation_logo_assets"))return assets.get(values[0]+":"+values[1])||null;
    if(query.includes("FROM quotation_logo_settings"))return settings.get(values[0])||null;
    throw Error("unexpected_select");
   },
   async run(){
    if(query.startsWith("INSERT INTO quotation_logo_assets")){
     if(failInsert)throw Error("simulated_d1_error");
     const [id,tenant,object_key,mime_type,width,height,aspect_ratio]=values;
     assets.set(tenant+":"+id,{id,object_key,mime_type,width,height,aspect_ratio});
     events.push("insert_asset");return {success:true,meta:{changes:1}};
    }
    if(query.startsWith("INSERT INTO quotation_logo_settings")){
     const [tenant,asset,x,y,width]=values;
     settings.set(tenant,{tenant_id:tenant,asset_id:asset,x_percent:x,y_percent:y,width_percent:width});
     events.push("save_settings");return {success:true,meta:{changes:1}};
    }
    throw Error("unexpected_insert");
   }
  }}}
 }};
 const bucket={
  async put(key,bytes){objects.set(key,bytes.slice());events.push("put");return {key}},
  async get(key){events.push("get");const bytes=objects.get(key);return bytes?{size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)}:null},
  async delete(key){events.push("delete");objects.delete(key)}
 };
 return {db,bucket,assets,settings,objects,events};
}
function setup({failInsert=false}={}){
 const emu=emulator({failInsert}),store=createQuotationLogoStore({db:emu.db,bucket:emu.bucket});
 const actor={verified:"user-a"};
 const authorization={
  assertCompanyEditor:async({actor:a,companyId})=>a===actor&&companyId==="tenantA",
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId==="tenantA"
 };
 const handler=createNodeStagingQuotationLogoHandler({
  authorization,store,verifyMutation:async({request})=>request.headers.get("x-csrf-token")==="accepted"
 });
 const call=(path,init={},override={})=>handler({actor,companyId:"tenantA",
  request:new Request("https://thebedesk.com"+path,init),...override});
 return {call,emu,store};
}
test("auth upload -> real sanitizer -> real D1 insert + private R2 -> settings -> reload",async()=>{
 const {call,emu}=setup(),raw=image();
 const res=await call("/api/quotation/logo/upload",{method:"POST",
  headers:{"content-type":"image/png","x-csrf-token":"accepted"},body:raw});
 assert.equal(res.status,201);const uploaded=await res.json();
 assert.equal(uploaded.aspectRatio,32/24);
 assert.equal(emu.assets.size,1);assert.equal(emu.objects.size,1);
 assert.deepEqual(emu.events.slice(0,2),["put","insert_asset"]);
 assert.ok([...emu.objects.keys()][0].startsWith("quotation-logos/tenantA/"));
 assert.notDeepEqual([...emu.objects.values()][0],raw);
 const layout={xPercent:4,yPercent:2,widthPercent:22};
 const saved=await call("/api/quotation/logo",{method:"PUT",
  headers:{"content-type":"application/json","x-csrf-token":"accepted"},
  body:JSON.stringify({logoAssetId:uploaded.logoAssetId,aspectRatio:uploaded.aspectRatio,layout})});
 assert.equal(saved.status,200);
 const get=await call("/api/quotation/logo");
 assert.equal(get.status,200);
 assert.equal((await get.json()).settings.layout.widthPercent,22);
 const download=await call("/api/quotation/logo/image");
 assert.equal(download.status,200);
 assert.equal(download.headers.get("content-type"),"image/png");
 assert.deepEqual(new Uint8Array(await download.arrayBuffer()),[...emu.objects.values()][0]);
});
test("cross-tenant uploads/read denied before any private object calls",async()=>{
 const {call,emu}=setup();const raw=image();
 const result=await call("/api/quotation/logo/upload",{method:"POST",
  headers:{"content-type":"image/png","x-csrf-token":"accepted"},body:raw},{companyId:"tenantB"});
 assert.equal(result.status,403);
 assert.equal((await call("/api/quotation/logo/image",{}, {companyId:"tenantB"})).status,403);
 assert.equal(emu.events.length,0);
});
test("private object deleted when D1 insert fails",async()=>{
 const {call,emu}=setup({failInsert:true});
 const res=await call("/api/quotation/logo/upload",{method:"POST",
  headers:{"content-type":"image/png","x-csrf-token":"accepted"},body:image()});
 assert.equal(res.status,500);
 assert.deepEqual(emu.events,["put","delete"]);
 assert.equal(emu.objects.size,0);
});
