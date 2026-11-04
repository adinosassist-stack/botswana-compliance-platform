// Credential-free, fail-closed manual dispatch check BEFORE protected environment review.
// Authorization for recovery operations always requires a separate independent approval.
const SHA=/^[a-f0-9]{40}$/;
const OPTIONS=Object.freeze({
  isolated:{confirm:'RUN_ISOLATED_REHEARSAL',modes:new Set(['PREFLIGHT_ONLY','PREFLIGHT_WORKER','RESTORE_VERSIONED_CANDIDATE','RESTORE_APPROVED_BACKUP','VERIFY_EXISTING_RESTORE','ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'])},
  backup_integrity:{confirm:'QUALIFY_PRIVATE_BACKUP_CANDIDATES'}
});
function fail(){throw new Error('protected_recovery_dispatch_refused')}
export function verifyProtectedRecoveryDispatch(e){
 const kind=e.RECOVERY_DISPATCH_KIND;
 const option=Object.hasOwn(OPTIONS,kind)?OPTIONS[kind]:null;
 if(!option||e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REF!=='refs/heads/main'||
 e.RECOVERY_CONFIRM!==option.confirm||!SHA.test(e.EXPECTED_SHA||'')||
 e.EXPECTED_SHA!==e.GITHUB_SHA)fail();
 if(option.modes&&!option.modes.has(e.RECOVERY_MODE))fail();
 if(e.RECOVERY_MODE==='RESTORE_VERSIONED_CANDIDATE'&&
 (!/^[1-9][0-9]{0,14}$/.test(e.VERSIONED_OWNER_APPROVAL_ID??'')||
 !/^[1-9][0-9]{0,14}$/.test(e.VERSIONED_REVIEW_APPROVAL_ID??'')||
 e.VERSIONED_OWNER_APPROVAL_ID===e.VERSIONED_REVIEW_APPROVAL_ID))fail();
 return {kind,exactCheckoutSha:e.GITHUB_SHA,preapprovalSourceCheckPassed:true,
 independentEnvironmentApprovalObtained:false,remoteMutationsPerformed:false};
}
if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
 try{console.log(JSON.stringify(verifyProtectedRecoveryDispatch(process.env)))}
 catch{console.error('protected_recovery_dispatch_refused');process.exitCode=1}
}

