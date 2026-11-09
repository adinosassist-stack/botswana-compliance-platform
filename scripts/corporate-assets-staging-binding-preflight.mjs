/**
 * Corporate Assets staging metadata gate. Read-only/offline: caller supplies
 * Cloudflare Worker settings metadata, never secret values.
 * A pass means *only* bindings and hold flags qualify; not auth/D1 acceptance.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{40}$/;
const SECRET_NAMES=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'];
export function checkAssetStagingBindingMetadata(bindings,{databaseId,sourceSha}={}){
 const errors=[];
 if(!Array.isArray(bindings))return Object.freeze({ready:false,errors:['bindings_missing']});
 const names=new Map();
 for(const b of bindings){
  if(!b||typeof b.name!=='string')continue;
  names.set(b.name,[...(names.get(b.name)||[]),b]);
 }
 const binding=(name)=>{
  const matches=names.get(name)||[];
  if(matches.length!==1){errors.push(name+'_missing_or_duplicate');return null}
  return matches[0];
 };
 for(const name of SECRET_NAMES){
  const b=binding(name);
  if(b&&b.type!=='secret_text')errors.push(name+'_must_be_secret_text');
 }
 const value=(name)=>{
  const b=binding(name);
  if(!b)return null;
  if(b.type!=='plain_text'){errors.push(name+'_type_invalid');return null}
  return b.text;
 };
 if(value('APP_ENV')!=='staging')errors.push('staging_environment_required');
 if(value('DEPLOYMENT_PROFILE')!=='corporate-assets-isolated')errors.push('isolated_profile_required');
 if(value('ASSETS_STAGING_WRITES_ENABLED')!=='false')errors.push('writes_must_remain_off');
 if(value('THEBE_CORPORATE_ASSETS_ENABLED')!=='false')errors.push('assets_must_remain_off');
 const actualId=value('ASSETS_STAGING_D1_ID');
 if(!UUID.test(databaseId||'')||actualId!==databaseId)errors.push('isolated_database_id_mismatch');
 const actualSha=value('ASSETS_STAGING_SOURCE_SHA');
 if(!SHA.test(sourceSha||'')||actualSha!==sourceSha)errors.push('source_sha_mismatch');
 const db=binding('DB');
 if(db&&(db.type!=='d1'||(db.id||db.database_id)!==databaseId))errors.push('d1_binding_mismatch');
 return Object.freeze({ready:errors.length===0,errors:Object.freeze(errors)});
}
