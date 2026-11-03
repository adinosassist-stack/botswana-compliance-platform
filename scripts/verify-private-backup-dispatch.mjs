#!/usr/bin/env node
import {pathToFileURL} from 'node:url';

export function verifyPrivateBackupDispatch(e) {
  if(e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform')throw Error('backup_dispatch_repository_mismatch');
  if(e.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('backup_dispatch_event_mismatch');
  if(e.GITHUB_REF!=='refs/heads/main')throw Error('backup_dispatch_not_main');
  if(e.BACKUP_CONFIRM!=='PREPARE_PRIVATE_PRODUCTION_BACKUP')throw Error('backup_dispatch_not_authorized');
  if(!/^[a-f0-9]{40}$/.test(e.EXPECTED_SHA||''))throw Error('backup_dispatch_invalid_expected_sha');
  if(e.EXPECTED_SHA!==e.GITHUB_SHA)throw Error('backup_dispatch_stale_expected_sha');
  return {validated:true,kind:'private_backup_preapproval',sourceSha:e.EXPECTED_SHA};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const {sourceSha}=verifyPrivateBackupDispatch(process.env);
    console.log('Private backup dispatch exact-source preapproval passed: '+sourceSha);
  } catch(error) {
    console.error(String(error?.message||'backup_dispatch_preapproval_refused'));
    process.exitCode=1;
  }
}
