// Read-only review of a privileged Cloudflare Worker settings inventory.
// Never trust caller-supplied metadata alone as proof of an actual binding.
export const NAMIBIA_WORKER_BINDING_AUDIT_VERSION="2026-11-07.v1";
const fail=error=>Object.freeze({ok:false,error});
const uuid=s=>typeof s==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export function inspectNamibiaWorkerBindings({scripts,productionDbId,namibiaDbIds}={}){
 if(!Array.isArray(scripts)||!scripts.length||scripts.length>100||
    !uuid(productionDbId)||!Array.isArray(namibiaDbIds)||namibiaDbIds.length!==3||
    namibiaDbIds.some(id=>!uuid(id))||new Set(namibiaDbIds).size!==3||
    namibiaDbIds.includes(productionDbId))return fail("invalid_binding_inventory");
 const seen=new Set(),hits=[];
 for(const script of scripts){
  if(!script||typeof script.name!=="string"||seen.has(script.name)||
     !Array.isArray(script.bindings))return fail("invalid_script_binding_record");
  seen.add(script.name);
  for(const binding of script.bindings){
   if(!binding||typeof binding.name!=="string"||binding.type!=="d1"||
      !uuid(binding.databaseId))return fail("incomplete_d1_binding_record");
   if(namibiaDbIds.includes(binding.databaseId))
     hits.push(Object.freeze({script:script.name,binding:binding.name,databaseId:binding.databaseId}));
  }
 }
 const prod=scripts.find(x=>x.name==="bw-compliance-os");
 if(!prod||!prod.bindings.some(x=>x.name==="DB"&&x.databaseId===productionDbId))
   return fail("production_binding_not_verified");
 return Object.freeze({ok:true,checkedScripts:scripts.length,
   namibiaBindingHits:Object.freeze(hits),
   noObservedNamibiaBindings:hits.length===0,
   bindingEvidenceOnly:true,sessionPilotReady:false,
   blockers:Object.freeze(["no_reviewer_authorized_isolated_worker",
     "staging_auth_and_security_qualification_required","independent_release_approval_required"])});
}
