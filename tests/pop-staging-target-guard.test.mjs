import test from 'node:test';import assert from 'node:assert/strict';
import {validateStagingTarget} from '../scripts/pop-staging-target-guard.mjs';
const good={target:'812f9021-890b-41e6-8fa1-6001f90a9b53',sourceSha:'26356d28bf6f181e495b9c5b02add5755e5de76a',currentMainSha:'26356d28bf6f181e495b9c5b02add5755e5de76a',confirmation:'INITIALIZE_EMPTY_POP_STAGING_ONLY',existingObjects:[{name:'_cf_KV'}]};
test('permits exact empty staging target only',()=>assert.equal(validateStagingTarget(good).productionWriteAllowed,false));
test('rejects production UUID',()=>assert.throws(()=>validateStagingTarget({...good,target:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'})));
test('rejects nonempty staging',()=>assert.throws(()=>validateStagingTarget({...good,existingObjects:[{name:'_cf_KV'},{name:'tenants'}]})));
test('rejects wrong SHA',()=>assert.throws(()=>validateStagingTarget({...good,sourceSha:'a'.repeat(40)})));
test('rejects absent authorization',()=>assert.throws(()=>validateStagingTarget({...good,confirmation:''})));

test('rejects populated POP schema even when internal KV exists',()=>assert.throws(()=>validateStagingTarget({...good,existingObjects:[{type:'table',name:'_cf_KV'},{type:'table',name:'payment_pop_documents'},{type:'table',name:'payment_pop_upload_requests'}]}),/staging_not_empty/));
test('rejects extra indexes, views, or triggers without application tables',()=>{for(const type of ['index','view','trigger'])assert.throws(()=>validateStagingTarget({...good,existingObjects:[{type:'table',name:'_cf_KV'},{type,name:'unexpected_schema_object'}]}),/staging_not_empty/)});
test('rejects missing internal KV table',()=>assert.throws(()=>validateStagingTarget({...good,existingObjects:[]}),/staging_not_empty/));
