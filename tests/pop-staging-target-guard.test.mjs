import test from 'node:test';import assert from 'node:assert/strict';
import {validateStagingTarget} from '../scripts/pop-staging-target-guard.mjs';
const good={target:'812f9021-890b-41e6-8fa1-6001f90a9b53',sourceSha:'26356d28bf6f181e495b9c5b02add5755e5de76a',currentMainSha:'26356d28bf6f181e495b9c5b02add5755e5de76a',confirmation:'INITIALIZE_EMPTY_POP_STAGING_ONLY',existingObjects:[{name:'_cf_KV'}]};
test('permits exact empty staging target only',()=>assert.equal(validateStagingTarget(good).productionWriteAllowed,false));
test('rejects production UUID',()=>assert.throws(()=>validateStagingTarget({...good,target:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'})));
test('rejects nonempty staging',()=>assert.throws(()=>validateStagingTarget({...good,existingObjects:[{name:'_cf_KV'},{name:'tenants'}]})));
test('rejects wrong SHA',()=>assert.throws(()=>validateStagingTarget({...good,sourceSha:'a'.repeat(40)})));
test('rejects absent authorization',()=>assert.throws(()=>validateStagingTarget({...good,confirmation:''})));

test('protected POP preflight uses the dedicated rehearsal account and token secrets',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync('.github/workflows/pop-staging-init-preflight.yml','utf8');
 assert.match(workflow,/CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.OPERATIONS_REHEARSAL_ACCOUNT_ID \}\}/);
 assert.match(workflow,/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN \}\}/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
});

test('POP staging preflight pins the expected Cloudflare account before provider access',async()=>{
 const {readFileSync}=await import('node:fs');
 const script=readFileSync('scripts/pop-staging-init-preflight.mjs','utf8');
 assert.match(script,/e\.CLOUDFLARE_ACCOUNT_ID!=='ddd23cab31928a4bb3d4998df9b26d1d'/);
 assert.match(script,/throw Error\('pop_preflight_unauthorized'\)/);
});
