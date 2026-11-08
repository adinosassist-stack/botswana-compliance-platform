/**
 * Thebe Life: planning-only household budgeting and Botswana Motshelo models.
 * Domain functions are pure and operate on synthetic/validated data.
 * NO custody, money transfer, direct debit, deposit, lending, or live route.
 * Production enablement requires separate authorization, storage, privacy,
 * regulatory and payment-provider reviews.
 */
export const THEBE_LIFE_RELEASE_MODE = "PLANNING_ONLY";
const MONEY_MAX = 999_999_999_999; // P9,999,999,999.99, integer thebe
const fail = code => { throw new TypeError("thebe_life_" + code); };
const nonNegativeInt = (n,max,field) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > max) fail(field + "_invalid");
  return n;
};
const safeSum = values => values.reduce((sum,n) => nonNegativeInt(sum + n,MONEY_MAX,"sum"),0);
const slug = (v,field) => {
  if(typeof v !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)) fail(field + "_invalid");
  return v;
};
const unique = (ids,field) => {
  if(new Set(ids).size !== ids.length) fail(field + "_duplicate");
  return ids;
};

/** Explicit decimal input avoids binary floating-point money errors. */
export function pulaToThebe(input) {
  if(typeof input !== "string" || !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(input))
    fail("amount_invalid");
  const [pula,thebe=""] = input.split(".");
  const total = Number(pula)*100 + Number(thebe.padEnd(2,"0"));
  return nonNegativeInt(total,MONEY_MAX,"amount");
}
export function thebeToPula(input) {
  nonNegativeInt(input,MONEY_MAX,"amount");
  return (Math.floor(input/100)).toString()+"."+(input%100).toString().padStart(2,"0");
}

/**
 * A household never inherits business workspace permissions.
 * Inputs contain no bank credentials, account numbers or child identities.
 * Expenses over a category budget are visible, not silently truncated.
 */
