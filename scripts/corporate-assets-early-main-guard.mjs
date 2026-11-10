/** Early read-only live-main check before requesting independent protected environment review.
 * Advisory freshness gate only. Protected job MUST recheck current main after approval.
 */
import {pathToFileURL} from 'node:url';
const REPO='adinosassist-stack/botswana-compliance-platform';
const SHA=/^[0-9a-f]{40}$/;
export function requireFreshDispatchedMain({repository,ref,githubSha,expectedSha,liveSha}={}){
 if(repository!==REPO||ref!=='refs/heads/main'||!SHA.test(expectedSha||'')||
    githubSha!==expectedSha||liveSha!==expectedSha)
  throw Error('early_exact_main_sha_required');
 return true;
}
export async function inspectEarlyMain({repository,ref,githubSha,expectedSha,token,request=fetch}={}){
 if(!token)throw Error('github_read_token_required');
 if(repository!==REPO||ref!=='refs/heads/main'||!SHA.test(expectedSha||'')||githubSha!==expectedSha)
  throw Error('early_exact_main_sha_required');
 const response=await request('https://api.github.com/repos/'+REPO+'/commits/main',{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
 });
 if(!response.ok)throw Error('early_main_read_failed');
 const main=await response.json();
 requireFreshDispatchedMain({repository,ref,githubSha,expectedSha,liveSha:main?.sha});
 return Object.freeze({status:'fresh_at_early_check_only',reviewedSha:expectedSha,
  protectedRecheckStillRequired:true,deploymentAuthorized:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectEarlyMain({repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
  githubSha:process.env.GITHUB_SHA,expectedSha:process.env.EXPECTED_MAIN_SHA,
  token:process.env.GITHUB_TOKEN}).then(x=>console.log(JSON.stringify(x))).catch(e=>{
  const code=['early_exact_main_sha_required','github_read_token_required','early_main_read_failed'].includes(e.message)?e.message:'early_main_metadata_invalid';
  console.error(code);process.exitCode=1;
 });
}
