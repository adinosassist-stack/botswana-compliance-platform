// Static, deny-by-default review of the proposed dormant Namibia Worker manifest.
// This is NOT a TOML interpreter: it rejects complex/multiline TOML rather than
// trying to safely understand new capabilities. No Cloudflare credentials.
const root=new Set(["name","main","compatibility_date","workers_dev","preview_urls","keep_vars"]);
const vars=new Set(["APP_ENV","NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED","NAMIBIA_INTERNAL_API_MODE",
 "NAMIBIA_BINDINGS_AUDITED","NAMIBIA_STAGE_KIND","NAMIBIA_SESSION_DB_ID",
 "NAMIBIA_CANDIDATE_DB_ID","BOTSWANA_PRODUCTION_DB_ID"]);
const d1=new Set(["binding","database_name","database_id"]);
const ids=new Map([
 ["DB",["na-sessions-disposable-20261107","cb833f28-8ea6-4234-b183-c12c018aac15"]],
 ["NA_CANDIDATE_DB",["na-compliance-disposable-20261107","c8ce1dd7-6973-45e8-be7f-1b4f2b672312"]],
 ["NA_SOURCE_REVIEW_DB",["na-source-review-disposable-v2-20261107","b45ebf26-429d-47ae-ae88-c404c8965c5b"]]
]);
const fail=(reason)=>Object.freeze({ok:false,error:reason});
export function validateNamibiaDormantManifest(content){
 if(typeof content!=="string"||content.length>10000)return fail("manifest_unavailable_or_too_large");
 const sections={root:[],vars:[],d1:[]};let current="root",index=-1;
 const lines=content.split(/\r?\n/);
 for(const original of lines){
  const line=original.trim();
  if(!line||line.startsWith("#"))continue;
  if(line==="[vars]"){if(sections.vars.length)return fail("repeated_vars_section");current="vars";continue}
  if(line==="[[d1_databases]]"){current="d1";index++;if(index>=3)return fail("too_many_db_bindings");sections.d1.push([]);continue}
  if(line.startsWith("[")||line.includes(";")||line.includes("'''")||line.includes('"""'))
   return fail("unreviewed_manifest_syntax_or_capability");
  const entry=line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|true|false)$/);
  if(!entry||entry[2].includes("\\"))return fail("unreviewed_manifest_value");
  const [_,key,value]=entry;
  const allowed=current==="root"?root:current==="vars"?vars:d1;
  if(!allowed.has(key))return fail("unreviewed_manifest_key_"+key);
  const destination=current==="d1"?sections.d1[index]:sections[current];
  if(destination.some(e=>e[0]===key))return fail("duplicate_manifest_key_"+key);
  destination.push([key,value==="true"?true:value==="false"?false:value.slice(1,-1)]);
 }
 const toMap=rows=>new Map(rows);
 const r=toMap(sections.root),v=toMap(sections.vars);
 if(sections.root.length!==root.size||sections.vars.length!==vars.size||sections.d1.length!==3)
  return fail("missing_required_manifest_fields");
 if(r.get("name")!=="na-compliance-internal-candidate"||
    r.get("main")!=="src/namibia-staging-entry.js"||
    r.get("compatibility_date")!=="2026-09-03"||
    r.get("workers_dev")!==false||r.get("preview_urls")!==false||
    r.get("keep_vars")!==false)return fail("unsafe_root_configuration");
 if(v.get("APP_ENV")!=="namibia-disposable-staging"||
    v.get("NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED")!=="0"||
    v.get("NAMIBIA_INTERNAL_API_MODE")!=="disabled"||
    v.get("NAMIBIA_BINDINGS_AUDITED")!=="0"||
    v.get("NAMIBIA_STAGE_KIND")!=="disposable_internal_test"||
    v.get("NAMIBIA_SESSION_DB_ID")!==ids.get("DB")[1]||
    v.get("NAMIBIA_CANDIDATE_DB_ID")!==ids.get("NA_CANDIDATE_DB")[1]||
    v.get("BOTSWANA_PRODUCTION_DB_ID")!=="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce")
    return fail("unsafe_runtime_configuration");
 const seen=new Set();
 for(const rows of sections.d1){
  const b=toMap(rows),binding=b.get("binding");
  if(rows.length!==3||!ids.has(binding)||seen.has(binding))return fail("unexpected_db_binding");
  seen.add(binding);
  if(b.get("database_name")!==ids.get(binding)[0]||b.get("database_id")!==ids.get(binding)[1])
   return fail("wrong_db_identity");
 }
 return Object.freeze({ok:true,reviewOnly:true,disposableDbBindings:3,
   deploymentAuthorized:false,customerRuntimeEnabled:false});
}
