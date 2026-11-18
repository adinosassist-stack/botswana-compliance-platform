import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {collectProductionOperationsMetadata} from "../scripts/production-operations-metadata.mjs";

const databaseId="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const token="synthetic-only-token",accountId="a".repeat(32),sourceSha="b".repeat(40);
const uid="11111111-2222-4333-8444-555555555555";

test("production Wrangler template explicitly redacts URL query strings",()=>{
 const content=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
 assert.match(content,/\[observability\]\s*\nredact_query_string\s*=\s*true\s*\n\s*\[observability\.logs\]/);
 assert.equal((content.match(/^redact_query_string\s*=/gm)||[]).length,1);
 assert.match(content,/\[observability\.logs\]\s*\nenabled\s*=\s*true/);
});

async function report(observability){
 const values=[
  {uuid:databaseId,name:"bw-compliance-os",version:"production",file_size:1024},
  {observability,logpush:false,bindings:[{secret:token}]},
  {deployments:[{id:uid,created_on:"2026-11-01T00:00:00.000Z",versions:[{version_id:uid,percentage:100}],annotations:{secret:token}}]},
  {bookmark:token},
  {name:"bw-compliance-evidence",secret:token}
 ];
 let count=0;
 const result=await collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,
  fetchImpl:async(_url,options)=>{
   assert.equal(options.method,"GET");
   return new Response(JSON.stringify({success:true,result:values[count++]}));
  }});
 assert.equal(count,5);
 assert.equal(JSON.stringify(result).includes(token),false);
 return result;
}
test("read-only audit distinguishes true, false and unobserved redaction",async()=>{
 const safe=await report({enabled:true,redact_query_string:true,logs:{enabled:true,head_sampling_rate:0.1}});
 assert.equal(safe.worker.logging.redactQueryString,true);
 const unsafe=await report({enabled:true,redact_query_string:false,logs:{enabled:true}});
 assert.equal(unsafe.worker.logging.redactQueryString,false);
 const unknown=await report({enabled:true,logs:{enabled:true}});
 assert.equal(Object.hasOwn(unknown.worker.logging,"redactQueryString"),false);
 assert.equal(unknown.alertDeliveryVerified,false);
});
