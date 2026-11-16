import test from "node:test";
import assert from "node:assert/strict";
import {deflateSync} from "node:zlib";
import {decodeAndSanitizePngLogo} from "../server/quotation-logo-png-sanitizer.mjs";
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):c>>>1;table[n]=c>>>0}
const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const put32=(b,i,v)=>{b[i]=v>>>24;b[i+1]=v>>>16;b[i+2]=v>>>8;b[i+3]=v};
function concat(a){let size=0;for(const x of a)size+=x.length;let out=new Uint8Array(size),n=0;for(const x of a){out.set(x,n);n+=x.length}return out}
function chunk(name,value){let out=new Uint8Array(value.length+12);put32(out,0,value.length);out.set(Buffer.from(name),4);out.set(value,8);put32(out,out.length-4,crc(out.subarray(4,out.length-4)));return out}
function fixture({width=30,height=20,colour=6,filter=0,interlace=0}={}){
 const stride=width*(colour===6?4:3),scanline=new Uint8Array(height*(stride+1));
 for(let y=0;y<height;y++){scanline[y*(stride+1)]=filter;for(let j=0;j<stride;j++)scanline[y*(stride+1)+j+1]=(y*7+j)%256}
 const ihdr=new Uint8Array(13);put32(ihdr,0,width);put32(ihdr,4,height);ihdr[8]=8;ihdr[9]=colour;ihdr[12]=interlace;
 return concat([signature,chunk("IHDR",ihdr),chunk("IDAT",new Uint8Array(deflateSync(scanline))),chunk("IEND",new Uint8Array())]);
}
test("real 8-bit RGBA PNG decode and metadata-free re-encode preserves dimensions",async()=>{
 const original=fixture(),out=await decodeAndSanitizePngLogo({bytes:original,mimeType:"image/png"});
 assert.equal(out.width,30);assert.equal(out.height,20);assert.equal(out.type,"image/png");
 assert.notDeepEqual(out.bytes,original);
 assert.equal((await decodeAndSanitizePngLogo({bytes:out.bytes,mimeType:"image/png"})).height,20);
});
test("real RGB PNG converts to RGBA and validates dimensions",async()=>{
 const out=await decodeAndSanitizePngLogo({bytes:fixture({colour:2}),mimeType:"image/png"});
 assert.equal(out.bytes[25],6);
});
test("rejects checksum corruption, malformed bytes, metadata, and interlacing",async()=>{
 let invalid=fixture();invalid=invalid.slice();invalid[50]^=1;
 await assert.rejects(decodeAndSanitizePngLogo({bytes:invalid,mimeType:"image/png"}),/invalid_png_crc/);
 await assert.rejects(decodeAndSanitizePngLogo({bytes:fixture({interlace:1}),mimeType:"image/png"}),/unsupported_png_format/);
 await assert.rejects(decodeAndSanitizePngLogo({bytes:fixture(),mimeType:"image/jpeg"}),/unsupported_logo_decoder/);
 const source=fixture();
 const withMetadata=concat([source.slice(0,33),chunk("tEXt",Buffer.from("comment\\0hidden")),source.slice(33)]);
 await assert.rejects(decodeAndSanitizePngLogo({bytes:withMetadata,mimeType:"image/png"}),/unsupported_png_chunk/);
});
test("rejects excessive dimensions before decompression",async()=>{
 await assert.rejects(decodeAndSanitizePngLogo({bytes:fixture({width:30,height:20}).slice(0,8),mimeType:"image/png"}),/invalid_png_logo/);
 const huge=fixture();huge[19]=255; // invalidate IHDR CRC as well
 await assert.rejects(decodeAndSanitizePngLogo({bytes:huge,mimeType:"image/png"}));
});
