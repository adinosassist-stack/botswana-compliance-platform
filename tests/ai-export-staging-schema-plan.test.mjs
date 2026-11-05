import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {candidateSha256,qualifyExportSchemaPlan,schemaPath} from '../scripts/qualify-ai-export-staging-schema-offline.mjs';
const ddl=readFileSync(schemaPath,'utf8');
const base={appEnv:'staging',accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:'ee6ddc6b-9de7-43f5-97e8-39442f1d1135',expectedSha256:candidateSha256(ddl),ddl};
test('review-only plan pins exact staging identity and SQL hash',()=>{
 const r=qualifyExportSchemaPlan(base);
 assert.equal(r.qualifiedForReview,true);
 assert.equal(r.approvedToApply,false);
 assert.equal(r.productionReady,false);
 assert.equal(r.remoteMutations,0);
 assert.equal(r.statementCount,3);
});
test('production or adjacent staging D1 is always refused',()=>{
 for(const id of ['8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','812f9021-890b-41e6-8fa1-6001f90a9b53','ff229eef-7724-49ae-9d68-d3a1db669b63'])
 assert.throws(()=>qualifyExportSchemaPlan({...base,databaseId:id}),/hold_target/);
 assert.throws(()=>qualifyExportSchemaPlan({...base,appEnv:'production'}),/hold_target/);
});
test('tampered SQL, unpinned hash and extra commands refuse',()=>{
 assert.throws(()=>qualifyExportSchemaPlan({...base,ddl:ddl+'\nDROP TABLE tenants;'}),/hold_digest/);
 assert.throws(()=>qualifyExportSchemaPlan({...base,expectedSha256:'0'.repeat(64)}),/hold_digest/);
 const bad=ddl+'\nDELETE FROM tenants;';
 assert.throws(()=>qualifyExportSchemaPlan({...base,ddl:bad,expectedSha256:candidateSha256(bad)}),/hold_ddl/);
});
test('unexpected account is refused',()=>assert.throws(()=>qualifyExportSchemaPlan({...base,accountId:'wrong'}),/hold_target/));
