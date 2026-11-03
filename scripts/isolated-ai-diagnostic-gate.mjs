// No credentials, DB operations, deployment or AI invocation.
import {renderIsolatedReadinessConfig} from './render-isolated-readiness-config.mjs';
export function qualifyIsolatedAiDiagnostic(sourceSha){
 const cfg=renderIsolatedReadinessConfig({accountId:'a'.repeat(32),sourceSha});
 const fail=()=>{throw Error('isolated_ai_diagnostic_not_qualified')};
 if(cfg.name!=='bw-compliance-os-readiness-staging'||cfg.vars.APP_ENV!=='staging'||
 cfg.d1_databases?.[0]?.database_id!=='c5c232a8-8fe7-440c-81ba-021a44fd3fdd'||
 cfg.r2_buckets?.[0]?.bucket_name!=='bw-compliance-ops-evidence'||
 cfg.workers_dev!==false||cfg.preview_urls!==false||cfg.routes?.length!==0||
 cfg.triggers?.crons?.length!==0||cfg.vars.AI_FEATURES_DEFAULT!=='off')fail();
 return {ok:true,environment:'staging',worker:cfg.name,privateAccess:'not_configured',
 databaseSchema:'not_initialized',aiStageTiming:'disabled',execution:'not_authorized'};
}
if(process.argv[1]?.endsWith('/isolated-ai-diagnostic-gate.mjs'))console.log(JSON.stringify(qualifyIsolatedAiDiagnostic(process.env.SOURCE_SHA)));
