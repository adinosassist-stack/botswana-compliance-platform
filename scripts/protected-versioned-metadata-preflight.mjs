// Protected read-only historical candidate preflight. Never imports data or grants approval.
import {readIsolatedVersionedPreflight} from './qualify-isolated-versioned-preflight.mjs';
const SHA=/^[a-f0-9]{40}$/;
const fail=()=>{throw Error('protected_versioned_metadata_hold')};
export function checkProtectedMetadataDispatch(e){
 if(e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
    e.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    e.GITHUB_REF!=='refs/heads/main'||
    e.PREFLIGHT_CONFIRM!=='READ_ONLY_VERSIONED_PREFLIGHT'||
    !SHA.test(e.EXPECTED_SHA||'')||
    e.EXPECTED_SHA!==e.GITHUB_SHA)fail();
 return {approvedEnvironment:false,cloudReadsPerformed:false,restoreAuthorized:false};
}
export async function runProtectedMetadataRead({env,readMainSha,inspect=readIsolatedVersionedPreflight}){
 checkProtectedMetadataDispatch(env);
 if(typeof readMainSha!=='function')fail();
 const before=await readMainSha();
 if(before!==env.EXPECTED_SHA)fail();
 const result=await inspect({accountId:env.OPERATIONS_REHEARSAL_ACCOUNT_ID,
  token:env.OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN,
  expectedMainSha:env.EXPECTED_SHA,observedMainSha:before});
 const after=await readMainSha();
 if(after!==env.EXPECTED_SHA)fail();
 if(result?.restoreAuthorized!==false||result?.productionWriteAuthorized!==false||
    result?.retentionEnforced!==false||result?.restorePerformed!==false)fail();
 return {...result,revisionRechecked:true,restoreAuthorized:false,productionWriteAuthorized:false,
  disposition:'HOLD_FOR_INDEPENDENT_OBJECT_ENFORCEMENT_AND_RESTORE_AUTHORIZATION'};
}
