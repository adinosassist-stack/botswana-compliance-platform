import {
  THEBE_AGENT_ID,FINANCE_OBSERVER_AGENT_ID,
  loadCanonicalAgentAuthority,authorityPermitsExecution,evaluateCanonicalAgentDrift,transitionCanonicalAgentAuthority
} from "../../cloudflare/src/agent-control-plane.js";

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true});
    if(url.pathname!=="/probe"||request.method!=="POST")return json({ok:false},404);

    const initial=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
    const observer=await loadCanonicalAgentAuthority(env,FINANCE_OBSERVER_AGENT_ID);
    const initialDrift=await evaluateCanonicalAgentDrift(env,{persist:false});

    let observerEscalationBlocked=false;
    try{
      await env.DB.prepare("UPDATE agent_registry SET execution_capable=1 WHERE agent_id=?").bind(FINANCE_OBSERVER_AGENT_ID).run();
    }catch{observerEscalationBlocked=true}

    const suspended=await transitionCanonicalAgentAuthority({
      env,agentId:THEBE_AGENT_ID,newState:"suspended",reasonCode:"runtime_probe",actorType:"system",actorId:"d1-test"
    });
    const afterSuspended=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
    const resumed=await transitionCanonicalAgentAuthority({
      env,agentId:THEBE_AGENT_ID,newState:"active",reasonCode:"runtime_probe_resume",actorType:"system",actorId:"d1-test"
    });

    await env.DB.prepare("UPDATE agent_registry SET execution_capable=0 WHERE agent_id=?").bind(THEBE_AGENT_ID).run();
    const degraded=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
    const drift=await evaluateCanonicalAgentDrift(env,{persist:true});
    let reEscalationBlocked=false;
    try{
      await env.DB.prepare("UPDATE agent_registry SET execution_capable=1 WHERE agent_id=?").bind(THEBE_AGENT_ID).run();
    }catch{reEscalationBlocked=true}

    const revoked=await transitionCanonicalAgentAuthority({
      env,agentId:THEBE_AGENT_ID,newState:"revoked",reasonCode:"runtime_probe_revoke",actorType:"system",actorId:"d1-test"
    });
    let revokedTerminalBlocked=false;
    try{
      await env.DB.prepare("UPDATE agent_registry SET authority_state='active' WHERE agent_id=?").bind(THEBE_AGENT_ID).run();
    }catch{revokedTerminalBlocked=true}
    const revive=await transitionCanonicalAgentAuthority({
      env,agentId:THEBE_AGENT_ID,newState:"active",reasonCode:"runtime_probe_illegal_revive",actorType:"system",actorId:"d1-test"
    });
    const eventCount=await env.DB.prepare("SELECT COUNT(*) count FROM agent_authority_events WHERE agent_id=?").bind(THEBE_AGENT_ID).first();
    const findingCount=await env.DB.prepare("SELECT COUNT(*) count FROM agent_authority_drift_findings WHERE agent_id=? AND status='open'").bind(THEBE_AGENT_ID).first();

    return json({
      initial,observer,
      initialExecutionPermitted:authorityPermitsExecution(initial),
      observerExecutionPermitted:authorityPermitsExecution(observer),
      initialDrift,
      observerEscalationBlocked,
      suspended,
      suspendedExecutionPermitted:authorityPermitsExecution(afterSuspended),
      resumed,
      degraded,
      degradedExecutionPermitted:authorityPermitsExecution(degraded),
      drift,
      reEscalationBlocked,
      revoked,
      revokedTerminalBlocked,
      revive,
      eventCount:Number(eventCount?.count||0),
      findingCount:Number(findingCount?.count||0)
    });
  }
};
