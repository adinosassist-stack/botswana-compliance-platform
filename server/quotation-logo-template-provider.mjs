/**
 * Staging-only approved quotation PDF registry. No routes, public URLs or migration.
 * Registry is operator-controlled: company -> approved background object, SHA-256,
 * two-page sizes and reserved logo area independently reviewed as visually blank.
 *
 * The registry must be supplied by privileged server configuration; never accept
 * these values from a customer request or editable company settings.
 */
import {readPrivateQuotationR2Bytes} from "./quotation-private-r2-read.mjs";
const fail=(code)=>{throw Error(code)};
const valid=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
// Web Crypto is available in Node 22 and the Workers runtime. No node:crypto
// dependency is needed for private, immutable SHA-256-pinned templates.
const digest=async bytes=>{
 const subtle=globalThis.crypto?.subtle;
 if(typeof subtle?.digest!=="function")fail("quotation_template_crypto_unavailable");
 try{return new Uint8Array(await subtle.digest("SHA-256",bytes))}
 catch{fail("quotation_template_integrity_failed")}
};
const hexBytes=hex=>Uint8Array.from(hex.match(/.{2}/g),pair=>parseInt(pair,16));
// SHA-256 is a public integrity value, not an authentication secret. Do not
// short-circuit comparisons, including across repeated template reads.
const same=(a,b)=>{
 if(a.length!==b.length)return false;
 let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
 return difference===0;
};
const acceptableRect=(r,w,h)=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&
 r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=w&&r.y+r.height<=h;
const approvedPage=p=>p&&Number.isFinite(p.width)&&Number.isFinite(p.height)&&
 p.width>=100&&p.height>=100&&acceptableRect(p.logoZone,p.width,p.height);
export function createApprovedQuotationTemplateProvider({registry,privateStore}={}) {
 if(!registry||typeof registry!=="object"||typeof privateStore?.get!=="function")
  fail("quotation_template_registry_unconfigured");
 return Object.freeze({
  async getApprovedLogoFreeTemplate({companyId}={}){
   if(!valid(companyId))fail("quotation_template_access_denied");
   // Reject inherited/prototype registry entries; approval must be explicit.
   if(!Object.hasOwn(registry,companyId))fail("quotation_template_not_approved");
   const entry=registry[companyId];
   const scopedKey="quotation-templates/"+companyId+"/";
   const keyLeaf=typeof entry?.privateObjectKey==="string"&&
      entry.privateObjectKey.startsWith(scopedKey)?entry.privateObjectKey.slice(scopedKey.length):"";
   if(!entry||entry.companyId!==companyId||entry.logoFree!==true||
      !valid(entry.id)||typeof entry.privateObjectKey!=="string"||
      !/^[A-Za-z0-9_-]{1,100}$/.test(keyLeaf)||
      !/^[0-9a-f]{64}$/i.test(entry.sha256)||
      !Array.isArray(entry.pages)||entry.pages.length!==2||
      !entry.pages.every(approvedPage))
     fail("quotation_template_not_approved");
   const object=await privateStore.get(entry.privateObjectKey);
   if(!object)fail("quotation_template_not_found");
   const source=await readPrivateQuotationR2Bytes(object,{
    maxBytes:10*1024*1024,minBytes:5,errorCode:"quotation_template_integrity_failed"
   });
   if(!same(await digest(source),hexBytes(entry.sha256)))
    fail("quotation_template_integrity_failed");
   if(source[0]!==37||source[1]!==80||source[2]!==68||source[3]!==70||source[4]!==45)
    fail("quotation_template_invalid_pdf");
   return Object.freeze({
    id:entry.id,logoFree:true,bytes:source,pageCount:2,
    pages:entry.pages.map(p=>Object.freeze({...p,logoZone:Object.freeze({...p.logoZone})}))
   });
  }
 });
}
