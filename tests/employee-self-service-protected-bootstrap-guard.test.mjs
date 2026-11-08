import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertExactSource,assertProtectedEnvironment,assertIsolatedDatabase,assertWorkerAbsent,AUTHORIZATION,ACCOUNT,ENVIRONMENT,WORKER} from "../scripts/employee-self-service-protected-bootstrap-guard.mjs";
import {STAGING_D1} from "../scripts/employee-self-service-staging-preflight.mjs";

const sha="a".repeat(40);
const config=()=>({GITHUB_REPOSITORY:"adinosassist-stack/botswana-compliance-platform",GITHUB_REF:"refs/heads/main",GITHUB_SHA:sha,EXPECTED_MAIN_SHA:sha,DEPLOY_MODE:"bootstrap-inert",AUTHORIZATION,CLOUDFLARE_ACCOUNT_ID:ACCOUNT});
const githubEnvironment=()=>({can_admins_bypass:false,deployment_branch_policy:{protected_branches:false,custom_branch_policies:true},protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[{type:"User",reviewer:{login:"thusico"}}]}]});
const policies=()=>({total_count:1,branch_policies:[{name:"main",type:"branch"}]});
const records=()=>[
 {success:true,results:[{database_id:STAGING_D1,environment:"employee-self-service-isolated"}]},
 {success:true,results:[{n:5}]},
 {success:true,results:[{tenants:0,users:0,employees:0,accounts:0,invites:0,sessions:0,tasks:0,events:0}]},
 {success:true,results:[]}
];
test("only explicit main-only exact SHA and inert operation can proceed",()=>{
 assert.equal(assertExactSource(config()),sha);
 assert.equal(assertExactSource({...config(),DEPLOY_MODE:"preflight",AUTHORIZATION:"PREFLIGHT_ONLY"}),sha);
 assert.throws(()=>assertExactSource({...config(),DEPLOY_MODE:"preflight"}),/employee_staging_/);
 assert.throws(()=>assertExactSource({...config(),DEPLOY_MODE:"preflight",AUTHORIZATION:AUTHORIZATION}),/employee_staging_/);
 assert.throws(()=>assertExactSource({...config(),DEPLOY_MODE:"bootstrap-inert",AUTHORIZATION:"PREFLIGHT_ONLY"}),/employee_staging_/);
 assert.throws(()=>assertExactSource({...config(),DEPLOY_MODE:"preflight",AUTHORIZATION:"PREFLIGHT_ONLY",EXPECTED_MAIN_SHA:"b".repeat(40)}),/employee_staging_/);

 for(const change of [
  {GITHUB_REPOSITORY:"bad/repo"},
  {GITHUB_REF:"refs/heads/feature"},
  {GITHUB_SHA:"b".repeat(40)},
  {EXPECTED_MAIN_SHA:"a".repeat(39)},
  {DEPLOY_MODE:"deploy-public"},
  {AUTHORIZATION:"PREFLIGHT_ONLY"},
  {CLOUDFLARE_ACCOUNT_ID:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"}
 ])assert.throws(()=>assertExactSource({...config(),...change}),/employee_staging_/);
});
test("requires independent thusico reviewer, self-review prevention, no admin bypass, exactly main",()=>{
 assert.equal(assertProtectedEnvironment(githubEnvironment(),policies()),true);
 for(const environmentChange of [
  {can_admins_bypass:true},{can_admins_bypass:undefined},
  {protection_rules:[]},
  {protection_rules:[{type:"required_reviewers",prevent_self_review:false,reviewers:[{type:"User",reviewer:{login:"thusico"}}]}]},
  {protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[{type:"User",reviewer:{login:"owner"}}]}]},
  {deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}},
  {deployment_branch_policy:null}
 ])assert.throws(()=>assertProtectedEnvironment({...githubEnvironment(),...environmentChange},policies()),/employee_staging_/);
 for(const bad of [
  {total_count:2,branch_policies:[{name:"main",type:"branch"},{name:"feature",type:"branch"}]},
  {total_count:1,branch_policies:[{name:"*",type:"branch"}]},
  {total_count:1,branch_policies:[{name:"main",type:"tag"}]},
  {total_count:0,branch_policies:[]}
 ])assert.throws(()=>assertProtectedEnvironment(githubEnvironment(),bad),/employee_staging_/);
});
test("remote database evidence must show only isolated schema, marker and zero customer records",()=>{
 assert.equal(assertIsolatedDatabase({uuid:STAGING_D1,name:WORKER},records()),true);
 assert.throws(()=>assertIsolatedDatabase({uuid:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",name:WORKER},records()),/d1_identity/);
 for(const i of [0,1,2,3]){
  const broken=structuredClone(records());
  if(i===0)broken[i].results[0].environment="production";
  if(i===1)broken[i].results[0].n=4;
  if(i===2)broken[i].results[0].accounts=1;
  if(i===3)broken[i].results.push({table:"bad"});
  assert.throws(()=>assertIsolatedDatabase({uuid:STAGING_D1,name:WORKER},broken),/employee_staging_d1_/);
 }
 assert.throws(()=>assertIsolatedDatabase({uuid:STAGING_D1,name:WORKER},records().slice(0,2)),/d1_query/);
});
test("one-time bootstrap requires Cloudflare Worker to be conclusively absent",()=>{
 assert.equal(assertWorkerAbsent(404,{errors:[{code:10007}]}),true);
 for(const [code,payload] of [
  [200,{success:true,result:{}}],
  [403,{errors:[{code:10000}]}],
  [404,{errors:[{code:404}]}],
  [404,{errors:[]}],
  [500,{errors:[{code:10007}]}]
 ])assert.throws(()=>assertWorkerAbsent(code,payload),/worker_must_be_proven_absent/);
});
test("workflow has no PR deployment or permissive public route and requires independent environment",()=>{
 const wf=readFileSync(new URL("../.github/workflows/employee-self-service-inert-bootstrap-protected.yml",import.meta.url),"utf8");
 assert.match(wf,/environment: employee-self-service-staging-protected/);
 assert.match(wf,/  protected-preflight:\\n    needs: offline/);
 assert.match(wf,/inputs\\.mode == 'preflight' && inputs\\.authorization == 'PREFLIGHT_ONLY'/);
 assert.match(wf,/AUTHORIZATION: \\$\\{\\{ inputs\\.authorization \\}\\}/);
 assert.match(wf,/default: PREFLIGHT_ONLY/);
 const preflightJob=wf.split("  protected-preflight:\\n")[1]?.split("  bootstrap-inert:\\n")[0];
 assert.ok(preflightJob,"read-only remote preflight job must exist");
 assert.match(preflightJob,/environment: employee-self-service-staging-protected/);
 assert.match(preflightJob,/STAFF_STAGING_GITHUB_READ_TOKEN/);
 assert.match(preflightJob,/STAFF_STAGING_CLOUDFLARE_TOKEN/);
 assert.match(preflightJob,/node scripts\\/employee-self-service-protected-bootstrap-guard\\.mjs verify-remote/);
 assert.doesNotMatch(preflightJob,/npx wrangler deploy|--force|bootstrap-inert|worker-route|route add/,"remote preflight must not deploy");

 assert.match(wf,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
 assert.match(wf,/inputs\.authorization == 'BOOTSTRAP_INERT_EMPLOYEE_STAGING'/);
 assert.match(wf,/STAFF_STAGING_GITHUB_READ_TOKEN/);
 assert.match(wf,/STAFF_STAGING_CLOUDFLARE_TOKEN/);
 assert.match(wf,/node scripts\/employee-self-service-protected-bootstrap-guard\.mjs verify-remote/);
 assert.match(wf,/--dry-run --config cloudflare\/wrangler\.employee-self-service-staging\.toml/);
 assert.match(wf,/wrangler deploy --config cloudflare\/wrangler\.employee-self-service-staging\.toml/);
 assert.match(wf,/persist-credentials: false/);
 assert.doesNotMatch(wf,/\bpush\s*:/);
 assert.doesNotMatch(wf,/--force/);
 assert.doesNotMatch(wf,/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce/);
 assert.doesNotMatch(wf,/worker-route|route add|workers_dev = true/);
});
