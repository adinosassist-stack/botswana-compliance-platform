/**
 * Local-only, deterministic savings goal planning. No persistence, payments,
 * standing orders, bank settlement or implied availability of funds.
 */
const MAX=Number.MAX_SAFE_INTEGER;
function minor(v,label,{zero=false}={}){
  if(!Number.isSafeInteger(v)||v<0||(!zero&&v===0))throw new TypeError('invalid_'+label);
  return v;
}
function month(v){
  if(typeof v!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)||Number(v.slice(0,4))<2000||Number(v.slice(0,4))>9998)
    throw new TypeError('invalid_start_month');
  return v;
}
function addMonths(v,months){
  const y=Number(v.slice(0,4)),m=Number(v.slice(5,7));
  const total=y*12+(m-1)+months;
  const resultY=Math.floor(total/12),resultM=total%12+1;
  if(resultY>9999)throw new RangeError('goal_date_out_of_range');
  return String(resultY).padStart(4,'0')+'-'+String(resultM).padStart(2,'0');
}
export function planFamilyGoal({name,targetMinor,savedMinor=0,monthlyMinor,startMonth}={}){
  if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw new TypeError('invalid_goal_name');
  minor(targetMinor,'target_minor');
  minor(savedMinor,'saved_minor',{zero:true});
  minor(monthlyMinor,'monthly_minor');
  month(startMonth);
  if(savedMinor>targetMinor)throw new TypeError('saved_exceeds_target');
  const remainingMinor=targetMinor-savedMinor;
  const monthsNeeded=Number((BigInt(remainingMinor)+BigInt(monthlyMinor)-1n)/BigInt(monthlyMinor));
  const achievedMonth=monthsNeeded===0?startMonth:addMonths(startMonth,monthsNeeded-1);
  return Object.freeze({name:name.trim(),currency:'BWP',targetMinor,savedMinor,
    monthlyMinor,remainingMinor,monthsNeeded,achievedMonth,bankVerified:false,
    automaticTransfersEnabled:false});
}
