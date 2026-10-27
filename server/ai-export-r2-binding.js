/** Unmounted private R2 binding for authenticated document exports.
 * Caller supplies a private-only R2 bucket. Never returns a public URL.
 */
const MAX=20*1024*1024;
const validKey=key=>typeof key==="string"&&/^ai-exports\/[a-zA-Z0-9_.:-]{1,200}\/[a-zA-Z0-9_.:-]{1,200}$/.test(key);
export function createAiExportR2Binding({binding,clock=()=>Date.now()}={}){
 if(!binding||typeof binding.put!=="function"||typeof binding.get!=="function"||typeof clock!=="function")throw new TypeError("r2_private_binding_required");
 return Object.freeze({
  async putObject({key,body,visibility,expiresAt}={}){
   if(visibility!=="private"||!validKey(key)||!Buffer.isBuffer(body)||body.length<1||body.length>MAX||
      !Number.isSafeInteger(expiresAt)||expiresAt<=clock())throw Error("private_r2_write_required");
   await binding.put(key,body,{customMetadata:{expiresAt:String(expiresAt)}});
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
   if(obj.size!==undefined&&(!Number.isSafeInteger(obj.size)||obj.size<1||obj.size>MAX))return null;
   if(typeof obj.arrayBuffer!=="function")return null;
   const bytes=await obj.arrayBuffer();
   if(!bytes||!Number.isSafeInteger(bytes.byteLength)||bytes.byteLength<1||bytes.byteLength>MAX)return null;
   return Buffer.from(bytes);
  }
 });
}
