// Reference-only transactional reservation coordinator.
// The repository adapter must guarantee a serializable transaction or equivalent
// atomic compare-and-swap and rollback for ALL writes, including the audit event.
import {reservationStatements} from "./agent-budget-persistence-contract.mjs";
import {createAgentAuditEvent} from "./agent-audit-event.mjs";
export async function reserveAgentBudget({db,identity,request,costMinor,expectedVersion,occurredAt}) {
 if(!db||typeof db.transaction!=="function") throw new TypeError("transaction adapter required");
 const {tenantId,agentId,actorId}=identity??{};
 const {requestId}=request??{};
 if(typeof actorId!=="string"||!actorId) throw new TypeError("trusted actor required");
 const q=reservationStatements({tenantId,agentId,requestId,costMinor,expectedVersion,createdAt:occurredAt});
 const event=createAgentAuditEvent({tenantId,agentId,actorId,requestId,type:"budget_reserved",occurredAt,details:{costMinor,policyVersion:expectedVersion}});
 return db.transaction(async tx=>{
  if(!tx||typeof tx.get!=="function"||typeof tx.run!=="function") throw new TypeError("invalid transaction adapter");
  const existing=await tx.get(q.existing.sql,q.existing.params);
  if(existing){
   if(existing.cost_minor!==costMinor) return {status:"conflict"};
   return {status:"duplicate",costMinor};
  }
  const result=await tx.run(q.debit.sql,q.debit.params);
  if(result?.changes!==1) return {status:"denied"};
  await tx.run(q.record.sql,q.record.params);
  // Adapter MUST implement appendAudit in the same transaction.
  if(typeof tx.appendAudit!=="function") throw new TypeError("transactional audit adapter required");
  await tx.appendAudit(event);
  return {status:"reserved",costMinor};
 });
}
// Do not mount as a live route until authenticated tenant/actor context,
// real transactional adapter and deployment qualification are independently reviewed.
