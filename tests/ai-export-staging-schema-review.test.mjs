import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildReviewManifest} from '../scripts/prepare-ai-export-staging-schema-review.mjs';
import {schemaPath} from '../scripts/qualify-ai-export-staging-schema-offline.mjs';
const ddl=readFileSync(schemaPath,'utf8');
const sha='559c5b66832ee25c18d69c94fc9bcf965ada1583';
test('evidence manifest has exact staging target and can never approve migration',()=>{
 const m=buildReviewManifest({sourceSha:sha,ddl});
 assert.equal(m.stagingDatabaseId,'ee6ddc6b-9de7-43f5-97e8-39442f1d1135');
 assert.match(m.schemaSha256,/^[a-f0-9]{64}$/);
 assert.equal(m.approvedToApply,false);
 assert.equal(m.remoteQueriesPerformed,0);
 assert.equal(m.remoteMutationsPerformed,0);
 assert.equal(m.schemaApplied,false);
 assert.equal(m.productionReady,false);
 assert.equal(m.requiresIndependentReviewer,'thusico');
 assert.equal(m.requiresSeparateProtectedStagingMigrationAuthorization,true);
});
test('refuse stale, malformed or absent source SHA',()=>{
 for(const x of ['',undefined,'G'.repeat(40),'a'.repeat(39)])
 assert.throws(()=>buildReviewManifest({sourceSha:x,ddl}),/schema_review_invalid_source_sha/);
});
test('refuse production database and schema tampering',()=>{
 assert.throws(()=>buildReviewManifest({sourceSha:sha,ddl,databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'}),/export_staging_schema_hold_target/);
 assert.throws(()=>buildReviewManifest({sourceSha:sha,ddl:ddl+'\nDROP TABLE tenants;'}),/export_staging_schema_hold_ddl/);
});
