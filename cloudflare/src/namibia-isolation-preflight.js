// Isolated Namibia candidate preflight. Never treat environment variables as proof of
// live Cloudflare bindings: CI/deployment must separately audit actual binding metadata.
export const NAMIBIA_ISOLATION_VERSION="2026-11-07.v1";
const fail=reason=>Object.freeze({ok:false,error:reason});
const id=s=>typeof s==="string"&&/^[a-z0-9][a-z0-9_-]{5,119}$/.test(s)?s:null;
export function checkNamibiaIsolatedEnvironment(env){
 if(!env||env.NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED!=="1"||
   env.NAMIBIA_INTERNAL_API_MODE!=="isolated_candidate")return fail("candidate_mode_disabled");
 if(env.NA_CANDIDATE_DB==null||env.DB==null||env.NA_CANDIDATE_DB===env.DB)
   return fail("separate_database_bindings_required");
 if(env.NAMIBIA_STAGE_KIND!=="disposable_internal_test")return fail("disposable_stage_required");
 const session=id(env.NAMIBIA_SESSION_DB_ID),data=id(env.NAMIBIA_CANDIDATE_DB_ID),
   prod=id(env.BOTSWANA_PRODUCTION_DB_ID);
 if(!session||!data||!prod||session===data||session===prod||data===prod)
   return fail("distinct_database_ids_required");
 // Preflight requires deployment-supplied identity for physical resources;
 // actual D1 bindings and privileges must be independently verified.
 if(env.NAMIBIA_BINDINGS_AUDITED!=="1")return fail("binding_audit_not_attested");
 if(typeof env.NA_CANDIDATE_TENANT_ALLOWLIST!=="string"||!env.NA_CANDIDATE_TENANT_ALLOWLIST.trim())
   return fail("synthetic_tenant_allowlist_required");
 const allow=env.NA_CANDIDATE_TENANT_ALLOWLIST.split(",").map(x=>x.trim());
 if(allow.some(x=>!/^synthetic-[A-Za-z0-9_-]{1,64}$/.test(x))||
    new Set(allow).size!==allow.length)return fail("only_synthetic_tenants_allowed");
 return Object.freeze({ok:true,mode:"isolated_candidate",realBindingAuditStillRequired:true,
   customerActivationAllowed:false,productionWritesAllowed:false});
}
