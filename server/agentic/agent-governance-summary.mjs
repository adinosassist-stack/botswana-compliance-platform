// Pure owner-facing projection. Input MUST already be loaded from a server-side,
// tenant-scoped repository after authorization. This function never queries storage.
export function buildAgentGovernanceSummary({tenantId,policies=[],reservations=[]}) {
 if(typeof tenantId!=="string"||!tenantId) throw new TypeError("tenantId required");
 const selected=policies.filter(p=>p?.tenantId===tenantId);
 const cards=selected.map(p=>{
   const budget=Number.isSafeInteger(p.budgetMinor)&&p.budgetMinor>=0?p.budgetMinor:0;
   const spent=Number.isSafeInteger(p.spentMinor)&&p.spentMinor>=0?p.spentMinor:0;
   return Object.freeze({
     agentId:String(p.agentId??""),
     status:p.enabled===true&&p.stopped!==true?"enabled":"stopped",
     budgetMinor:budget,
     spentMinor:spent,
     remainingMinor:Math.max(0,budget-spent),
     reservationCount:reservations.filter(r=>r?.tenantId===tenantId&&r.agentId===p.agentId).length
   });
 });
 return Object.freeze({
   tenantId,
   totalAgents:cards.length,
   stoppedAgents:cards.filter(c=>c.status==="stopped").length,
   totalBudgetMinor:cards.reduce((n,c)=>n+c.budgetMinor,0),
   totalSpentMinor:cards.reduce((n,c)=>n+c.spentMinor,0),
   agents:cards
 });
}
// Do not render this projection for another tenant or trust client-supplied rows.
