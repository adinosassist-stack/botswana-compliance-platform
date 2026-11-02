// Offline table dependency ordering diagnostic. No network or SQL execution.
export function inspectCreateOrder(definitions) {
 const tables=definitions.filter(x=>x.type==='table');
 const names=new Set(tables.map(x=>x.name.toLowerCase()));
 const built=new Set();
 const findings=[];
 for(const table of tables){
  const parts=table.sql.split('REFERENCES ');
  const dependencies=parts.slice(1).map(part=>part.trim().split(/[^a-zA-Z0-9_]/)[0].toLowerCase());
  const missing=[...new Set(dependencies.filter(name=>names.has(name)&&!built.has(name)&&name!==table.name.toLowerCase()))];
  if(missing.length)findings.push({table:table.name,dependencies_not_created:missing});
  built.add(table.name.toLowerCase());
 }
 return {tableCount:tables.length,forwardReferenceCount:findings.length,
  firstIssue:findings[0]||null,databaseWrites:false};
}
