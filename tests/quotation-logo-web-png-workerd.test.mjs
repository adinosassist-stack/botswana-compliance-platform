/**
 * Actual local workerd/Miniflare compatibility qualification for the
 * source-only quotation PNG sanitizer. Never deploys, mounts a public route,
 * accesses production or sends customer images anywhere.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";

const logoSource=readFileSync(new URL("../server/quotation-logo-web-png-sanitizer.mjs",import.meta.url),"utf8");
const workerSource=logoSource+`
export default {
 async fetch(request){
  if(new URL(request.url).pathname!=="/synthetic-sanitize")
   return new Response("not_found",{status:404});
  try{
   const processed=await decodeAndSanitizeWebPngLogo({
    bytes:new Uint8Array(await request.arrayBuffer()),
    mimeType:request.headers.get("content-type")
   });
   return new Response(processed.bytes,{
    status:200,headers:{"content-type":processed.type,
      "x-image-width":String(processed.width),
      "x-image-height":String(processed.height)}
   });
  }catch(error){
   return new Response(String(error.message||"invalid_image"),{status:422});
  }
 }
};
`;

const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let n=i;for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;
 return n>>>0;
});
const w32=(a,i,n)=>{a[i]=(n>>>24)&255;a[i+1]=(n>>>16)&255;a[i+2]=(n>>>8)&255;a[i+3]=n&255};
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
const join=parts=>{let n=parts.reduce((v,p)=>v+p.length,0),o=new Uint8Array(n),i=0;for(const p of parts){o.set(p,i);i+=p.length}return o};
function chunk(tag,data){
 const v=new Uint8Array(data.length+12);w32(v,0,data.length);
 v.set(new TextEncoder().encode(tag),4);v.set(data,8);
 w32(v,v.length-4,crc(v.subarray(4,v.length-4)));return v;
}
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
function syntheticPng({metadata=false,invalidFilter=false}={}){
 const width=32,height=24,header=new Uint8Array(13);
 w32(header,0,width);w32(header,4,height);header[8]=8;header[9]=6;
 const pixels=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++){
  pixels[y*(width*4+1)]=invalidFilter?5:0;
  for(let x=0;x<width;x++){
   const pos=y*(width*4+1)+1+x*4;
   pixels[pos]=21;pixels[pos+1]=90;pixels[pos+2]=190;pixels[pos+3]=255;
  }
 }
 return join([signature,chunk("IHDR",header),
  ...(metadata?[chunk("tEXt",new TextEncoder().encode("Private EXIF-like metadata"))]:[]),
  chunk("IDAT",new Uint8Array(deflateSync(pixels))),
  chunk("IEND",new Uint8Array())]);
}
async function setup(t){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:workerSource,compatibilityDate:"2026-09-25"
 }));
 t.after(()=>mf.dispose());
 return mf;
}
test("workerd: stream decoding, clean image re-encode and real geometry",async t=>{
 const mf=await setup(t);
 const res=await mf.dispatchFetch("http://localhost/synthetic-sanitize",{
  method:"POST",headers:{"content-type":"image/png"},
  body:syntheticPng()
 });
 assert.equal(res.status,200,await res.clone().text());
 assert.equal(res.headers.get("content-type"),"image/png");
 assert.equal(res.headers.get("x-image-width"),"32");
 assert.equal(res.headers.get("x-image-height"),"24");
 const bytes=new Uint8Array(await res.arrayBuffer());
 assert.deepEqual(bytes.subarray(0,8),signature);
 assert.ok(bytes.length<2*1024*1024);
});
test("workerd: rejects metadata, bad PNG filters and unsupported JPEG",async t=>{
 const mf=await setup(t);
 for(const [blob,type,reason] of [
  [syntheticPng({metadata:true}),"image/png","unsupported_png_chunk"],
  [syntheticPng({invalidFilter:true}),"image/png","invalid_png_filter"],
  [syntheticPng(),"image/jpeg","unsupported_logo_decoder"]
 ]){
  const res=await mf.dispatchFetch("http://localhost/synthetic-sanitize",{
   method:"POST",headers:{"content-type":type},body:blob
  });
  assert.equal(res.status,422);
  assert.equal(await res.text(),reason);
 }
 const absent=await mf.dispatchFetch("http://localhost/not-mounted");
 assert.equal(absent.status,404);
});
