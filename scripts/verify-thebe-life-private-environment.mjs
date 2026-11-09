/**
 * Read-only GitHub environment authorization verifier.
 * Never creates environments, releases Workers, or bypasses required reviewers.
 */
const OWNER='adinosassist-stack';
const REPO='botswana-compliance-platform';
const ENV_NAME='thebe-life-private-staging';
const slug='/repos/'+OWNER+'/'+REPO+'/environments/'+ENV_NAME;
export async function verifyLifePrivateEnvironment(getJson){
  const failures=[];
  let environment,policies;
  try {
    environment=await getJson(slug);
    policies=await getJson(slug+'/deployment-branch-policies?per_page=100');
  } catch { return Object.freeze({ready:false,failures:['environment_read_failed']}); }
  const reviewerRules=Array.isArray(environment?.protection_rules)
    ? environment.protection_rules.filter(r=>r?.type==='required_reviewers'):[];
  if(reviewerRules.length!==1)failures.push('single_required_review_rule_missing');
  const rule=reviewerRules[0]||{};
  const reviewers=Array.isArray(rule.reviewers)?rule.reviewers:[];
  const names=reviewers.filter(r=>r?.type==='User').map(r=>r?.reviewer?.login);
  if(!names.includes('thusico'))failures.push('thusico_independent_reviewer_missing');
  if(rule.prevent_self_review!==true)failures.push('self_review_prevention_missing');
  const policy=environment?.deployment_branch_policy;
  if(policy?.protected_branches!==false||policy?.custom_branch_policies!==true)
    failures.push('selected_main_only_policy_required');
  const branchRules=Array.isArray(policies?.branch_policies)?policies.branch_policies:[];
  if(branchRules.length!==1||branchRules[0]?.name!=='main'||(Number(policies?.total_count) !== 1))
    failures.push('main_only_branch_rule_required');
  return Object.freeze({ready:failures.length===0,failures});
}
async function main(){
  const token=process.env.LIFE_STAGING_GITHUB_ENV_READ_TOKEN||'';
  if(!token)throw Error('environment_read_token_required');
  const getJson=async path=>{
    const response=await fetch('https://api.github.com'+path,{
      headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
        'x-github-api-version':'2022-11-28','user-agent':'thebe-life-private-environment-verifier'}
    });
    if(!response.ok)throw Error('environment_api_read_failed_'+response.status);
    return response.json();
  };
  const result=await verifyLifePrivateEnvironment(getJson);
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.ready)process.exitCode=1;
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)
  main().catch(e=>{console.error(String(e.message));process.exitCode=1});
