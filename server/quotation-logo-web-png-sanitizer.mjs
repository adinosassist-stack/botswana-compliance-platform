/**
 * Portable, PNG-only quotation logo sanitizer for Workers and Node 22+.
 * Same accepted format and strict metadata-removal policy as Node reference
 * implementation, using standard CompressionStream/DecompressionStream rather
 * than node:zlib. UNMOUNTED. Not a JPEG decoder or feature activation.
 *
 * Accepts 8-bit non-interlaced RGB/RGBA PNG with IHDR, IDAT, IEND only.
 * Rejects animation/palette/ancillary chunks and invalid CRC, filters, sizes.
 * Bounds decompression and compression as bytes are read to avoid zip bombs.
 */
const MAX_BYTES=2*1024*1024, MAX_PIXELS=8_000_000;
const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
const fail=code=>{throw Error(code)};
const match=(a,b,offset=0)=>b.every((v,i)=>a[offset+i]===v);
const read32=(b,i)=>((b[i]*0x1000000)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0;
function put32(b,i,v){b[i]=(v>>>24)&255;b[i+1]=(v>>>16)&255;b[i+2]=(v>>>8)&255;b[i+3]=v&255;}
// CRC-32 is PNG framing integrity, not authentication.
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
 let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 crcTable[n]=c>>>0;
}
function crc32(bytes){
 let c=0xffffffff;
 for(const v of bytes)c=crcTable[(c^v)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function chunk(type,data){
 const name=Uint8Array.from(type.split("").map(c=>c.charCodeAt(0)));
 const out=new Uint8Array(data.length+12);
 put32(out,0,data.length);out.set(name,4);out.set(data,8);
 put32(out,out.length-4,crc32(out.subarray(4,out.length-4)));
 return out;
}
function join(parts,limit){
 const size=parts.reduce((sum,p)=>sum+p.byteLength,0);
 if(!Number.isSafeInteger(size)||size>limit)fail("png_stream_size_exceeded");
 const out=new Uint8Array(size);let at=0;
 for(const part of parts){out.set(part,at);at+=part.byteLength}
 return out;
}
const paeth=(a,b,c)=>{
 const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
 return da<=db&&da<=dc?a:db<=dc?b:c;
};
async function transformBounded(data,kind,limit){
 const Constructor=kind==="inflate"?globalThis.DecompressionStream:globalThis.CompressionStream;
 if(typeof Constructor!=="function")fail("quotation_logo_web_streams_unavailable");
 let stream;
 try{stream=new Constructor("deflate")}
 catch{fail("quotation_logo_deflate_unavailable")}
 const writer=stream.writable.getWriter(),reader=stream.readable.getReader();
 let pumpError;
 const pump=(async()=>{try{await writer.write(data);await writer.close()}
  catch(error){pumpError=error}})();
 const output=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))fail("invalid_png_stream_chunk");
   total+=value.byteLength;
   if(total>limit)fail("png_stream_size_exceeded");
   output.push(value.slice());
  }
  await pump;
  if(pumpError)fail("invalid_png_compressed_data");
  return join(output,limit);
 }catch{
  try{await reader.cancel()}catch{}
  try{await writer.abort()}catch{}
  await pump;
  fail("invalid_png_compressed_data");
 }finally{
  reader.releaseLock();
  writer.releaseLock();
 }
}
export async function decodeAndSanitizeWebPngLogo({bytes,mimeType}={}){
 if(mimeType!=="image/png")fail("unsupported_logo_decoder");
 if(!(bytes instanceof Uint8Array)||bytes.length<57||
    bytes.length>MAX_BYTES||!match(bytes,signature))fail("invalid_png_logo");
 let pos=8,width=0,height=0,channels=0;
 let seenIHDR=false,seenIDAT=false,seenIEND=false;
 const compressed=[];
 while(pos+12<=bytes.length){
  const length=read32(bytes,pos);
  if(length>MAX_BYTES||pos+12+length>bytes.length)fail("invalid_png_chunk");
  const type=String.fromCharCode(...bytes.subarray(pos+4,pos+8));
  const payload=bytes.subarray(pos+8,pos+8+length);
  if(crc32(bytes.subarray(pos+4,pos+8+length))!==read32(bytes,pos+8+length))
   fail("invalid_png_crc");
  pos+=12+length;
  if(type==="IHDR"){
   if(seenIHDR||seenIDAT||length!==13)fail("invalid_png_header");
   seenIHDR=true;width=read32(payload,0);height=read32(payload,4);
   if(width<30||height<20||width>5000||height>5000||width*height>MAX_PIXELS||
      payload[8]!==8||![2,6].includes(payload[9])||
      payload[10]!==0||payload[11]!==0||payload[12]!==0)
    fail("unsupported_png_format");
   channels=payload[9]===2?3:4;
  }else if(type==="IDAT"){
   if(!seenIHDR||seenIEND)fail("invalid_png_structure");
   seenIDAT=true;compressed.push(payload);
  }else if(type==="IEND"){
   if(!seenIHDR||!seenIDAT||seenIEND||length!==0||pos!==bytes.length)
    fail("invalid_png_structure");
   seenIEND=true;break;
  }else{
   // No metadata or extensions, including APNG, color profiles, comments,
   // text, external references or palette transparency, survive this pass.
   fail("unsupported_png_chunk");
  }
 }
 if(!seenIHDR||!seenIDAT||!seenIEND)fail("invalid_png_structure");
 const stride=width*channels,needed=height*(stride+1);
 if(needed>MAX_PIXELS*4+5000)fail("png_decompressed_size_exceeded");
 const zipped=join(compressed,MAX_BYTES);
 const decoded=await transformBounded(zipped,"inflate",needed);
 if(decoded.length!==needed)fail("invalid_png_pixels");
 const reconstructed=new Uint8Array(height*stride);
 const rgba=new Uint8Array(height*(width*4+1));
 let src=0;
 for(let y=0;y<height;y++){
  const filter=decoded[src++];if(filter>4)fail("invalid_png_filter");
  const base=y*stride,prior=(y-1)*stride;
  for(let x=0;x<stride;x++){
   const raw=decoded[src++];
   const left=x>=channels?reconstructed[base+x-channels]:0;
   const up=y?reconstructed[prior+x]:0;
   const upperLeft=y&&x>=channels?reconstructed[prior+x-channels]:0;
   const predict=filter===0?0:filter===1?left:filter===2?up:
    filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
   reconstructed[base+x]=(raw+predict)&255;
  }
  const start=y*(width*4+1);rgba[start]=0;
  for(let x=0;x<width;x++){
   const from=base+x*channels,to=start+1+x*4;
   rgba[to]=reconstructed[from];rgba[to+1]=reconstructed[from+1];
   rgba[to+2]=reconstructed[from+2];
   rgba[to+3]=channels===4?reconstructed[from+3]:255;
  }
 }
 const ihdr=new Uint8Array(13);
 put32(ihdr,0,width);put32(ihdr,4,height);ihdr[8]=8;ihdr[9]=6;
 const zippedRgba=await transformBounded(rgba,"deflate",MAX_BYTES);
 const sanitized=join([signature,chunk("IHDR",ihdr),
  chunk("IDAT",zippedRgba),chunk("IEND",new Uint8Array())],MAX_BYTES);
 return Object.freeze({type:"image/png",bytes:sanitized,width,height});
}
