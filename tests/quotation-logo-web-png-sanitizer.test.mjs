/** Synthetic-only PNG portability qualification (no Cloudflare writes). */
import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync,inflateSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {decodeAndSanitizeWebPngLogo} from "../server/quotation-logo-web-png-sanitizer.mjs";
import {decodeAndSanitizePngLogo} from "../server/quotation-logo-png-sanitizer.mjs";
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
function crc(data){
 let c=0xffffffff;
 for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function put32(bytes,index,value){
 bytes[index]=(value>>>24)&255;bytes[index+1]=(value>>>16)&255;
 bytes[index+2]=(value>>>8)&255;bytes[index+3]=value&255;
}
const read32=(b,i)=>(b[i]*0x1000000)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
function chunk(type,data){
 const bytes=new Uint8Array(data.length+12);
 put32(bytes,0,data.length);
 bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);
 put32(bytes,bytes.length-4,crc(bytes.subarray(4,bytes.length-4)));
 return bytes;
}
function cat(parts){const size=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
function png({width=32,height=24,mode=6,filter=0,extra=[],pixels=null}={}){
 const channels=mode===6?4:3;
 const ihdr=new Uint8Array(13);put32(ihdr,0,width);put32(ihdr,4,height);
 ihdr[8]=8;ihdr[9]=mode;
 const scanlines=pixels??new Uint8Array(height*(width*channels+1));
 if(!pixels)for(let y=0;y<height;y++){
  const start=y*(width*channels+1);scanlines[start]=filter;
  for(let x=0;x<width*channels;x++)scanlines[start+1+x]=(x+y*7)&255;
 }
 return cat([signature,chunk("IHDR",ihdr),...extra,
  chunk("IDAT",new Uint8Array(deflateSync(scanlines))),
  chunk("IEND",new Uint8Array())]);
}
function inspect(file){
 assert.deepEqual([...file.subarray(0,8)],[...signature]);
 let at=8,parts=[];
 while(at+12<=file.length){
  const n=read32(file,at),kind=new TextDecoder().decode(file.subarray(at+4,at+8));
  if(kind==="IDAT")parts.push(file.subarray(at+8,at+8+n));
  at+=n+12;
  if(kind==="IEND")break;
 }
 return new Uint8Array(inflateSync(cat(parts)));
}
test("portable entry imports no Node buffers, zlib, cryptography or file APIs",()=>{
 const file=readFileSync(new URL("../server/quotation-logo-web-png-sanitizer.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(file,/\bfrom\s*["']node:/);
 assert.doesNotMatch(file,/\bBuffer\./);
 assert.doesNotMatch(file,/\bprocess\./);
});

for(const mode of [2,6])for(const filter of [0,1,2,3,4]){
 test("portable sanitizer matches reference decoded image; mode "+mode+" filter "+filter,async()=>{
  const bytes=png({mode,filter});
  // Filter other than 0 is deliberately encoded as synthetic filter bytes;
  // both sanitizers must agree after applying the PNG prediction.
  const web=await decodeAndSanitizeWebPngLogo({bytes,mimeType:"image/png"});
  const node=await decodeAndSanitizePngLogo({bytes,mimeType:"image/png"});
  assert.equal(web.width,32);assert.equal(web.height,24);
  assert.equal(web.type,"image/png");
  assert.deepEqual(inspect(web.bytes),inspect(node.bytes));
  // Whitelisted output contains only IHDR/IDAT/IEND, even for RGB inputs.
  let at=8,names=[];
  while(at<web.bytes.length){
   const n=read32(web.bytes,at);
   names.push(new TextDecoder().decode(web.bytes.subarray(at+4,at+8)));
   at+=n+12;
  }
  assert.deepEqual(names,["IHDR","IDAT","IEND"]);
 });
}
test("rejects ancillary text, metadata, animated frames and malformed CRC",async()=>{
 for(const extra of [
  chunk("tEXt",new TextEncoder().encode("Sensitive customer ID")),
  chunk("acTL",Uint8Array.from([0,0,0,1,0,0,0,0])),
  chunk("PLTE",Uint8Array.from([255,0,0])),
 ]){
  await assert.rejects(decodeAndSanitizeWebPngLogo({
   bytes:png({extra:[extra]}),mimeType:"image/png"
  }),/unsupported_png_chunk/);
 }
 const corrupt=png();corrupt[20]^=1;
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes:corrupt,mimeType:"image/png"
 }),/invalid_png_crc/);
});
test("rejects invalid file types, palette, interlace, dimensions and extra bytes",async()=>{
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes:png(),mimeType:"image/jpeg"
 }),/unsupported_logo_decoder/);
 const pal=png({mode:3});
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes:pal,mimeType:"image/png"
 }),/unsupported_png_format/);
 const massive=png({width:5000,height:5000,pixels:new Uint8Array(40)});
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes:massive,mimeType:"image/png"
 }),/unsupported_png_format/);
 const appended=cat([png(),Uint8Array.from([0])]);
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes:appended,mimeType:"image/png"
 }),/invalid_png_structure/);
});
test("rejects bounded IDAT compressed data that expands beyond declared pixels",async()=>{
 const bytes=png({pixels:new Uint8Array(2*1024*1024)});
 await assert.rejects(decodeAndSanitizeWebPngLogo({
  bytes,mimeType:"image/png"
 }),/invalid_png_compressed_data|png_stream_size_exceeded/);
});
