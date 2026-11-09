/**
 * Offline planning only. Values are BWP minor units (thebe).
 * Not a ledger, bank balance, payment instruction, or settlement proof.
 */
const money=(value,label)=>{
  if(!Number.isSafeInteger(value)||value<0) throw new RangeError('invalid_'+label);
  return value;
};
const add=(a,b)=>{
  const result=a+b;
  if(!Number.isSafeInteger(result)) throw new RangeError('budget_overflow');
  return result;
};
const categoryId=(id)=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(id);
export function planHouseholdBudget({incomeMinor,commitmentsMinor=0,envelopes=[]}={}){
  money(incomeMinor,'income');
  money(commitmentsMinor,'commitments');
  if(!Array.isArray(envelopes)||envelopes.length>40) throw new TypeError('invalid_envelopes');
  const seen=new Set();
  let allocatedMinor=0,spentMinor=0;
  const lines=envelopes.map((item)=>{
    if(!item||!categoryId(item.id)||seen.has(item.id)) throw new TypeError('invalid_or_duplicate_envelope');
    seen.add(item.id);
    const plannedMinor=money(item.plannedMinor,'planned');
    const usedMinor=money(item.spentMinor??0,'spent');
    allocatedMinor=add(allocatedMinor,plannedMinor);
    spentMinor=add(spentMinor,usedMinor);
    return Object.freeze({
      id:item.id,plannedMinor,spentMinor:usedMinor,
      remainingMinor:plannedMinor-usedMinor,
      overBudget:usedMinor>plannedMinor
    });
  });
  const obligatedMinor=add(commitmentsMinor,allocatedMinor);
  const unallocatedMinor=incomeMinor-obligatedMinor;
  const cashPlanRemainingMinor=incomeMinor-add(commitmentsMinor,spentMinor);
  return Object.freeze({
    currency:'BWP',incomeMinor,commitmentsMinor,allocatedMinor,spentMinor,
    unallocatedMinor,cashPlanRemainingMinor,
    overAllocated:unallocatedMinor<0,
    categories:Object.freeze(lines),
    bankVerified:false,paymentsEnabled:false,planningOnly:true
  });
}
