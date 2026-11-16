import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {createNodeStagingQuotationLogoHandler} from "../server/quotation-logo-node-staging.mjs";
const sig=Uint8Array.from([137,80,78,71,13,10,26,10]);
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
const crc=b=>{let c=0xffffffff;for(const v of b)c=table[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0};
function put32(b,i,v){b[i]=v>>>24;b[i+1]=v>>>16;b[i+2]=v>>>8;b[i+3]=v}
function cat(arr){let out=new Uint8Array(arr.reduce((n,b)=>n+b.length,0)),p=0;for(const b of arr){out.set(b,p);p+=b.length}return out}
function chunk(t,b){const out=new Uint8Array(b.length+12);put32(out,0,b.length);out.set(Buffer.from(t),4);out.set(b,8);put32(out,out.length-4,crc(out.subarray(4,out.length-4)));return out}
function logo(){
 const width=30,height=20,ihdr=new Uint8Array(13);
 put32(ihdr,0,width);put32(ihdr,4,height);ihdr[8]=8;ihdr[9]=6;
 const rows=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*(width*4+1)+1+x*4;rows[p]=200;rows[p+1]=60;rows[p+2]=20;rows[p+3]=255;
 }
 return cat([sig,chunk("IHDR",ihdr),chunk("IDAT",new Uint8Array(deflateSync(rows))),chunk("IEND",new Uint8Array())]);
}
function harness(){
 const saved=[];
 const actor={session:"trusted"};
 const authorization={assertCompanyEditor:async({actor:a,companyId})=>a===actor&&companyId==="tenantA",
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId==="tenantA"};
 const store={
  writePrivateAsset:async value=>{saved.push(value);return {logoAssetId:"logo1"}},
  readPrivateAsset:async()=>saved.length?{...saved[0],aspectRatio:1.5}:null,
  upsertCompanyLogoSettings:async()=>{},
  getCompanyLogoSettings:async()=>null
 };
 const handler=createNodeStagingQuotationLogoHandler({
  authorization,store,
  verifyMutation:async({request})=>request.headers.get("x-csrf-token")==="verified"
 });
 const send=(bytes,mime="image/png",a=actor)=>handler({
  actor:a,companyId:"tenantA",
  request:new Request("https://thebedesk.com/api/quotation/logo/upload",{
   method:"POST",headers:{"content-type":mime,"x-csrf-token":"verified"},body:bytes})
 });
 return {send,saved};
}
test("real staging composition decodes valid PNG, recompresses and stores server-derived dimensions",async()=>{
 const {send,saved}=harness();const raw=logo();
 const response=await send(raw);
 assert.equal(response.status,201);
 const body=await response.json();assert.equal(body.aspectRatio,1.5);
 assert.equal(saved.length,1);
 assert.equal(saved[0].width,30);assert.equal(saved[0].height,20);
 assert.equal(saved[0].mimeType,"image/png");
 assert.notDeepEqual(saved[0].bytes,raw);
});
test("unauthorized caller cannot use real decoder or storage",async()=>{
 const h=harness();
 const response=await h.send(logo(),"image/png",{session:"invalid"});
 assert.equal(response.status,403);assert.equal(h.saved.length,0);
});
test("unsupported JPEG never reaches private store",async()=>{
 const h=harness();const jpeg=Uint8Array.from([255,216,255,...new Array(80).fill(0)]);
 const response=await h.send(jpeg,"image/jpeg");
 assert.notEqual(response.status,201);assert.equal(h.saved.length,0);
});
test("malformed compressed PNG never reaches private store",async()=>{
 const h=harness();const corrupted=logo().slice();corrupted[45]^=1;
 const response=await h.send(corrupted);
 assert.notEqual(response.status,201);assert.equal(h.saved.length,0);
});
test("staging composition refuses to initialize without auth or private storage",()=>{
 assert.throws(()=>createNodeStagingQuotationLogoHandler({}),/unconfigured/);
});
