/** Unmounted private R2 binding for authenticated document exports.
 * Caller supplies a private-only R2 bucket. Never returns a public URL.
 */
import {createHash,timingSafeEqual} from "node:crypto";
const MAX=20*1024*1024;
const validKey=key=>typeof key==="string"&&/^ai-exports\/[a-zA-Z0-9_.:-]{1,200}\/[a-zA-Z0-9_.:-]{1,200}$/.test(key);
export function createAiExportR2Binding({binding,clock=()=>Date.now()}={}){
 if(!binding||typeof binding.put!=="function"||typeof binding.get!=="function"||typeof clock!=="function")throw new TypeError("r2_private_binding_required");
 return Object.freeze({
  async putObject({key,body,visibility,expiresAt}={}){
   if(visibility!=="private"||!validKey(key)||!Buffer.isBuffer(body)||body.length<1||body.length>MAX||
      !Number.isSafeInteger(expiresAt)||expiresAt<=clock())throw Error("private_r2_write_required");
   const sha256=createHash("sha256").update(body).digest("hex");
   await binding.put(key,body,{customMetadata:{expiresAt:String(expiresAt),sha256}});
  },
  async getObject({key,visibility}={}){
   if(visibility!=="private"||!validKey(key))return null;
   const obj=await binding.get(key);
   if(!obj)return null;
   // Missing expiry metadata is a denial, not infinite retention.
   const raw=obj.customMetadata?.expiresAt;
   if(typeof raw!=="string"||!/^[1-9][0-9]*$/.test(raw))return null;
   const expiry=Number(raw);
   if(!Number.isSafeInteger(expiry)||expiry<=clock())return null;
   // R2 must report its size before we allocate an ArrayBuffer.
   if(!Number.isSafeInteger(obj.size)||obj.size<1||obj.size>MAX)return null;
   // Object metadata without an intact content hash is never treated as an export.
   const expected=obj.customMetadata?.sha256;
   if(typeof expected!=="string"||!/^[a-f0-9]{64}$/.test(expected))return null;
   if(typeof obj.arrayBuffer!=="function")return null;
   const bytes=await obj.arrayBuffer();
   if(!bytes||!Number.isSafeInteger(bytes.byteLength)||bytes.byteLength<1||bytes.byteLength>MAX)return null;
   const buffer=Buffer.from(bytes);
   if(buffer.length!==obj.size)return null;
   const actual=createHash("sha256").update(buffer).digest();
   if(!timingSafeEqual(actual,Buffer.from(expected,"hex")))return null;
   return buffer;
  }
 });
}
