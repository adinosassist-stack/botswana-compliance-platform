// Offline-only staging migration plan. Deliberately has no Cloudflare imports or network calls.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const TARGET='ee6ddc6b-9de7-43f5-97e8-39442f1d1135';
const PROD='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
export const schemaPath=new URL('../docs/ai-export-d1-schema-candidate.sql',import.meta.url);
export const candidateSha256=ddl=>createHash('sha256').update(ddl,'utf8').digest('hex');
const deny=reason=>{throw Error('export_staging_schema_hold_'+reason)};
export function qualifyExportSchemaPlan({accountId,databaseId,expectedSha256,ddl,appEnv='staging'}={}){
 if(appEnv!=='staging'||accountId!==ACCOUNT||databaseId!==TARGET||databaseId===PROD)deny('target');
 if(typeof ddl!=='string'||typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256)
   ||candidateSha256(ddl)!==expectedSha256)deny('digest');
 const cleaned=ddl.replace(/^\s*--[^\n]*$/gm,'').trim();
 const statements=cleaned.split(';').map(s=>s.trim()).filter(Boolean);
 if(statements.length!==3
  ||!/^CREATE TABLE IF NOT EXISTS ai_document_export_jobs\s*\(/i.test(statements[0])
  ||!/^CREATE INDEX IF NOT EXISTS idx_ai_export_tenant_actor\s+ON ai_document_export_jobs\s*\(/i.test(statements[1])
  ||!/^CREATE INDEX IF NOT EXISTS idx_ai_export_expiry\s+ON ai_document_export_jobs\s*\(/i.test(statements[2])
  ||/(?:\bDROP\b|\bALTER\b|\bATTACH\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bPRAGMA\b|\bTRIGGER\b)/i.test(cleaned))deny('ddl');
 return Object.freeze({qualifiedForReview:true,approvedToApply:false,productionReady:false,
  action:'REVIEW_ONLY_DO_NOT_EXECUTE',stagingDatabaseId:TARGET,sha256:expectedSha256,
  statementCount:3,productionDatabaseIdExcluded:true,remoteMutations:0});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const ddl=readFileSync(schemaPath,'utf8');
 const digest=candidateSha256(ddl);
 const result=qualifyExportSchemaPlan({accountId:ACCOUNT,databaseId:TARGET,expectedSha256:digest,ddl});
 process.stdout.write(JSON.stringify(result)+'\n');
}
