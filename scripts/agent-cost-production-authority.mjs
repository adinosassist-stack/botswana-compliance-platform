const REPO="adinosassist-stack/botswana-compliance-platform";
const fail=code=>{throw new Error(code)};
export async function verifyAgentCostProductionAuthority({sha,token,fetchImpl=globalThis.fetch}={}){
  if(!/^[a-f0-9]{40}$/.test(sha)||!token||typeof fetchImpl!=="function")fail("migration_authority_invalid");
  async function get(path){
    const r=await fetchImpl(`https://api.github.com/repos/${REPO}/${path}`,{redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{authorization:`Bearer ${token}`,accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});
    if(!r.ok)fail("migration_authority_unavailable");return r.json();
  }
  const main=await get("branches/main");if(main?.commit?.sha!==sha)fail("migration_authority_stale");
  const commit=await get(`commits/${sha}`);if(commit.sha!==sha||commit.parents?.length!==2)fail("migration_authority_not_merged_pr");
  const pulls=await get(`commits/${sha}/pulls?per_page=100`);
  const matches=Array.isArray(pulls)?pulls.filter(p=>p.merged_at&&p.merge_commit_sha===sha&&p.base?.ref==="main"&&p.base?.repo?.full_name===REPO):[];
  if(matches.length!==1||matches[0].draft||matches[0].head?.sha!==commit.parents[1].sha)fail("migration_authority_not_merged_pr");
  const pr=matches[0];
  const marker=String(pr.body||"").match(/<!-- THEBE_AGENT_COST_REVIEW\s*([\s\S]*?)\s*-->/);
  let review;try{review=JSON.parse(marker?.[1]||"")}catch{fail("migration_adversarial_review_missing")}
  if(review.headSha!==pr.head.sha||review.sourceScope!=="pass"||review.runtimeSecurity!=="pass"||
    review.evidenceIntegrity!=="pass"||review.unresolvedFindings!==0||review.activation!=="HOLD")fail("migration_adversarial_review_missing");
  const requirements=[
    ["audit-remediation-ci.yml",pr.head.sha,"pull_request"],
    ["agent-cost-accounting.yml",pr.head.sha,"pull_request"],
    ["recovery-ci.yml",sha,"push"],
    ["mobile-startup-recovery.yml",sha,"push"],
    ["legacy-orphan-qualification.yml",sha,"workflow_dispatch"]
  ];
  for(const [workflow,head,event] of requirements){
    const response=await get(`actions/workflows/${workflow}/runs?head_sha=${head}&event=${event}&per_page=100`);
    const runs=(response.workflow_runs||[]).filter(r=>r.head_sha===head&&r.event===event&&
      (event==="pull_request"?r.pull_requests?.some(p=>p.number===pr.number):r.head_branch==="main"))
      .sort((a,b)=>b.id-a.id);
    if(!runs.length||runs[0].status!=="completed"||runs[0].conclusion!=="success")fail("migration_qualification_missing");
  }
  return {sha,prNumber:pr.number,headSha:pr.head.sha,activation:"HOLD"};
}
