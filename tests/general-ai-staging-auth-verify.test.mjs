import test from "node:test";
import assert from "node:assert/strict";
import {verifyGeneralAiStagingAuth} from "../scripts/general-ai-staging-auth-verify.mjs";
const accountId="a".repeat(32),token="fake-test-token";
function mockFetch({missingTable=false,missingColumn=false,brokenFk=false}={}){
 const queries=[];
 const fn=async(_,options)=>{
  assert.equal(options.method,"POST");const sql=JSON.parse(options.body).sql;queries.push(sql);let rows=[];
  if(sql.includes("sqlite_master"))rows=["users","memberships","sessions"].filter(x=>!missingTable||x!=="sessions").map(name=>({name}));
  else if(sql.startsWith("PRAGMA table_info(")){const name=sql.match(/\((.*?)\)/)[1];const columns={users:["id","email","session_generation"],memberships:["user_id","tenant_id","role","status"],sessions:["token_hash","user_id","tenant_id","csrf_token","session_generation","expires_at"]}[name];rows=columns.filter(x=>!missingColumn||x!=="csrf_token").map(name=>({name}));}
  else if(sql.startsWith("PRAGMA foreign_key_list"))rows=brokenFk?[]:[{table:"memberships",from:"user_id"},{table:"memberships",from:"tenant_id"}];
  else if(sql.startsWith("SELECT COUNT"))rows=[{n:0}];else throw Error("unexpected query");
  return {ok:true,json:async()=>({success:true,result:[{success:true,results:rows}]})};
 };return {fn,queries};
}
test("inspects required schema, FK, and counts read-only",async()=>{const {fn,queries}=mockFetch();const result=await verifyGeneralAiStagingAuth({accountId,token,fetchFn:fn});assert.equal(result.tenantBoundaryVerified,true);assert.deepEqual(result.counts,{users:0,memberships:0,sessions:0});assert.ok(queries.every(sql=>/^\s*(SELECT|PRAGMA)/.test(sql)))});
test("rejects non-staging database",async()=>{await assert.rejects(verifyGeneralAiStagingAuth({accountId,token,databaseId:"production",fetchFn:mockFetch().fn}),/dedicated_staging_database_required/)});
test("rejects missing credentials",async()=>{await assert.rejects(verifyGeneralAiStagingAuth({accountId,fetchFn:mockFetch().fn}),/credentials_required/)});
test("rejects missing table",async()=>{await assert.rejects(verifyGeneralAiStagingAuth({accountId,token,fetchFn:mockFetch({missingTable:true}).fn}),/missing_staging_table/)});
test("rejects missing CSRF column",async()=>{await assert.rejects(verifyGeneralAiStagingAuth({accountId,token,fetchFn:mockFetch({missingColumn:true}).fn}),/missing_staging_column/)});
test("rejects broken tenant foreign key",async()=>{await assert.rejects(verifyGeneralAiStagingAuth({accountId,token,fetchFn:mockFetch({brokenFk:true}).fn}),/missing_tenant_membership_fk/)});
