// Server-side authorization boundary for reference governance operations.
// Identity and approval are obtained only from trusted server providers.
// This module is NOT registered as an HTTP endpoint.
export async function createAuthorizedAgentBudgetService({sessionProvider,policyProvider,transactionAdapter}) {
 if(typeof sessionProvider!=="function"||typeof policyProvider!=="function"||!transactionAdapter) throw new TypeError("trusted dependencies required");
 const {reserveAgentBudget}=await import("./agent-budget-reservation-coordinator.mjs");
 return {
  async reserve({agentId,requestId,costMinor,expectedVersion,occurredAt}) {
   const session=await sessionProvider();
   if(!session||session.authenticated!==true||!session.tenantId||!session.actorId||session.role!=="owner") return {status:"unauthorized"};
   if(typeof agentId!=="string"||!agentId) return {status:"invalid_agent"};
   const policy=await policyProvider({tenantId:session.tenantId,agentId});
   if(!policy||policy.tenantId!==session.tenantId||policy.agentId!==agentId) return {status:"denied"};
   if(policy.enabled!==true||policy.stopped===true||policy.version!==expectedVersion) return {status:"denied"};
   // This only reserves an accounting budget; it never executes a payment.
   return reserveAgentBudget({
    db:transactionAdapter,
    identity:{tenantId:session.tenantId,agentId,actorId:session.actorId},
    request:{requestId},costMinor,expectedVersion,occurredAt
   });
  }
 };
}
