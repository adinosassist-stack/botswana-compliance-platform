// Core-only production tenant dependency scope: strict physical-schema equality,
// except a single explicitly disabled POP 070 table. No D1 mutations.
export function qualifyProductionTenantDependencyTables({schema,liveTableNames,popUploadEnabled,aiExportsEnabled}={}){
  if(typeof schema!=='string'||!Array.isArray(liveTableNames))throw Error('tenant_dependency_invalid_inventory');
  const declared=[...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis)].map(match=>match[1]);
  if(!declared.length||new Set(declared).size!==declared.length)throw Error('tenant_dependency_invalid_schema');
  if(liveTableNames.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_]+$/.test(name)))throw Error('tenant_dependency_invalid_physical_table');
  const physical=new Set(liveTableNames);
  const missing=declared.filter(table=>!physical.has(table));
  if(missing.length){
    const popExplicitlyDisabled=popUploadEnabled==='false'&&aiExportsEnabled==='false';
    if(!popExplicitlyDisabled||missing.length!==1||missing[0]!=='payment_pop_documents'){
      throw Error('tenant_dependency_missing_required_table:'+missing.join(','));
    }
  }
  return Object.freeze({
    includedTables:Object.freeze(declared.filter(table=>physical.has(table))),
    deferredTables:Object.freeze(missing),
    declaredCount:declared.length
  });
}
