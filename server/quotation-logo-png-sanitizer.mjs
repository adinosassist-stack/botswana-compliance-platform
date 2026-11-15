/**
 * Node-only PNG sanitizer for quotation logos. Does not depend on user-provided
 * dimensions or metadata. Handles non-interlaced 8-bit RGB/RGBA PNG, converts
 * to RGBA PNG using a fresh unfiltered scanline stream. Rejects all ancillary
 * chunks, animation, palettes, interlacing and unsupported colour models.
 *
 * This is NOT a JPEG/WebP decoder, and MUST NOT be mounted in Cloudflare
 * Workers. For such runtimes use a separately reviewed image processing adapter.
 */
import {inflateSync,deflateSync} from "node:zlib";

const MAX_BYTES=2*1024*1024,MAX_PIXELS=8_000_000;
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
const fail=code=>{throw Error(code)};
const match=(a,b,offset=0)=>b.every((v,i)=>a[offset+i]===v);
const read32=(b,i)=>((b[i]*0x1000000)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0;
function put32(b,i,v){b[i]=(v>>>24)&255;b[i+1]=(v>>>16)&255;b[i+2]=(v>>>8)&255;b[i+3]=v&255}
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
 let c=n;
 for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 crcTable[n]=c>>>0;
}
function crc32(b){let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(type,data){
 const t=Uint8Array.from(type.split("").map(c=>c.charCodeAt(0)));
 const out=new Uint8Array(12+data.length);put32(out,0,data.length);out.set(t,4);out.set(data,8);
 put32(out,out.length-4,crc32(out.subarray(4,out.length-4)));return out;
}
const cat=(chunks)=>{
 const total=chunks.reduce((n,v)=>n+v.length,0);
 const out=new Uint8Array(total);let pos=0;
 for(const value of chunks){out.set(value,pos);pos+=value.length}
 return out;
};
const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c};
export async function decodeAndSanitizePngLogo({bytes,mimeType}={}){
 if(mimeType!=="image/png")fail("unsupported_logo_decoder");
 if(!(bytes instanceof Uint8Array)||bytes.length<57||bytes.length>MAX_BYTES||!match(bytes,signature))
  fail("invalid_png_logo");
 let pos=8,width=0,height=0,channels=0,seenIHDR=false,seenIEND=false,seenIDAT=false;
 const compressed=[];
 while(pos+12<=bytes.length){
  const length=read32(bytes,pos);if(length>MAX_BYTES||pos+12+length>bytes.length)fail("invalid_png_chunk");
  const t=String.fromCharCode(...bytes.subarray(pos+4,pos+8));
  const payload=bytes.subarray(pos+8,pos+8+length);
  const actual=read32(bytes,pos+8+length);
  if(crc32(bytes.subarray(pos+4,pos+8+length))!==actual)fail("invalid_png_crc");
  pos+=12+length;
  if(t==="IHDR"){
   if(seenIHDR||seenIDAT||length!==13)fail("invalid_png_header");
   seenIHDR=true;width=read32(payload,0);height=read32(payload,4);
   const depth=payload[8],colour=payload[9],compression=payload[10],filter=payload[11],interlace=payload[12];
   if(!width||!height||width<30||height<20||width>5000||height>5000||
      width*height>MAX_PIXELS||depth!==8||![2,6].includes(colour)||
      compression!==0||filter!==0||interlace!==0)fail("unsupported_png_format");
   channels=colour===2?3:4;
  }else if(t==="IDAT"){
   if(!seenIHDR||seenIEND)fail("invalid_png_structure");
   seenIDAT=true;compressed.push(payload);
  }else if(t==="IEND"){
   if(!seenIHDR||!seenIDAT||seenIEND||length!==0||pos!==bytes.length)
    fail("invalid_png_structure");
   seenIEND=true;break;
  }else{
   // Decline metadata and extension chunks altogether. No passive metadata
   // retained, and APNG colour/animation cannot sneak through.
   fail("unsupported_png_chunk");
  }
 }
 if(!seenIEND||!seenIHDR||!seenIDAT)fail("invalid_png_structure");
 const stride=width*channels,needed=height*(stride+1);
 if(needed>MAX_PIXELS*4+5000)fail("png_decompressed_size_exceeded");
 let decoded;
 try{decoded=inflateSync(cat(compressed),{maxOutputLength:needed+1})}
 catch{fail("invalid_png_compressed_data")}
 if(decoded.byteLength!==needed)fail("invalid_png_pixels");
 const reconstructed=new Uint8Array(height*stride),rgba=new Uint8Array(height*(width*4+1));
 let src=0;
 for(let y=0;y<height;y++){
  const filter=decoded[src++];if(filter>4)fail("invalid_png_filter");
  const base=y*stride,prior=(y-1)*stride;
  for(let x=0;x<stride;x++){
   const raw=decoded[src++],left=x>=channels?reconstructed[base+x-channels]:0,
    up=y?reconstructed[prior+x]:0,
    upperLeft=y&&x>=channels?reconstructed[prior+x-channels]:0;
   const prediction=filter===0?0:filter===1?left:filter===2?up:
     filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
   reconstructed[base+x]=(raw+prediction)&255;
  }
  const outStart=y*(width*4+1);rgba[outStart]=0;
  for(let x=0;x<width;x++){
   const from=base+x*channels,to=outStart+1+x*4;
   rgba[to]=reconstructed[from];rgba[to+1]=reconstructed[from+1];
   rgba[to+2]=reconstructed[from+2];rgba[to+3]=channels===4?reconstructed[from+3]:255;
  }
 }
 const ihdr=new Uint8Array(13);put32(ihdr,0,width);put32(ihdr,4,height);ihdr[8]=8;ihdr[9]=6;
 const sanitized=cat([signature,chunk("IHDR",ihdr),chunk("IDAT",new Uint8Array(deflateSync(rgba,{level:9}))),chunk("IEND",new Uint8Array())]);
 if(sanitized.byteLength>MAX_BYTES)fail("sanitized_logo_too_large");
 return Object.freeze({type:"image/png",bytes:sanitized,width,height});
}
