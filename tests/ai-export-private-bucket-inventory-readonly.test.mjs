import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const target=new URL("../scripts/ai-export-private-bucket-inventory-readonly.mjs",import.meta.url).href;
function run({present=true,managedEnabled=false,customDomains=[]}={}){
 const mock=`const requests=[];
 globalThis.fetch=async(url,init)=>{
  if(init.method!=="GET")throw Error("mutation_prohibited");
  requests.push(url);
  let result;
  if(url.endsWith("/domains/managed"))result={enabled:${managedEnabled}};
  else if(url.endsWith("/domains/custom"))result={domains:${JSON.stringify(customDomains)}};
  else result={buckets:${JSON.stringify(present?[{name:"bw-ai-exports-staging"}]:[])}};
  return {ok:true,json:async()=>({success:true,result})};
 };
 await import(${JSON.stringify(target)});
 console.log(JSON.stringify({requests:requests.length}));`;
 return spawnSync(process.execPath,["--input-type=module","-e",mock],
  {encoding:"utf8",env:{...process.env,CLOUDFLARE_ACCOUNT_ID:"ddd23cab31928a4bb3d4998df9b26d1d",CLOUDFLARE_API_TOKEN:"test-only-secret"}});
}
test("metadata-only private bucket check can pass but never authorizes exports",()=>{
 const r=run();
 assert.equal(r.status,0,r.stderr);
 const report=JSON.parse(r.stdout.split("\n")[0]);
 assert.equal(report.privateStorage,true);
 assert.equal(report.productionReady,false);
 assert.equal(report.objectRoundTripVerified,false);
 assert.equal(JSON.parse(r.stdout.split("\n")[1]).requests,3);
 assert.ok(!r.stdout.includes("test-only-secret"));
});
test("missing private bucket fails closed",()=>{
 const r=run({present:false});assert.equal(r.status,2,r.stderr);
 assert.equal(JSON.parse(r.stdout.split("\n")[0]).present,false);
 assert.equal(JSON.parse(r.stdout.split("\n")[1]).requests,1);
});
test("managed domain or custom domain forbids private qualification",()=>{
 for(const options of [{managedEnabled:true},{customDomains:[{domain:"public.example"}]}]){
  const r=run(options);assert.equal(r.status,2,r.stderr);
  assert.equal(JSON.parse(r.stdout.split("\n")[0]).privateStorage,false);
 }
});
