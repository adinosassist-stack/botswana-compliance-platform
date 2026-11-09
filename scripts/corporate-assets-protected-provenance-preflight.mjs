/** Read-only protected main-SHA attestation, NOT a Worker upload or deployment.
 * Deliberately returns uploadProvenanceVerified=false until a separately reviewed
 * source-to-Cloudflare upload implementation and authenticated receipt exist.
 */
import {pathToFileURL} from 'node:url';
import {collectInputReceipt} from './corporate-assets-build-input-receipt.mjs';
import {validateEnvironmentPolicy} from './corporate-assets-protected-secret-candidate.mjs';
import {qualifyAssetV3,ACCOUNT,WORKER,CANDIDATE,ROLLBACK} from './corporate-assets-v3-predeployment-attestation.mjs';
const REPO='adinosassist-stack/botswana-compliance-platform';
const SHA=/^[0-9a-f]{40}$/;
const GH='https://api.github.com/repos/'+REPO;
const CF='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
export function checkProtectedProvenanceContext({repository,ref,githubSha,expectedSha,mainSha,environment,branches}={}){
 if(repository!==REPO||ref!=='refs/heads/main'||!SHA.test(expectedSha||'')||
  githubSha!==expectedSha||mainSha!==expectedSha)throw Error('exact_protected_main_sha_required');
 validateEnvironmentPolicy(environment,branches);
 return true;
}
async function fetchJson(url,token,request){
 if(!token||typeof token!=='string')throw Error('dedicated_read_token_required');
 const res=await request(url,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json',
  ...(url.startsWith(GH)?{'X-GitHub-Api-Version':'2022-11-28'}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('protected_metadata_read_failed_'+res.status);
 const data=await res.json();
 if(!data||typeof data!=='object')throw Error('protected_metadata_invalid');
 return data;
}
export async function inspectProtectedProvenance({expectedSha,repository,ref,githubSha,githubToken,cloudflareToken,request=fetch,receiptCollector=collectInputReceipt}={}){
 if(!SHA.test(expectedSha||'')||repository!==REPO||ref!=='refs/heads/main'||githubSha!==expectedSha)
  throw Error('exact_protected_main_sha_required');
 if(!githubToken||!cloudflareToken)throw Error('dedicated_staging_tokens_required');
 const [main,environment,policies]=await Promise.all([
  fetchJson(GH+'/commits/main',githubToken,request),
  fetchJson(GH+'/environments/corporate-assets-staging-protected',githubToken,request),
  fetchJson(GH+'/environments/corporate-assets-staging-protected/deployment-branch-policies?per_page=100',githubToken,request)
 ]);
 checkProtectedProvenanceContext({repository,ref,githubSha,expectedSha,mainSha:main.sha,environment,branches:policies.branch_policies});
 // Read only, after verifying protections and current exact main.
 const [version,deployments]=await Promise.all([
  fetchJson(CF+'/versions/'+CANDIDATE,cloudflareToken,request),
  fetchJson(CF+'/deployments',cloudflareToken,request)
 ]);
 if(version.success!==true||!version.result||deployments.success!==true||!deployments.result)
  throw Error('cloudflare_metadata_invalid');
 const offline=receiptCollector({expectedSha});
 if(offline.reviewedCommit!==expectedSha||offline.deploymentAuthorized!==false||offline.cloudflareArtifactVerified!==false||
  !/^[a-f0-9]{64}$/.test(offline.manifestDigest||''))throw Error('invalid_offline_build_receipt');
 const oldCandidate=qualifyAssetV3({candidate:version.result,deployments:{...deployments.result,result_info:deployments.result_info},reviewedMainSha:expectedSha});
 return Object.freeze({schema:'thebe.assets.protected-preflight.v1',mainSha:expectedSha,
  inputManifestDigest:offline.manifestDigest,existingCandidate:CANDIDATE,rollback:ROLLBACK,
  oldCandidateErrors:oldCandidate.errors,
  exactSourceUploadVerified:false,uploadAuthorized:false,deploymentAuthorized:false,
  recommendedAction:'separately_review_new_version_only_source_upload'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectProtectedProvenance({expectedSha:process.env.EXPECTED_MAIN_SHA,repository:process.env.GITHUB_REPOSITORY,
  ref:process.env.GITHUB_REF,githubSha:process.env.GITHUB_SHA,
  githubToken:process.env.ASSETS_STAGING_GITHUB_READ_TOKEN,
  cloudflareToken:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN})
 .then(v=>console.log(JSON.stringify(v))).catch(e=>{
  console.error(String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1;
 });
}