export function householdBudget({income=[],envelopes=[],expenses=[]}={}) {
  if(!Array.isArray(income)||income.length>50||!Array.isArray(envelopes)||envelopes.length>80||
     !Array.isArray(expenses)||expenses.length>5000) fail("budget_limits");
  const earned = safeSum(income.map(row=>{slug(row?.id,"income_id");return pulaToThebe(row.amount);}));
  unique(income.map(row=>row.id),"income_id");
  const ids=unique(envelopes.map(row=>slug(row?.id,"envelope_id")),"envelope_id");
  const planned=envelopes.map(row=>pulaToThebe(row.amount));
  const sums=Object.fromEntries(ids.map(id=>[id,0]));
  for(const row of expenses){
    const id=slug(row?.envelopeId,"expense_envelope");
    if(!Object.hasOwn(sums,id)) fail("unknown_envelope");
    sums[id]=safeSum([sums[id],pulaToThebe(row.amount)]);
  }
  const plannedTotal=safeSum(planned);
  const spentTotal=safeSum(Object.values(sums));
  const rows=ids.map((id,i)=>({
    id,
    budgetThebe:planned[i],
    spentThebe:sums[id],
    remainingThebe:planned[i]-sums[id],
    overBudget:sums[id]>planned[i]
  }));
  return Object.freeze({
    currency:"BWP",
    incomeThebe:earned,
    plannedThebe:plannedTotal,
    spentThebe:spentTotal,
    unallocatedThebe:earned-plannedTotal,
    actualCashMarginThebe:earned-spentTotal,
    exceedsIncome:plannedTotal>earned,
    categories:rows
  });
}
function monthFrom(value) {
  if(typeof value!=="string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) fail("month_invalid");
  const year=Number(value.slice(0,4)),month=Number(value.slice(5));
  if(year<2000||year>2099)fail("month_out_of_range");
  return [year,month];
}
function addMonths(month,offset) {
  const [year,m]=monthFrom(month);
  const d=new Date(Date.UTC(year,m-1+offset,1));
  if(d.getUTCFullYear()>2099)fail("month_out_of_range");
  return String(d.getUTCFullYear()).padStart(4,"0")+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
}
function membersChecked(memberIds) {
  if(!Array.isArray(memberIds)||memberIds.length<2||memberIds.length>100)fail("member_count");
  return unique(memberIds.map(id=>slug(id,"member_id")),"member_id");
}
/** Projection only: a rotation is not evidence of collections or a payable balance. */
export function motsheloRotation({memberIds,monthlyContribution,startMonth,rounds}={}) {
  const members=membersChecked(memberIds);
  monthFrom(startMonth);
  const amount=pulaToThebe(monthlyContribution);
  if(!amount)fail("contribution_zero");
  const count=rounds===undefined?members.length:nonNegativeInt(rounds,120,"rounds");
  if(count<1)fail("rounds_invalid");
  const expectedPool=nonNegativeInt(amount*members.length,MONEY_MAX,"pool");
  return Object.freeze(Array.from({length:count},(_,i)=>({
    round:i+1,
    month:addMonths(startMonth,i),
    recipientMemberId:members[i%members.length],
    expectedPoolThebe:expectedPool,
    status:"PLANNED_NOT_FUNDED"
  })));
}

/**
 * Evaluate **record-only** external settlement readiness.
 * A payer reference is NOT proof of funds. An independently reviewed,
 * non-sensitive external receipt reference is required for each member.
 * Two distinct group officers must approve; this function never pays anyone.
 */
export function motsheloPayoutReview({memberIds,monthlyContribution,recipientMemberId,contributions=[],approvals=[]}={}) {
  const members=membersChecked(memberIds);
  slug(recipientMemberId,"recipient");
  if(!members.includes(recipientMemberId))fail("recipient_not_member");
  if(!Array.isArray(contributions)||contributions.length>members.length||
     !Array.isArray(approvals)||approvals.length>10)fail("proof_limits");
  const amount=pulaToThebe(monthlyContribution);
  if(!amount)fail("contribution_zero");
  const expectedPool=nonNegativeInt(amount*members.length,MONEY_MAX,"pool");
  const byMember=new Map(),seenReceipts=new Set(),issues=[];
  for(const p of contributions){
    const member=slug(p?.memberId,"contributor");
    if(!members.includes(member))fail("contributor_not_member");
    if(byMember.has(member))fail("duplicate_contributor");
    if(p?.amount!==monthlyContribution)issues.push("amount_mismatch:"+member);
    const verified=p?.status==="verified_external" &&
      typeof p.receiptId==="string" && /^[a-zA-Z0-9_-]{8,100}$/.test(p.receiptId) &&
      typeof p.verifiedBy==="string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.verifiedBy) &&
      p.verifiedBy!==member && p.verifiedBy!==p.recordedBy;
    if(!verified)issues.push("independent_receipt_missing:"+member);
    if(verified){
      if(seenReceipts.has(p.receiptId))issues.push("reused_receipt");
      seenReceipts.add(p.receiptId);
    }
    byMember.set(member,verified && p.amount===monthlyContribution);
  }
  for(const member of members)if(!byMember.has(member))issues.push("contribution_missing:"+member);
  const officers=new Map();
  for(const a of approvals){
    if(!["chair","treasurer"].includes(a?.role))fail("officer_role");
    slug(a?.actorId,"officer_id");
    if(officers.has(a.role))fail("duplicate_officer_approval");
    if(a?.approved===true)officers.set(a.role,a.actorId);
  }
  if(!officers.has("chair")||!officers.has("treasurer")||officers.get("chair")===officers.get("treasurer"))
    issues.push("two_distinct_officers_required");
  const verifiedMemberCount=[...byMember.values()].filter(Boolean).length;
  const ready=issues.length===0 && verifiedMemberCount===members.length;
  return Object.freeze({
    currency:"BWP",
    expectedPoolThebe:expectedPool,
    verifiedMemberCount,
    totalMemberCount:members.length,
    status:ready?"READY_TO_RECORD_EXTERNAL_PAYOUT":"BLOCKED",
    mayExecutePayment:false,
    reasons:Object.freeze(issues)
  });
}
