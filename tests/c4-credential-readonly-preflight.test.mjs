import test from "node:test";
import assert from "node:assert/strict";
import {c4ReadOnlyProof,ACCOUNT,DATABASE,NAME} from "../scripts/c4-credential-readonly-preflight.mjs";
const token="synthetic-secret-not-real";
function fake({status=200,wrong=false,tables=0,bookmark=true}={}){
 const requests=[];
 const fetchImpl=async(url,init)=>{
  requests.push({url,method:init.method,authorization:init.headers.Authorization,redirect:init.redirect});
  const isBookmark=url.endsWith("/time_travel/bookmark");
  return new Response(JSON.stringify({
   success:status===200,
   result:isBookmark?{bookmark:bookmark?"0000000a-test":null}:{
     uuid:wrong?"other":DATABASE,name:NAME,num_tables:tables
   }
  }),{status});
 };
 return {fetchImpl,requests};
}
test("protected proof performs exactly two GETs, exposes no authorization",async()=>{
 const f=fake();
 const result=await c4ReadOnlyProof({token,fetchImpl:f.fetchImpl});
 assert.equal(result.metadataReadVerified,true);
 assert.equal(result.bookmarkReadVerified,true);
 assert.equal(result.sqlWriteAuthorized,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.credentialScopeVerified,false);
 assert.equal(result.productionChange,false);
 assert.equal(f.requests.length,2);
 for(const req of f.requests){
  assert.equal(req.method,"GET");
  assert.equal(req.redirect,"error");
  assert.ok(req.url.startsWith("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DATABASE));
  assert.equal(req.authorization,"Bearer "+token);
 }
 assert.doesNotMatch(JSON.stringify(result),/synthetic-secret/);
});
test("deny missing secret, mismatch, nonempty database, missing bookmark and non-200",async()=>{
 await assert.rejects(c4ReadOnlyProof({token:""}),/protected_secret_missing/);
 for(const opts of [{wrong:true},{tables:1},{bookmark:false},{status:403}]){
  const f=fake(opts);
  await assert.rejects(c4ReadOnlyProof({token,fetchImpl:f.fetchImpl}));
 }
});
