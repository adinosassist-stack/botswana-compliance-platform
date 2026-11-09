/**
 * Employee staging bootstrap protection.
 *
 * This command is read-only. Only the separately protected GitHub Actions job
 * may use its evidence to bootstrap an inert, route-free Worker. No credentials
 * are printed. No production or customer resources are queried.
 */
import {pathToFileURL} from "node:url";
import {qualifyEmployeeStagingConfig,STAGING_D1} from "./employee-self-service-staging-preflight.mjs";

export const WORKER="bw-employee-self-service-staging";
export const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
export const ENVIRONMENT="employee-self-service-staging-protected";
export const AUTHORIZATION="BOOTSTRAP_INERT_EMPLOYEE_STAGING";
const SHA=/^[0-9a-f]{40}$/;
const failure=code=>{throw Error(code)};

export function assertExactSource(env){
 if(env.GITHUB_REPOSITORY!=="adinosassist-stack/botswana-compliance-platform"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(String(env.EXPECTED_MAIN_SHA||""))||
    env.GITHUB_SHA!==env.EXPECTED_MAIN_SHA ||
    !(
      (env.DEPLOY_MODE==="bootstrap-inert" && env.AUTHORIZATION===AUTHORIZATION) ||
      (env.DEPLOY_MODE==="preflight" && env.AUTHORIZATION==="PREFLIGHT_ONLY")
    ))
  failure("employee_staging_exact_main_authority_required");
 if(env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT)failure("employee_staging_account_id_mismatch");
 return env.EXPECTED_MAIN_SHA;
}

export function assertProtectedEnvironment(data,branches){
 const rules=Array.isArray(data?.protection_rules)?data.protection_rules:[];
 const reviewerRule=rules.find(x=>x.type==="required_reviewers");
 if(!reviewerRule ||
    reviewerRule.prevent_self_review!==true ||
    !Array.isArray(reviewerRule.reviewers) ||
    !reviewerRule.reviewers.some(x=>x.type==="User"&&x.reviewer?.login==="thusico"))
  failure("employee_staging_independent_thusico_environment_required");
 if(data?.can_admins_bypass!==false)
  failure("employee_staging_admin_bypass_forbidden");
 if(data?.deployment_branch_policy?.protected_branches!==false||
    data?.deployment_branch_policy?.custom_branch_policies!==true)
  failure("employee_staging_selected_branch_policy_required");
 if(branches?.total_count!==1||
    !Array.isArray(branches.branch_policies)||
    branches.branch_policies.length!==1||
    branches.branch_policies[0]?.name!=="main"||
    branches.branch_policies[0]?.type!=="branch")
  failure("employee_staging_main_only_required");
 return true;
}

export function assertIsolatedDatabase(info,records){
 if(info?.uuid!==STAGING_D1||info?.name!==WORKER)
  failure("employee_staging_d1_identity_mismatch");
 const r=Array.isArray(records)?records:[];
 if(r.length!==4||r.some(x=>x?.success!==true))
  failure("employee_staging_d1_query_unavailable");
 const marker=r[0]?.results?.[0];
 if(r[0]?.results?.length!==1||
    marker?.database_id!==STAGING_D1||
    marker?.environment!=="employee-self-service-isolated")
  failure("employee_staging_d1_marker_missing");
 if(Number(r[1]?.results?.[0]?.n)!==5)
  failure("employee_staging_d1_schema_unqualified");
 const counts=r[2]?.results?.[0];
 if(!counts||["tenants","users","employees","accounts","invites","sessions","tasks","events"].some(k=>Number(counts[k])!==0))
  failure("employee_staging_d1_not_empty");
 if((r[3]?.results||[]).length!==0)
  failure("employee_staging_d1_fk_unqualified");
 return true;
}

export function assertWorkerAbsent(status,body){
 if(status!==404||!body?.errors?.some(x=>Number(x.code)===10007))
  failure("employee_staging_worker_must_be_proven_absent");
 return true;
}

const requireSecret=(env,key)=>{const v=env[key];if(!v||typeof v!=="string")failure("employee_staging_protected_secret_missing_"+key);return v};
async function githubJson(repoPath,token,base="https://api.github.com"){
 const r=await fetch(base+"/repos/"+repoPath,{headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!r.ok)failure("employee_staging_github_evidence_unavailable");
 return r.json();
}
async function cloudflareJson(method,path,token,body){
 const r=await fetch("https://api.cloudflare.com/client/v4"+path,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(15000)});
 const value=await r.json().catch(()=>({}));
 return {status:r.status,body:value};
}
export async function verifyRemote(env=process.env){
 const expected=assertExactSource(env);
 qualifyEmployeeStagingConfig(); // Validates route-free, source unqualified, fixed staging DB and disabled logins.
 const githubRead=requireSecret(env,"STAFF_STAGING_GITHUB_READ_TOKEN");
 const githubAction=requireSecret(env,"GITHUB_TOKEN");
 const cloudflare=requireSecret(env,"STAFF_STAGING_CLOUDFLARE_TOKEN");
 const repo=env.GITHUB_REPOSITORY;
 const main=await githubJson(repo+"/branches/main",githubAction);
 if(main?.commit?.sha!==expected)failure("employee_staging_main_advanced");
 const environment=await githubJson(repo+"/environments/"+ENVIRONMENT,githubRead);
 const policies=await githubJson(repo+"/environments/"+ENVIRONMENT+"/deployment-branch-policies?per_page=100",githubRead);
 assertProtectedEnvironment(environment,policies);
 const base="/accounts/"+ACCOUNT+"/d1/database/"+STAGING_D1;
 const db=await cloudflareJson("GET",base,cloudflare);
 if(db.status!==200||db.body?.success!==true)failure("employee_staging_d1_read_failed");
 const sql=[
  "SELECT database_id,environment FROM employee_self_service_staging_identity WHERE id=1",
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('employee_portal_accounts','employee_portal_invites','employee_portal_sessions','employee_portal_tasks','employee_portal_task_events')",
  "SELECT (SELECT COUNT(*) FROM tenants) AS tenants,(SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM employees) AS employees,(SELECT COUNT(*) FROM employee_portal_accounts) AS accounts,(SELECT COUNT(*) FROM employee_portal_invites) AS invites,(SELECT COUNT(*) FROM employee_portal_sessions) AS sessions,(SELECT COUNT(*) FROM employee_portal_tasks) AS tasks,(SELECT COUNT(*) FROM employee_portal_task_events) AS events",
  "PRAGMA foreign_key_check"
 ].join(";");
 const query=await cloudflareJson("POST",base+"/query",cloudflare,{sql});
 if(query.status!==200||query.body?.success!==true)failure("employee_staging_d1_query_failed");
 assertIsolatedDatabase(db.body.result,query.body.result);
 const worker=await cloudflareJson("GET","/accounts/"+ACCOUNT+"/workers/scripts/"+WORKER+"/settings",cloudflare);
 assertWorkerAbsent(worker.status,worker.body);
 console.log(JSON.stringify({ok:true,exactMain:true,protectedEnvironment:true,independentReviewer:"thusico",protectedBranches:["main"],isolatedDb:STAGING_D1,stagingRecords:0,workerExists:false,productionUntouched:true}));
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]!=="verify-remote")failure("usage_verify_remote_only");
  await verifyRemote();
 }catch(e){console.error("Employee staging protected preflight refused:",String(e.message||"unknown"));process.exitCode=1}
}
