/** Private export object adapter: injected S3-compatible client, no bucket provision or routes.
 * The caller must supply a private bucket and narrowly scoped storage credentials.
 */
const safeKey=k=>typeof k==="string"&&/^ai-exports\/[a-zA-Z0-9_.:-]{1,200}\/[a-zA-Z0-9_.:-]{1,200}$/.test(k);
export function createAiPrivateObjectProvider({putObject,getObject,bucket,clock=()=>Date.now()}={}){
 if(typeof putObject!=="function"||typeof getObject!=="function"||typeof bucket!=="string"||!bucket.trim()||typeof clock!=="function")throw new TypeError("private_object_provider_required");
 return Object.freeze({
  async put(key,bytes,{private:privateObject,expiresAt}={}){
   if(!safeKey(key)||privateObject!==true||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024||!Number.isSafeInteger(expiresAt)||expiresAt<=clock())throw new Error("invalid_private_object");
   await putObject({bucket,key,body:bytes,expiresAt,visibility:"private"});
  },
  async get(key,{private:privateObject}={}){
   if(!safeKey(key)||privateObject!==true)return null;
   const bytes=await getObject({bucket,key,visibility:"private"});
   return Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=20*1024*1024?bytes:null;
  }
 });
}
