/**
 * Proves that the previously Node-only template hash and logo ID dependencies
 * are usable with the standard Web Crypto API.
 * Synthetic in-memory data only, no Cloudflare access or quotations issued.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createApprovedQuotationTemplateProvider} from "../server/quotation-logo-template-provider.mjs";
import {createQuotationLogoStore} from "../server/quotation-logo-d1-r2-store.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const bytes=new TextEncoder().encode("%PDF-1.7\nSYNTHETIC ONLY");
const tenant="sample_company";
const pages=[
 {width:612.24,height:858.96,logoZone:{x:15,y:15,width:310,height:145}},
 {width:841.92,height:1190.64,logoZone:{x:10,y:10,width:275,height:150}}
];
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,"0")).join("");

test("template provider and logo store have no Node crypto imports",()=>{
 for(const file of [
  "server/quotation-logo-template-provider.mjs",
  "server/quotation-logo-d1-r2-store.mjs",
  "server/quotation-private-r2-read.mjs"
 ]){
  const source=read(file);
  assert.doesNotMatch(source,/\bfrom\s*["']node:(?:crypto|zlib)["']/);
  assert.doesNotMatch(source,/\bBuffer\.from\s*\(/);
 }
 // The sanitizer still requires Node zlib. Do not silently claim that
 // the complete staging flow works on Cloudflare Workers.
 assert.match(read("server/quotation-logo-png-sanitizer.mjs"),/node:zlib/);
 assert.doesNotMatch(read("cloudflare/src/worker.js"),/quotation-logo-pdf-node-staging/);
});

test("standard SHA-256 verifies immutable, tenant-scoped private template bytes",async()=>{
 const digest=hex(await globalThis.crypto.subtle.digest("SHA-256",bytes));
 const key="quotation-templates/"+tenant+"/private_clean_v2";
 let reads=0;
 const provider=createApprovedQuotationTemplateProvider({
  registry:{[tenant]:{id:"private_clean_v2",companyId:tenant,
   logoFree:true,privateObjectKey:key,sha256:digest,pages}},
  privateStore:{get:async requested=>{
   reads++;assert.equal(requested,key);
   // R2 body stream must have a declared bounded size. The data may be
   // a view into a larger backing ArrayBuffer.
   const prefix=Uint8Array.from([9,9,9]);
   const combined=new Uint8Array(prefix.length+bytes.length+2);
   combined.set(prefix);combined.set(bytes,prefix.length);
   const view=combined.subarray(prefix.length,prefix.length+bytes.length);
   return {size:view.byteLength,body:new ReadableStream({start(controller){
    controller.enqueue(view.subarray(0,3));controller.enqueue(view.subarray(3));
    controller.close();
   }})};
  }}
 });
 const result=await provider.getApprovedLogoFreeTemplate({companyId:tenant});
 assert.equal(result.logoFree,true);
 assert.deepEqual(result.bytes,bytes);
 assert.equal(reads,1);
 await assert.rejects(provider.getApprovedLogoFreeTemplate({companyId:"cross_tenant"}),
  /quotation_template_not_approved/);
 assert.equal(reads,1);
});

test("Web Crypto never accepts an altered SHA-256 or corrupt PDF header",async()=>{
 const digest=hex(await globalThis.crypto.subtle.digest("SHA-256",bytes));
 const build=(sha,data)=>createApprovedQuotationTemplateProvider({
  registry:{[tenant]:{id:"private_clean_v2",companyId:tenant,logoFree:true,
   privateObjectKey:"quotation-templates/"+tenant+"/private_clean_v2",
   sha256:sha,pages}},
  privateStore:{get:async()=>({size:data.byteLength,arrayBuffer:async()=>data.buffer.slice(
    data.byteOffset,data.byteOffset+data.byteLength)})}
 });
 const changed=bytes.slice();changed[changed.length-1]^=1;
 await assert.rejects(build(digest,changed).getApprovedLogoFreeTemplate({companyId:tenant}),
  /quotation_template_integrity_failed/);
 const notPdf=new TextEncoder().encode("BROKEN NOT PDF");
 const badHash=hex(await globalThis.crypto.subtle.digest("SHA-256",notPdf));
 await assert.rejects(build(badHash,notPdf).getApprovedLogoFreeTemplate({companyId:tenant}),
  /quotation_template_invalid_pdf/);
});

test("secure Web Crypto UUIDs remain 32-hex IDs under company-scoped R2 paths",async()=>{
 const objectKeys=[],values=[];
 const bucket={put:async key=>objectKeys.push(key),get:async()=>null,delete:async()=>{}};
 const db={prepare:sql=>({bind(...bound){values.push({sql,bound});return{
  run:async()=>({success:true}),first:async()=>null}}})};
 const store=createQuotationLogoStore({db,bucket});
 const logo=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
 const one=await store.writePrivateAsset({companyId:tenant,mimeType:"image/png",bytes:logo,
  width:100,height:50});
 const two=await store.writePrivateAsset({companyId:tenant,mimeType:"image/png",bytes:logo,
  width:100,height:50});
 assert.match(one.logoAssetId,/^[a-f0-9]{32}$/i);
 assert.notEqual(one.logoAssetId,two.logoAssetId);
 assert.deepEqual(objectKeys,[
  "quotation-logos/"+tenant+"/"+one.logoAssetId,
  "quotation-logos/"+tenant+"/"+two.logoAssetId
 ]);
 assert.equal(values.length,2);
 assert.ok(values.every(x=>x.bound[1]===tenant));
});
