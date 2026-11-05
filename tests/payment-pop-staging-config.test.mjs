import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPopHttpStagingConfig} from '../scripts/render-pop-http-staging-config.mjs';
test('config pins separate resources/source, no public routes or previews and no active capabilities',()=>{
 const config=renderPopHttpStagingConfig({sourceSha:'a'.repeat(40),adminEmails:'OWNER@example.invalid'});
 assert.equal(config.vars.POP_HTTP_STAGING_SOURCE_SHA,'a'.repeat(40));assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);
 assert.equal(config.routes,undefined);assert.equal(config.triggers,undefined);assert.equal(config.assets,undefined);
 assert.equal(config.d1_databases[0].database_id,'812f9021-890b-41e6-8fa1-6001f90a9b53');
 assert.equal(config.r2_buckets[0].bucket_name,'bw-pop-http-staging-quarantine');
 assert.equal(config.vars.PAYMENT_PROVIDER,'none');assert.equal(config.vars.PLATFORM_ADMIN_EMAILS,'owner@example.invalid');
 for(const [name,value] of Object.entries(config.vars))if(name.endsWith('_ENABLED'))assert.equal(value,name==='AGENT_BOUNDED_TASK_EXECUTION_ENABLED'?'0':'false');
 assert.ok(!JSON.stringify(config).includes('8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'));
});
test('malformed source/admin input cannot produce deployment config',()=>{
 for(const args of [{},{sourceSha:'main',adminEmails:'owner@example.invalid'},{sourceSha:'a'.repeat(40),adminEmails:'owner@example.invalid\ncredential'},{sourceSha:'a'.repeat(40),adminEmails:''}])assert.throws(()=>renderPopHttpStagingConfig(args));
});
