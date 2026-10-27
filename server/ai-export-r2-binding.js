/** Unmounted Cloudflare R2 binding wrapper. Never generates public URLs. */
export function createAiExportR2Binding({binding}={}){
 if(!binding||typeof binding.put!=="function"||typeof binding.get!=="function")throw new TypeError("r2_private_binding_required");
 return Object.freeze({
  async putObject({key,body,visibility,expiresAt}={}){
   if(visibility!=="private"||typeof key!=="string"||!Buffer.isBuffer(body)||!Number.isSafeInteger(expiresAt))throw Error("private_r2_write_required");
   await binding.put(key,body,{customMetadata:{expiresAt:String(expiresAt)}});
  },
  async getObject({key,visibility}={}){
   if(visibility!=="private"||typeof key!=="string")return null;
   const obj=await binding.get(key);if(!obj)return null;
   if(obj.customMetadata?.expiresAt){
    const expiresAt=Number(obj.customMetadata.expiresAt);
    if(!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now())return null;
   }
   const data=await obj.arrayBuffer();
   return Buffer.from(data);
  }
 });
}
