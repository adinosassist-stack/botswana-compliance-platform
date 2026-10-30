// Append-only audit event contract. Events are server-generated and must be
// committed in the same transaction as any resulting state change.
import {createHash} from "node:crypto";
const allowed=new Set(["admission_denied","admission_granted","budget_reserved","agent_stopped","approval_requested","approval_granted","execution_failed"]);
export function createAgentAuditEvent({tenantId,agentId,actorId,requestId,type,occurredAt,details={}}){
 for(const x of [tenantId,agentId,actorId,requestId,occurredAt]) if(typeof x!=="string"||!x) throw new TypeError("missing audit identity");
 if(!allowed.has(type)) throw new TypeError("invalid event type");
 if(details===null||typeof details!=="object"||Array.isArray(details)) throw new TypeError("invalid details");
 // Strict allowlist: never serialize credentials, free-form prompts or bank data.
 const safe={};
 for(const key of ["reason","action","costMinor","policyVersion"]) {
   const value=details[key];
   if(typeof value==="string"&&value.length<=128) safe[key]=value;
   else if(Number.isSafeInteger(value)&&value>=0) safe[key]=value;
 }
 const payload={tenantId,agentId,actorId,requestId,type,occurredAt,details:safe};
 return Object.freeze({...payload,digest:createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
