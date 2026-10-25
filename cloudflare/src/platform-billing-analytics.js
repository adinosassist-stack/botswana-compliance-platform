// Read-only analytics for the platform's manual-bank subscription operation.
export async function platformBillingAnalytics(db,{months=6,now=new Date()}={}){
  if(![3,6,12].includes(months))throw new Error('invalid_analytics_period');
  const asOf=now.toISOString(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1,1)).toISOString();
  const paid=await db.prepare(`SELECT strftime('%Y-%m',o.paid_at) month,
    SUM(CAST(ROUND(o.amount_bwp*100) AS INTEGER)) amount_minor,COUNT(*) payments
    FROM payment_orders o WHERE o.provider='manual_bank' AND o.order_type='subscription' AND o.status='paid'
    AND datetime(o.paid_at)>=datetime(?) AND datetime(o.paid_at)<=datetime(?)
    AND EXISTS(SELECT 1 FROM payment_fulfillments f WHERE f.payment_order_id=o.id AND f.tenant_id=o.tenant_id AND f.fulfillment_status='applied')
    GROUP BY month ORDER BY month`).bind(start,asOf).all();
  const byMonth=new Map((paid.results||[]).map(row=>[row.month,row]));
  const receipts=Array.from({length:months},(_,i)=>{
    const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1+i,1)).toISOString().slice(0,7),row=byMonth.get(month);
    return {month,amountBwp:Number(row?.amount_minor||0)/100,payments:Number(row?.payments||0)};
  });
  const states=await db.prepare(`SELECT CASE
    WHEN s.status='paused' THEN 'paused'
    WHEN s.status='active' AND datetime(s.current_period_ends_at)>datetime(?) THEN 'active'
    WHEN s.status IN ('active','expired','past_due') AND datetime(s.current_period_ends_at)<=datetime(?) THEN 'expired'
    ELSE 'inactive' END state,COUNT(*) count
    FROM subscriptions s WHERE s.provider='manual_bank' GROUP BY state`).bind(asOf,asOf).all();
  const status={active:0,paused:0,expired:0,inactive:0};for(const row of states.results||[])status[row.state]=Number(row.count);
  const plans=await db.prepare(`SELECT lower(s.plan) plan,COUNT(*) clients FROM subscriptions s WHERE s.provider='manual_bank'
    AND s.status='active' AND datetime(s.current_period_ends_at)>datetime(?) GROUP BY lower(s.plan) ORDER BY clients DESC,plan`).bind(asOf).all();
  const pending=await db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(CAST(ROUND(o.amount_bwp*100) AS INTEGER)),0) amount_minor,
    SUM(CASE WHEN datetime(m.submitted_at)<=datetime(?,'-48 hours') THEN 1 ELSE 0 END) overdue
    FROM manual_payment_submissions m JOIN payment_orders o ON o.id=m.payment_order_id AND o.tenant_id=m.tenant_id
    WHERE m.status IN ('submitted','reviewing') AND o.provider='manual_bank' AND o.order_type='subscription' AND o.status IN ('pending','processing','failed')`).bind(asOf).first();
  const renewalCount=await db.prepare(`SELECT COUNT(*) count FROM subscriptions WHERE provider='manual_bank' AND status IN ('active','paused')
    AND datetime(current_period_ends_at)>datetime(?) AND datetime(current_period_ends_at)<=datetime(?,'+7 days')`).bind(asOf,asOf).first();
  const renewals=await db.prepare(`SELECT t.name tenant_name,s.current_period_ends_at,s.status FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
    WHERE s.provider='manual_bank' AND s.status IN ('active','paused') AND datetime(s.current_period_ends_at)>datetime(?)
    AND datetime(s.current_period_ends_at)<=datetime(?,'+7 days') ORDER BY datetime(s.current_period_ends_at),s.tenant_id LIMIT 8`).bind(asOf,asOf).all();
  const paymentEvents=await db.prepare(`SELECT t.name tenant_name,e.event_type action,e.created_at occurred_at FROM manual_payment_events e
    JOIN tenants t ON t.id=e.tenant_id WHERE e.event_type IN ('submitted','rejected','approved_and_activated') AND datetime(e.created_at)<=datetime(?)
    ORDER BY datetime(e.created_at) DESC,e.id DESC LIMIT 8`).bind(asOf).all();
  const accessEvents=await db.prepare(`SELECT t.name tenant_name,CASE WHEN json_extract(e.event_data,'$.to')='paused' THEN 'paused' ELSE 'resumed' END action,e.occurred_at
    FROM audit_events e JOIN tenants t ON t.id=e.tenant_id WHERE e.event_type='SUBSCRIPTION_ACCESS_CHANGED' AND json_valid(e.event_data)
    AND json_extract(e.event_data,'$.to') IN ('paused','active') AND datetime(e.occurred_at)<=datetime(?) ORDER BY datetime(e.occurred_at) DESC,e.id DESC LIMIT 8`).bind(asOf).all();
  const dateMs=value=>{const text=String(value||'').replace(' ','T');return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(text)?text:text+'Z')};
  const activity=[...(paymentEvents.results||[]),...(accessEvents.results||[])].sort((a,b)=>dateMs(b.occurred_at)-dateMs(a.occurred_at)).slice(0,8);
  return {asOf,months,currency:'BWP',scope:'manual_bank_subscriptions',receipts,totalReceiptsBwp:receipts.reduce((sum,row)=>sum+Math.round(row.amountBwp*100),0)/100,
    status,plans:plans.results||[],pending:{count:Number(pending?.count||0),amountBwp:Number(pending?.amount_minor||0)/100,overdue:Number(pending?.overdue||0)},
    renewals:{count:Number(renewalCount?.count||0),items:renewals.results||[]},activity};
}
