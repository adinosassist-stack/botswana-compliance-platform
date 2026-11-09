// Review-only physical resource inventory cross-check. Not an auth gate by itself.
// Inputs must come from a privileged, authenticated Cloudflare inventory response;
// user-supplied config, headers, or application environment variables are NOT evidence.
export const NAMIBIA_RESOURCE_AUDIT_VERSION="2026-11-07.v1";
const fail=error=>Object.freeze({ok:false,error});
const uuid=x=>typeof x==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const expectedNames=Object.freeze({
  compliance:"na-compliance-disposable-20261107",
  sources:"na-source-review-disposable-v2-20261107",
  production:"bw-compliance-os"
});
export function auditNamibiaD1Inventory({databases,expectedProductionId,expectedComplianceId,expectedSourceId,sessionDbId}={}){
 if(!Array.isArray(databases)||databases.length===0||databases.length>500)
   return fail("authenticated_inventory_required");
 const seen=new Map(),seenIds=new Set();
 for(const db of databases){
  if(!db||typeof db.name!=="string"||!uuid(db.id)||seen.has(db.name)||seenIds.has(db.id))
    return fail("duplicate_or_invalid_resource_inventory");
  seen.set(db.name,db.id);seenIds.add(db.id);
 }
 if(!uuid(expectedProductionId)||!uuid(expectedComplianceId)||!uuid(expectedSourceId))
   return fail("expected_resource_ids_required");
 if(seen.get(expectedNames.production)!==expectedProductionId||
    seen.get(expectedNames.compliance)!==expectedComplianceId||
    seen.get(expectedNames.sources)!==expectedSourceId)return fail("cloudflare_inventory_id_mismatch");
 const ids=[expectedProductionId,expectedComplianceId,expectedSourceId];
 if(new Set(ids).size!==3)return fail("d1_identity_collision");
 // There is currently no separately verified Namibia session D1 in the inventory.
 // This is a blocking finding, never silently substitute Botswana's auth DB.
 if(!uuid(sessionDbId)||!seenIds.has(sessionDbId)||ids.includes(sessionDbId))
   return Object.freeze({ok:true,inventoryMatched:true,sessionIsolated:false,
     pilotReady:false,blockers:Object.freeze(["dedicated_namibia_session_database_missing",
       "physical_worker_binding_audit_required","independent_security_approval_required"])});
 return Object.freeze({ok:true,inventoryMatched:true,sessionIsolated:true,
   pilotReady:false,blockers:Object.freeze(["physical_worker_binding_audit_required",
     "independent_security_approval_required"])});
}
