import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import crypto from "node:crypto";

// Execute the exact server.js session loader and auth middleware bodies in a
// sandbox with a controlled database adapter. This is runtime source execution,
// not a booted production server or a PostgreSQL integration test.
const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
function extract(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"server auth boundary missing: "+start);
 return source.slice(a,b);
}
const code=[
 extract("function parseCookies(","function sha256("),
 extract("function sessionHash(","function authRateKey("),
 extract("async function loadSessionAuth(req){","function roles(")
].join("\n");
function harness({row=null,queryError=null}={}){
 const queries=[];
 const pool={async query(sql,params){
  queries.push({sql,params});
  if(queryError)throw queryError;
  if(sql.startsWith("update sessions"))return {rowCount:1,rows:[]};
  return {rowCount:row?1:0,rows:row?[row]:[]};
 }};
 const context={crypto,Buffer,Date,pool,SESSION_COOKIE:"bwcos_session",
  config:{SESSION_SECRET:"isolated-real-server-auth-runtime-secret",PUBLIC_ORIGIN:"https://thebedesk.com"},
  nodeFetchMetadataAllowsBrowserMutation:site=>site==="same-origin",
  nodeRequestOriginAllowed:(origin,expected)=>origin===expected};
 const api=runInNewContext(code+"\n({loadSessionAuth,auth,sessionHash})",context,{timeout:2000});
 return {...api,queries};
}
const token="test-cookie-token";
const cookie="bwcos_session="+token;
const row={id:"session-id",user_id:"user-id",tenant_id:"tenant-id",role:"owner",csrf_token:"csrf-token",last_seen_at:new Date(),expires_at:new Date(Date.now()+3600000)};
async function invoke(auth,method="GET",headers={}){
 const req={method,headers:{cookie,...headers}};
 let status=200,body=null,passed=false,error=null;
 const res={status(v){status=v;return this},json(v){body=v;return this}};
 await auth(req,res,e=>{if(e)error=e;else passed=true});
 return {status,body,passed,error,principal:req.auth};
}
test("actual server loader hashes cookie and obtains DB-validated principal",async()=>{
 const h=harness({row});
 const principal=await h.loadSessionAuth({headers:{cookie}});
 assert.equal(principal.userId,row.user_id);
 assert.equal(principal.tenantId,row.tenant_id);
 assert.equal(principal.role,"owner");
 assert.equal(h.queries.length,1);
 assert.equal(h.queries[0].params[0],crypto.createHmac("sha256","isolated-real-server-auth-runtime-secret").update(token).digest("hex"));
 for(const clause of ["s.revoked_at is null","s.expires_at>now()","s.session_generation=u.session_generation","m.status='active'"])assert.ok(h.queries[0].sql.includes(clause));
});
test("actual server middleware denies missing and DB-rejected cookies",async()=>{
 for(const options of [{row:null},{row,queryError:new Error("database unavailable")}]) {
  const h=harness(options);
  const result=await invoke(h.auth);
  if(options.queryError){assert.ok(result.error);assert.equal(result.passed,false)}
  else {assert.equal(result.status,401);assert.equal(result.body.error,"unauthenticated");assert.equal(result.passed,false)}
 }
 const h=harness({row});
 const result=await invoke(h.auth,"GET",{cookie:""});
 assert.equal(result.status,401);
 assert.equal(h.queries.length,0,"missing cookie must not query database");
});
test("actual server middleware accepts verified GET but rejects unsafe mutation origin and CSRF",async()=>{
 const h=harness({row});
 assert.equal((await invoke(h.auth)).passed,true);
 const badOrigin=await invoke(h.auth,"POST",{"sec-fetch-site":"cross-site",origin:"https://evil.invalid","x-csrf-token":"csrf-token"});
 assert.equal(badOrigin.status,403);
 assert.equal(badOrigin.body.error,"origin_failed");
 const badCsrf=await invoke(h.auth,"POST",{"sec-fetch-site":"same-origin",origin:"https://thebedesk.com","x-csrf-token":"wrong"});
 assert.equal(badCsrf.status,403);
 assert.equal(badCsrf.body.error,"csrf_failed");
 const good=await invoke(h.auth,"POST",{"sec-fetch-site":"same-origin",origin:"https://thebedesk.com","x-csrf-token":"csrf-token"});
 assert.equal(good.passed,true);
});
