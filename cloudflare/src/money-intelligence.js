export const MONEY_INTELLIGENCE_VERSION="2026-09-26.v1";
const frozen=value=>Object.freeze(value);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const clean=(value,max=180)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const dayMs=86400000;
function dateOnly(value){return String(value||"").slice(0,10)}
function startOfDay(date){const ms=Date.parse(`${dateOnly(date)}T00:00:00Z`);return Number.isFinite(ms)?ms:null}
function pctChange(current,prior){if(prior<=0)return current>0?null:0;return (current-prior)/prior}
function summarizeTransactions(rows,businessDate){
  const anchor=startOfDay(businessDate);
  const periods={current30:{inflow:0,outflow:0,count:0},prior30:{inflow:0,outflow:0,count:0}};
  const currentDebits=[];
  for(const row of rows||[]){
    const posted=startOfDay(row?.posted_on);if(anchor==null||posted==null)continue;
    const age=Math.floor((anchor-posted)/dayMs),amount=number(row?.amount_minor);
    let bucket=null;if(age>=0&&age<30)bucket=periods.current30;else if(age>=30&&age<60)bucket=periods.prior30;
    if(!bucket)continue;
    bucket.count++;
    if(amount>0)bucket.inflow+=amount;
    else if(amount<0){bucket.outflow+=Math.abs(amount);if(age<30)currentDebits.push({id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),reference:clean(row?.reference,80),amountMinor:amount})}
  }
  const avgDebit=currentDebits.length?currentDebits.reduce((sum,row)=>sum+Math.abs(row.amountMinor),0)/currentDebits.length:0;
  const threshold=Math.max(500000,Math.round(avgDebit*2.5));
  const largeDebits=currentDebits.filter(row=>Math.abs(row.amountMinor)>=threshold).sort((a,b)=>Math.abs(b.amountMinor)-Math.abs(a.amountMinor)).slice(0,5);
  return frozen({
    current30:frozen({...periods.current30,net:periods.current30.inflow-periods.current30.outflow}),
    prior30:frozen({...periods.prior30,net:periods.prior30.inflow-periods.prior30.outflow}),
    outflowChangePct:pctChange(periods.current30.outflow,periods.prior30.outflow),
    inflowChangePct:pctChange(periods.current30.inflow,periods.prior30.inflow),
    largeDebitThresholdMinor:threshold,
    largeDebits:frozen(largeDebits.map(frozen))
  });
}
function assumptionMetrics({cashPositionMinor=0,memory={}}={}){
  const assumptions=memory?.assumptions||{};
  const monthlyOutflowsBwp=Number(assumptions.monthlyCashOutflowsBwp);
  const minBufferBwp=Number(assumptions.minimumCashBufferBwp);
  const monthlyOutflowsMinor=Number.isFinite(monthlyOutflowsBwp)&&monthlyOutflowsBwp>0?Math.round(monthlyOutflowsBwp*100):null;
  const minBufferMinor=Number.isFinite(minBufferBwp)&&minBufferBwp>=0?Math.round(minBufferBwp*100):null;
  const runwayDays=monthlyOutflowsMinor?Math.max(0,(Number(cashPositionMinor||0)/monthlyOutflowsMinor)*30):null;
  const safeDiscretionaryMinor=minBufferMinor==null?null:Math.max(0,Number(cashPositionMinor||0)-minBufferMinor);
  return frozen({
    monthlyOutflowsMinor,
    minimumCashBufferMinor:minBufferMinor,
    estimatedRunwayDays:runwayDays==null?null:Math.round(runwayDays*10)/10,
    safeDiscretionaryMinor,
    basis:"owner_entered_assumptions",
    authoritative:false
  });
}
export async function buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor=0,memory={}}={}){
  if(!env?.DB||!tenantId||!businessDate)return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  let aggregate;
  try{
    aggregate=await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor>0 THEN amount_minor ELSE 0 END),0) current_inflow,
      COALESCE(SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor<0 THEN ABS(amount_minor) ELSE 0 END),0) current_outflow,
      SUM(CASE WHEN posted_on>=date(?,'-29 days') THEN 1 ELSE 0 END) current_count,
      SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor<0 THEN 1 ELSE 0 END) current_debit_count,
      COALESCE(SUM(CASE WHEN posted_on<date(?,'-29 days') AND amount_minor>0 THEN amount_minor ELSE 0 END),0) prior_inflow,
      COALESCE(SUM(CASE WHEN posted_on<date(?,'-29 days') AND amount_minor<0 THEN ABS(amount_minor) ELSE 0 END),0) prior_outflow,
      SUM(CASE WHEN posted_on<date(?,'-29 days') THEN 1 ELSE 0 END) prior_count
      FROM finance_transactions
      WHERE tenant_id=? AND posted_on>=date(?,'-59 days') AND posted_on<=date(?)`)
      .bind(businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,tenantId,businessDate,businessDate).first();
  }catch{
    return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  }
  const currentInflow=number(aggregate?.current_inflow),currentOutflow=number(aggregate?.current_outflow);
  const priorInflow=number(aggregate?.prior_inflow),priorOutflow=number(aggregate?.prior_outflow);
  const debitCount=Math.max(0,number(aggregate?.current_debit_count));
  const avgDebit=debitCount?currentOutflow/debitCount:0;
  const threshold=Math.max(500000,Math.round(avgDebit*2.5));
  let largeDebits=[];
  try{
    const result=await env.DB.prepare(`SELECT id,posted_on,description,reference,amount_minor
      FROM finance_transactions
      WHERE tenant_id=? AND posted_on>=date(?,'-29 days') AND posted_on<=date(?)
        AND amount_minor<0 AND ABS(amount_minor)>=?
      ORDER BY ABS(amount_minor) DESC,posted_on DESC,id DESC LIMIT 5`)
      .bind(tenantId,businessDate,businessDate,threshold).all();
    largeDebits=(result.results||[]).map(row=>frozen({
      id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),
      reference:clean(row?.reference,80),amountMinor:number(row?.amount_minor)
    }));
  }catch{
    return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  }
  const trend=frozen({
    current30:frozen({inflow:currentInflow,outflow:currentOutflow,count:number(aggregate?.current_count),net:currentInflow-currentOutflow}),
    prior30:frozen({inflow:priorInflow,outflow:priorOutflow,count:number(aggregate?.prior_count),net:priorInflow-priorOutflow}),
    outflowChangePct:pctChange(currentOutflow,priorOutflow),
    inflowChangePct:pctChange(currentInflow,priorInflow),
    largeDebitThresholdMinor:threshold,
    largeDebits:frozen(largeDebits)
  });
  const assumptions=assumptionMetrics({cashPositionMinor,memory});
  const signals=[];
  if(trend.outflowChangePct!=null&&trend.outflowChangePct>=0.25)signals.push(frozen({key:"outflow_acceleration",severity:"medium",detail:`Recorded 30-day outflows are ${Math.round(trend.outflowChangePct*100)}% above the previous 30-day period.`,source:"finance_transactions"}));
  if(trend.largeDebits.length)signals.push(frozen({key:"large_debits",severity:"medium",detail:`${trend.largeDebits.length} recent debit(s) exceed the deterministic large-debit threshold.`,source:"finance_transactions"}));
  if(assumptions.estimatedRunwayDays!=null&&assumptions.estimatedRunwayDays<45)signals.push(frozen({key:"cash_runway",severity:"high",detail:`Estimated runway is ${assumptions.estimatedRunwayDays} days using owner-entered monthly outflows.`,source:"owner_entered_assumptions"}));
  return frozen({
    version:MONEY_INTELLIGENCE_VERSION,
    available:true,
    businessDate,
    currency:"BWP",
    trend,
    assumptions,
    signals:frozen(signals),
    authority:frozen({readOnly:true,executionAllowed:false,forecast:false,financialAdvice:false})
  });
}
export const __moneyIntelligenceTest=frozen({summarizeTransactions,assumptionMetrics,pctChange});
