import governed,{logicalRequestPath,registrationCohort,registrationMode} from "./release-governance-entry.js";

const MAX_EVALUATION_COHORT=30;
const REGISTRATION_PATH="/api/auth/register";
const REGISTRATION_PROOF_CHALLENGE_PATH="/api/auth/registration-proof/challenge";
const REGISTRATION_POLICY_PATH="/api/auth/registration-policy";

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
}

function evaluationCohortPolicy(env){
  const mode=registrationMode(env);
  const cohort=registrationCohort(env);
  let reason=null;
  if(mode!=="cohort")reason="evaluation_requires_cohort";
  else if(cohort.size===0)reason="cohort_unconfigured";
  else if(cohort.size>MAX_EVALUATION_COHORT)reason="cohort_limit_exceeded";
  return {
    mode,
    cohortSize:cohort.size,
    maxCohort:MAX_EVALUATION_COHORT,
    configured:reason===null,
    reason
  };
}

function policyFailure(policy){
  return json({
    error:"evaluation_registration_unavailable",
    message:"The pre-launch evaluation cohort is not safely configured.",
    evaluation:true,
    registrationMode:policy.mode,
    cohortConfigured:false,
    cohortSize:policy.cohortSize,
    maxCohort:policy.maxCohort,
    reason:policy.reason
  },503,{"retry-after":"300"});
}

function decorate(response,policy){
  const headers=new Headers(response.headers);
  headers.set("x-thebe-evaluation","prelaunch-30");
  headers.set("x-thebe-evaluation-cohort-max",String(MAX_EVALUATION_COHORT));
  headers.set("x-thebe-evaluation-cohort-configured",policy.configured?"true":"false");
  headers.set("x-thebe-evaluation-registration-mode",policy.mode);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const policy=evaluationCohortPolicy(env);
    const path=logicalRequestPath(request);

    if(request.method==="GET"&&path===REGISTRATION_POLICY_PATH){
      return json({
        ok:true,
        mode:policy.mode,
        evaluation:true,
        launchStatus:"prelaunch-evaluation",
        cohortConfigured:policy.configured,
        cohortSize:policy.cohortSize,
        maxCohort:policy.maxCohort,
        reason:policy.reason
      },200,{
        "x-thebe-evaluation":"prelaunch-30",
        "x-thebe-evaluation-cohort-max":String(MAX_EVALUATION_COHORT)
      });
    }

    if(request.method==="POST"&&(path===REGISTRATION_PATH||path===REGISTRATION_PROOF_CHALLENGE_PATH)&&!policy.configured){
      return policyFailure(policy);
    }

    const response=await governed.fetch(request,env,ctx);
    return decorate(response,policy);
  },
  async scheduled(event,env,ctx){
    return governed.scheduled(event,env,ctx);
  }
};

export {MAX_EVALUATION_COHORT,evaluationCohortPolicy};
