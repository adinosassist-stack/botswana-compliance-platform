/**
 * Pure/read-only post-bootstrap gate. Does not call Cloudflare or create
 * anything. Input must come from authenticated live account GET results.
 *
 * NEVER treat this as proof that the first bootstrap was never addressable:
 * that earlier possibility must have been expressly accepted in a separate
 * owner + independent reviewer approval BEFORE any Cloudflare write.
 */
export function assessQuotationNoCostBootstrapSnapshot({
  accountId,expectedAccountId,workerName,expectedWorkerName,
  subdomain,deployments,routes,customDomains,bindings,
  scripts,hasPreviewInvocability
}={}){
 const failures=[];
 if(!accountId||accountId!==expectedAccountId)
   failures.push('account_mismatch');
 if(!workerName||workerName!==expectedWorkerName)
   failures.push('worker_mismatch');
 if(subdomain?.enabled!==false||subdomain?.previews_enabled!==false)
   failures.push('public_or_preview_url_enabled_or_unverified');
 if(!Array.isArray(deployments)||deployments.length!==0)
   failures.push('deployment_present_or_unverified');
 if(!Array.isArray(routes)||routes.length!==0)
   failures.push('route_present_or_unverified');
 if(!Array.isArray(customDomains)||customDomains.length!==0)
   failures.push('custom_domain_present_or_unverified');
 if(!Array.isArray(bindings)||bindings.length!==0)
   failures.push('binding_present_or_unverified');
 if(!Array.isArray(scripts)||
    scripts.filter(s=>(s.id??s.name)===workerName).length!==1)
   failures.push('script_absent_duplicate_or_unverified');
 if(hasPreviewInvocability!==false)
   failures.push('preview_inaccessibility_unverified');
 return Object.freeze({safeForSeparateCandidateAuthorization:failures.length===0,
   failures:Object.freeze(failures)});
}
