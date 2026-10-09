import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {verifyAgentCostProductionAuthority} from "./agent-cost-production-authority.mjs";
import {createAgentCostProductionTransport} from "./agent-cost-production-transport.mjs";
import {runAgentCostMigration} from "./migrate-agent-cost-accounting.mjs";

export async function runProductionAgentCostMigration({env=process.env,fetchImpl=globalThis.fetch,execImpl}={}){
  if(env.GITHUB_REPOSITORY!=="adinosassist-stack/botswana-compliance-platform"||env.GITHUB_REF!=="refs/heads/main"||
    env.GITHUB_EVENT_NAME!=="workflow_dispatch"||env.GITHUB_ACTOR!=="adinosassist-stack"||
    env.EXPECTED_MAIN_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.EXPECTED_MAIN_SHA)||
    !["plan","apply"].includes(env.MIGRATION_MODE))throw new Error("migration_workflow_context_invalid");
  const verifyAuthority=()=>verifyAgentCostProductionAuthority({sha:env.EXPECTED_MAIN_SHA,token:env.GH_TOKEN,fetchImpl});
  await verifyAuthority();
  const transport=createAgentCostProductionTransport({token:env.CLOUDFLARE_API_TOKEN,accountId:env.CLOUDFLARE_ACCOUNT_ID,
    databaseId:env.D1_DATABASE_ID,allowApply:env.MIGRATION_MODE==="apply",wranglerJs:env.WRANGLER_JS,
    verifyAuthority,summaryPath:env.GITHUB_STEP_SUMMARY,fetchImpl,execImpl});
  await transport.verifyTarget();
  const result=await runAgentCostMigration({...transport,apply:env.MIGRATION_MODE==="apply",expectedSourceSha256:env.EXPECTED_SOURCE_SHA256});
  if(env.MIGRATION_MODE==="apply"&&result.ok){
    try{
      const r=await fetchImpl("https://thebedesk.com/api/ready",{redirect:"error",signal:AbortSignal.timeout(15000),headers:{accept:"application/json"}});
      const ready=r.ok?await r.json():null;
      if(ready?.ok!==true||ready?.schemaReady!==true||ready?.requiredConfigReady!==true)throw new Error("unhealthy");
    }catch{return {...result,ok:false,code:"migration_health_check_failed",reconciliationRequired:true}}
  }
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const result=await runProductionAgentCostMigration();console.log(JSON.stringify(result));process.exitCode=result.ok?0:1}
  catch(error){console.error(/^migration_[a-z_]+$/.test(error.message)?error.message:"migration_transport_unavailable");process.exitCode=1}
}
