// Read-only eligibility audit for considering retirement of one *undeployed* Worker version.
// Deliberately cannot delete a Worker, Worker version, secret, database, or deployment.
export const ACCOUNT='b11d872b2660e76ca66323023b45b3ab';
export const WORKER='bw-workspace-agent-staging';
export const PINNED='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const STRANDED='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
export const STAGING_D1='fa317ccc-683d-4466-9e3a-e296872d58ba';
const inertVars=Object.freeze({
 AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
 POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
 THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
 WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'
});
const unsafeVars=Object.freeze({
 ...inertVars,
 WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'true',
 WORKSPACE_AGENT_ADVISORY_STAGING_HOST:'workspace-agent-staging.thebedesk.com'
});
function checkInert(bindings) {
 return Array.isArray(bindings)&&bindings.length===Object.keys(inertVars).length&&
  new Set(bindings.map(b=>b?.name)).size===bindings.length&&
  bindings.every(b=>b?.type==='plain_text'&&Object.hasOwn(inertVars,b.name)&&b.text===inertVars[b.name]);
}
function sameBindingTopology(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
 const summarize=x=>x.map(y=>[y.name,y.type,y.type==='d1'?y.id:y.type==='plain_text'?y.text:null]).sort((u,v)=>u[0].localeCompare(v[0]));
 return JSON.stringify(summarize(a))===JSON.stringify(summarize(b));
}
export function assessStrandedRetirement(s={}){
 const blockers=[];
 const fail=(ok,label)=>{if(!ok)blockers.push(label)};
 const {versionsPage1,versionsPage2,pinned,latest,settings,deployments,zones,scripts,subdomain,schedules,domains,database}=s;
 const list=versionsPage1?.result?.items;
 fail(versionsPage1?.success===true&&Array.isArray(list)&&list.length===2&&
   versionsPage2?.success===true&&Array.isArray(versionsPage2.result?.items)&&
   versionsPage2.result.items.length===0,'version_history_not_exactly_two');
 if(Array.isArray(list)){
   const ids=list.map(x=>x?.id);
   fail(new Set(ids).size===2&&ids.includes(PINNED)&&ids.includes(STRANDED),
     'expected_version_pair_mismatch');
   const p=list.find(v=>v?.id===PINNED),c=list.find(v=>v?.id===STRANDED);
   fail(Number.isSafeInteger(p?.number)&&Number.isSafeInteger(c?.number)&&
      p.number<c.number,'version_order_unverified');
 }
 fail(pinned?.success===true&&pinned.result?.id===PINNED&&
   checkInert(pinned.result?.bindings),'pinned_inert_bindings_not_qualified');
 const unsafe=latest?.result?.bindings;
 fail(latest?.success===true&&latest.result?.id===STRANDED&&
   Array.isArray(unsafe)&&unsafe.length===11&&
   unsafe.filter(x=>x?.type==='secret_text'&&x?.name==='SESSION_SECRET').length===1&&
   unsafe.filter(x=>x?.type==='d1'&&x?.name==='DB'&&x.id===STAGING_D1).length===1&&
   unsafe.filter(x=>x?.type==='plain_text').length===9&&
   unsafe.filter(x=>x?.type==='plain_text').every(x=>
      Object.hasOwn(unsafeVars,x.name)&&x.text===unsafeVars[x.name])&&
   unsafe.every(x=>['secret_text','d1','plain_text'].includes(x?.type))&&
   new Set(unsafe.map(x=>x?.name)).size===11,
   'stranded_version_topology_unverified');
 fail(settings?.success===true&&sameBindingTopology(unsafe,settings.result?.bindings),
   'script_settings_do_not_match_stranded');
 const versions=deployments?.result?.deployments?.[0]?.versions;
 fail(deployments?.success===true&&Array.isArray(versions)&&versions.length===1&&
    versions[0].version_id===PINNED&&versions[0].percentage===100,
    'pinned_not_only_deployed_version');
 fail(zones?.success===true&&Array.isArray(zones.result)&&zones.result.length===0&&
   zones.result_info?.total_count===0,'account_zones_not_empty');
 fail(scripts?.success===true&&Array.isArray(scripts.result)&&
   scripts.result.length===1&&scripts.result[0]?.id===WORKER,'isolated_worker_inventory_changed');
 fail(subdomain?.success===true&&subdomain.result?.enabled===false&&
   subdomain.result?.previews_enabled===false,'workers_dev_or_previews_active');
 fail(schedules?.success===true&&Array.isArray(schedules.result?.schedules)&&
   schedules.result.schedules.length===0,'unexpected_scheduled_trigger');
 fail(domains?.success===true&&Array.isArray(domains.result)&&domains.result.length===0,
   'custom_worker_domain_present');
 fail(database?.success===true&&database.result?.uuid===STAGING_D1&&
   database.result?.name===WORKER&&database.result?.num_tables===0,
   'dedicated_d1_not_empty_or_identity_changed');
 // Eligibility is an analysis only. No authorization to delete or otherwise mutate.
 return {eligibleForSeparateOwnerDecision:blockers.length===0,blockers,
   destructiveActionAuthorized:false,stagingDeploymentAuthorized:false,
   productionActionAuthorized:false};
}
