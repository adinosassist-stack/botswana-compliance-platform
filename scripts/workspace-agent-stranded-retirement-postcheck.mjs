// Pure fail-closed postcondition verifier. No HTTP or write operations.
import {PINNED,WORKER,STAGING_D1} from './workspace-agent-stranded-retirement-eligibility.mjs';
const expected=Object.freeze({
 AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
 POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
 THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
 WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'
});
function exactlyInert(items){
 return Array.isArray(items)&&items.length===8&&
   new Set(items.map(x=>x?.name)).size===8&&
   items.every(x=>x?.type==='plain_text'&&Object.hasOwn(expected,x.name)&&x.text===expected[x.name]);
}
export function assessRetirementPostconditions(s={}){
 const blockers=[];
 const check=(ok,name)=>{if(!ok)blockers.push(name)};
 const page1=s.versionsPage1?.result?.items,page2=s.versionsPage2?.result?.items;
 check(s.versionsPage1?.success===true&&Array.isArray(page1)&&page1.length===1&&
       page1[0]?.id===PINNED&&
       s.versionsPage2?.success===true&&Array.isArray(page2)&&page2.length===0,
       'version_list_not_only_pinned');
 check(s.pinned?.success===true&&s.pinned?.result?.id===PINNED&&
       exactlyInert(s.pinned.result?.bindings),'pinned_version_not_verified_inert');
 check(s.latest?.success===true&&s.latest.result?.id===PINNED&&
       exactlyInert(s.latest.result?.bindings),'latest_version_not_verified_inert');
 check(s.settings?.success===true&&exactlyInert(s.settings.result?.bindings),
       'script_settings_not_verified_inert');
 const v=s.deployments?.result?.deployments?.[0]?.versions;
 check(s.deployments?.success===true&&Array.isArray(v)&&v.length===1&&
       v[0]?.version_id===PINNED&&v[0]?.percentage===100,'deployment_changed');
 check(s.zones?.success===true&&Array.isArray(s.zones.result)&&
       s.zones.result.length===0&&s.zones.result_info?.total_count===0,
       'account_zones_changed');
 check(s.scripts?.success===true&&Array.isArray(s.scripts.result)&&
       s.scripts.result.length===1&&s.scripts.result[0]?.id===WORKER,
       'isolated_worker_changed');
 check(s.subdomain?.success===true&&s.subdomain.result?.enabled===false&&
       s.subdomain.result?.previews_enabled===false,'subdomain_or_previews_enabled');
 check(s.schedules?.success===true&&Array.isArray(s.schedules.result?.schedules)&&
       s.schedules.result.schedules.length===0,'schedule_created');
 check(s.domains?.success===true&&Array.isArray(s.domains.result)&&
       s.domains.result.length===0,'custom_domain_created');
 check(s.database?.success===true&&s.database.result?.uuid===STAGING_D1&&
       s.database.result?.name===WORKER&&s.database.result?.num_tables===0,
       'dedicated_d1_changed');
 return {verified:blockers.length===0,blockers,agentActivationAuthorized:false,
   productionActionAuthorized:false};
}
