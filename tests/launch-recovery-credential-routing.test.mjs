import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRehearsalToken,rehearsalProbeBase} from '../scripts/isolated-operations-rehearsal.mjs';

// Credential routing is deliberately tested with synthetic values only.
// Never use real provider credentials or perform remote calls in this suite.
test('read-only preflight uses only the operations token',()=>{
  const env={OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'operations-only',PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'restore-only'};
  for(const mode of ['PREFLIGHT_ONLY','PREFLIGHT_WORKER'])
    assert.equal(selectRehearsalToken(mode,env),'operations-only');
});

test('restore and verification require the distinct private backup credential',()=>{
  const env={OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'operations-only',PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'restore-only'};
  for(const mode of ['RESTORE_APPROVED_BACKUP','VERIFY_EXISTING_RESTORE']){
    assert.equal(selectRehearsalToken(mode,env),'restore-only');
    assert.throws(()=>selectRehearsalToken(mode,{OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'operations-only'}),/rehearsal_restore_credential_required/);
  }
});

test('unknown modes cannot select any credential',()=>{
  for(const mode of ['PRODUCTION_RESTORE','DEPLOY_PRODUCTION','',null])
    assert.throws(()=>selectRehearsalToken(mode,{OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'operations-only'}),/rehearsal_invalid_authority/);
});

test('preflight never constructs an externally callable rehearsal probe',()=>{
  for(const mode of ['PREFLIGHT_ONLY','PREFLIGHT_WORKER','RESTORE_APPROVED_BACKUP','VERIFY_EXISTING_RESTORE'])
    assert.equal(rehearsalProbeBase(mode,'https://attacker.example/'),undefined);
});

test('rehearsal probe accepts only the locked workers.dev hostname and root path',()=>{
  const allowed='https://bw-compliance-os-ops-rehearsal.example-account.workers.dev/';
  assert.equal(rehearsalProbeBase('ALERT_PROBE',allowed).href,allowed);
  for(const url of [
    'http://bw-compliance-os-ops-rehearsal.example-account.workers.dev/',
    'https://bw-compliance-os-ops-rehearsal.example-account.workers.dev/other',
    'https://bw-compliance-os-ops-rehearsal.example-account.workers.dev/?token=x',
    'https://bw-compliance-os-ops-rehearsal.example-account.workers.dev:8443/',
    'https://bw-compliance-os-ops-rehearsal.example-account.workers.dev.evil.example/'
  ])assert.throws(()=>rehearsalProbeBase('ALERT_PROBE',url),/rehearsal_worker_url/);
});
