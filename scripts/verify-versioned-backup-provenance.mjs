// Read-only GitHub provenance check for a separately approved versioned backup.
// This cannot authorize production writes, recovery acceptance, or a restore.
import {pathToFileURL} from 'node:url';
const sha=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
const candidate=/^candidates\/([1-9][0-9]*)\/([1-9][0-9]*)\/production-d1\.sql$/;

export function checkVersionedBackupProvenance(e,run){
  const key=e.REHEARSAL_BACKUP_OBJECT_KEY||'';
  if(!key){
    if(e.REHEARSAL_BACKUP_SOURCE_SHA||e.REHEARSAL_BACKUP_CANDIDATE_RUN_ID)throw Error('backup_key_required_for_candidate_metadata');
    return {selection:'fixed_approved',remoteRunVerified:false};
  }
  const match=candidate.exec(key);
  if(!match)throw Error('backup_candidate_key_refused');
  const runId=match[1];
  if(e.REHEARSAL_BACKUP_CANDIDATE_RUN_ID!==runId||!sha.test(e.REHEARSAL_BACKUP_SOURCE_SHA||''))throw Error('backup_candidate_source_refused');
  if(!digest.test(e.REHEARSAL_BACKUP_SHA256||''))throw Error('backup_candidate_digest_required');
  if(typeof e.REHEARSAL_BACKUP_APPROVAL!=='string'||!e.REHEARSAL_BACKUP_APPROVAL.includes(runId))throw Error('backup_candidate_independent_review_required');
  if(!run||String(run.id)!==runId||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/private-production-backup-candidate.yml'||
    run.head_branch!=='main'||run.head_sha!==e.REHEARSAL_BACKUP_SOURCE_SHA||run.status!=='completed'||run.conclusion!=='success')
    throw Error('backup_candidate_run_provenance_refused');
  return {selection:'versioned_candidate',candidateRunId:runId,backupSourceSha:run.head_sha,remoteRunVerified:true};
}
export async function verifyVersionedBackupWithGitHub(e,{fetchImpl=fetch}={}){
  const key=e.REHEARSAL_BACKUP_OBJECT_KEY||'';
  if(!key)return checkVersionedBackupProvenance(e,null);
  const match=candidate.exec(key);
  if(!match)throw Error('backup_candidate_key_refused');
  if(e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||!e.GITHUB_TOKEN)
    throw Error('backup_github_authority_required');
  const url='https://api.github.com/repos/'+e.GITHUB_REPOSITORY+'/actions/runs/'+match[1];
  const response=await fetchImpl(url,{method:'GET',redirect:'error',
    headers:{'Authorization':'Bearer '+e.GITHUB_TOKEN,'Accept':'application/vnd.github+json'},
    signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('backup_run_metadata_unavailable');
  return checkVersionedBackupProvenance(e,await response.json());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await verifyVersionedBackupWithGitHub(process.env)));}
  catch{console.error('Versioned recovery candidate provenance preflight refused');process.exitCode=1;}
}
