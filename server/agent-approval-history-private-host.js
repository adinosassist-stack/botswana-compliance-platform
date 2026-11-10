// Composes the already-qualified host guards for an isolated private Agent route.
// Not imported by server.js: the host must explicitly opt in after staging approval.
import {registerAgentApprovalHistoryExpress} from "./agent-approval-history-express.js";
import {createAgentHistoryHostGuards} from "./agent-approval-history-host-guards.js";
import {createAgentHistorySecurityCallbacks} from "./agent-approval-history-security-callbacks.js";
import {createAgentHistoryReadiness} from "./agent-approval-history-readiness.js";
import {createAgentHistoryPostgresRateLimiter} from "./agent-approval-history-postgres-rate-limit.js";
export function registerPrivateAgentHistory({
 app,enabled=false,killSwitch=true,sessionAuth,pool,publicOrigin,requestOriginAllowed
}={}){
 if(enabled!==true||killSwitch!==false)return false;
 if(!app||typeof app.get!=="function"||typeof sessionAuth!=="function"||
 !pool||typeof pool.query!=="function"||typeof publicOrigin!=="string"||
 !publicOrigin||typeof requestOriginAllowed!=="function")
 throw new TypeError("agent_history_private_host_dependencies_required");
 const sharedLimiter=createAgentHistoryPostgresRateLimiter({pool});
 const readiness=createAgentHistoryReadiness({pool,distributedRateLimit:sharedLimiter});
 const callbacks=createAgentHistorySecurityCallbacks({
  publicOrigin,requestOriginAllowed,auditHealth:readiness.auditHealth
 });
 const guards=createAgentHistoryHostGuards({
  pool,allowedOrigin:callbacks.allowedOrigin,rateLimit:readiness.rateLimit,
  auditAvailable:callbacks.auditAvailable
 });
 return registerAgentApprovalHistoryExpress({
  app,enabled:true,killSwitch:false,sessionAuth,...guards
 });
}
