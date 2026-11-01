// Source-only proof of bounded schema metadata reconciliation.
// This script never calls Cloudflare and never executes SQL.
import {readFileSync} from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('missing_catalog_path');
const payload=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(payload.objects))throw Error('invalid_catalog');
const allowed=new Set(['table','index','trigger','view']);
const seen=new Set();
const counts={table:0,index:0,trigger:0,view:0};
let missingDefinition=0;
for(const item of payload.objects){
  if(!item||typeof item.name!=='string'||!allowed.has(item.type)||
     typeof item.tbl_name!=='string'||typeof item.ddl_length!=='number'||
     !Number.isInteger(item.ddl_length)||item.ddl_length<0)throw Error('invalid_catalog_record');
  const key=item.type+':'+item.name;
  if(seen.has(key))throw Error('duplicate_catalog_record');
  seen.add(key);counts[item.type]++;
  if(item.ddl_length===0)missingDefinition++;
}
const report={kind:'pop_schema_definition_manifest',objects:seen.size,counts,missingDefinition,
  sqlDefinitionsIncluded:false,customerRecordsRead:false,stagingWritePerformed:false,
  productionWritePerformed:false,stagingCompatibilityProven:false,restoreProven:false};
console.log(JSON.stringify(report));
if(!seen.size||missingDefinition)process.exitCode=2;
