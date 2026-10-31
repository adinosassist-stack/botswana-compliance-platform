import test from 'node:test';
import assert from 'node:assert/strict';
import {renderIsolatedReadinessConfig} from '../scripts/render-isolated-readiness-config.mjs';
const args={accountId:'a'.repeat(32),sourceSha:'b'.repeat(40)};
test('separate fixed D1/R2, no routes or triggers, opt-in staging only',()=>{
 const c=renderIsolatedReadinessConfig(args);
 assert.equal(c.name,'bw-compliance-os-readiness-staging');
 assert.match(c.main,/release-governance-entry\.js$/);
 assert.deepEqual(c.routes,[]);assert.deepEqual(c.triggers.crons,[]);
 assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);
 assert.equal(c.vars.APP_ENV,'staging');assert.equal(c.vars.THEBE_READINESS_TIMING_DIAGNOSTIC,'1');
 assert.equal(c.d1_databases[0].database_id,'c5c232a8-8fe7-440c-81ba-021a44fd3fdd');
 assert.equal(c.r2_buckets[0].bucket_name,'bw-compliance-ops-evidence');
 for(const k of ['REGISTRATION_MODE','PAYMENT_PROVIDER','EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','AI_FEATURES_DEFAULT','THEBE_INTERNAL_AUTONOMY_ENABLED'])assert.ok(['hold','none','false','off'].includes(c.vars[k]));
 assert.doesNotMatch(JSON.stringify(c),/8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce|bw-compliance-evidence/);
});
test('reject malformed authority',()=>{assert.throws(()=>renderIsolatedReadinessConfig({accountId:'wrong',sourceSha:args.sourceSha}));assert.throws(()=>renderIsolatedReadinessConfig({...args,sourceSha:'wrong'}));});
