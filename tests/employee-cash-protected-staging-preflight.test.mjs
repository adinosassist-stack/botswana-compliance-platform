import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 qualifyCashMigration,assertPreflightScope,assertCashStagingSchema,PREFLIGHT_SCOPE
} from "../scripts/employee-cash-protected-staging-preflight.mjs";

const SHA="a".repeat(40);
const validEnvironment=()=>({
 GITHUB_REPOSITORY:"adinosassist-stack/botswana-compliance-platform",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,
 CLOUDFLARE_ACCOUNT_ID:"ddd23cab31928a4bb3d4998df9b26d1d",
 DEPLOY_MODE:"preflight",AUTHORIZATION:"PREFLIGHT_ONLY",CASH_PREFLIGHT_SCOPE:PREFLIGHT_SCOPE
});
const col=(name)=>({name});
function good(){
 return {
  query:{success:true,result:[
   {success:true,results:[]},
   {success:true,results:["id","tenant_id","status","full_name"].map(col)},
   {success:true,results:["id"].map(col)},
   {success:true,results:["id"].map(col)}
  ]},
  bookmark:{success:true,result:{bookmark:"synthetic-only-never-a-real-bookmark"}}
 };
}

test("read-only staging migration source includes tenant controls and stable digest",()=>{
 const hash=qualifyCashMigration();
 assert.match(hash,/^[a-f0-9]{64}$/);
});

test("only exact current main and preflight scope are accepted",()=>{
 const good=validEnvironment();
 assert.equal(assertPreflightScope(good),true);
 for(const [key,badValue] of [
  ["GITHUB_REF","refs/heads/feature"],["GITHUB_SHA","b".repeat(40)],
  ["EXPECTED_MAIN_SHA","not-a-sha"],["DEPLOY_MODE","bootstrap-inert"],
  ["AUTHORIZATION","BOOTSTRAP_INERT_EMPLOYEE_STAGING"],
  ["CASH_PREFLIGHT_SCOPE","APPLY_STAGING_MIGRATION"],
  ["CLOUDFLARE_ACCOUNT_ID","8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"]
 ])assert.throws(()=>assertPreflightScope({...good,[key]:badValue}));
});

test("read-only cloud evidence requires zero cash schema and an available bookmark",()=>{
 const a=good();
 assert.equal(assertCashStagingSchema(a.query,a.bookmark),true);
 const duplicate=good();duplicate.query.result[0].results=[{name:"employee_cash_entries",type:"table"}];
 assert.throws(()=>assertCashStagingSchema(duplicate.query,duplicate.bookmark));
 const columns=good();columns.query.result[1].results=[col("id")];
 assert.throws(()=>assertCashStagingSchema(columns.query,columns.bookmark));
 const noBookmark=good();noBookmark.bookmark.result.bookmark="";
 assert.throws(()=>assertCashStagingSchema(noBookmark.query,noBookmark.bookmark));
 const partial=good();partial.query.result[3].success=false;
 assert.throws(()=>assertCashStagingSchema(partial.query,partial.bookmark));
});

test("protected cash preflight workflow never deploys, migrates, or enables production",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/employee-cash-protected-staging-preflight.yml",import.meta.url),"utf8");
 assert.match(workflow,/environment: employee-self-service-staging-protected/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/PREFLIGHT_ONLY/);
 assert.match(workflow,/EXPECTED_MAIN_SHA/);
 assert.match(workflow,/employee-cash-protected-staging-preflight\.mjs verify-remote/);
 assert.doesNotMatch(workflow,/wrangler deploy|d1 migrations apply|wrangler d1 execute|workers\/scripts\/.*(?:PATCH|PUT)/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN:.*secrets\.CLOUDFLARE_API_TOKEN/);
 const source=readFileSync(new URL("../scripts/employee-cash-protected-staging-preflight.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/method:\s*["'](?:PUT|PATCH|DELETE)["']/);
 assert.match(source,/await verifyRemote\(env\)/);
});
