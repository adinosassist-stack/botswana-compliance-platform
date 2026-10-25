(function(global){
  'use strict';
  let generation=0;
  const byId=id=>document.getElementById(id);
  const money=value=>new Intl.NumberFormat('en-BW',{style:'currency',currency:'BWP',maximumFractionDigits:2}).format(Number(value)||0);
  const monthLabel=value=>new Date(value+'-01T00:00:00Z').toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'});
  const names={active:'Active',paused:'Paused',expired:'Needs renewal',inactive:'Inactive'};
  const planNames={starter:'Monitor',business:'Protect',pro:'Control',network:'Network'};
  async function refresh(options){
    const call=++generation,user=options.user,root=byId('platformBillingInsights'),status=byId('platformBillingChartStatus'),charts=byId('platformBillingCharts');
    if(!root||!status||!charts)return;
    if(user?.platformBillingAdmin!==true||!options.allowed){root.hidden=true;charts.textContent='';return}
    root.hidden=false;status.textContent='Loading billing insights…';charts.textContent='';
    const months=Number(byId('platformBillingMonths')?.value||6),escape=options.escape;
    try{
      const data=await options.request('/api/platform/billing/analytics?months='+months);
      if(call!==generation||!options.isCurrent(user))return;
      const rows=data.receipts||[],maximum=Math.max(0,...rows.map(row=>Number(row.amountBwp)||0));
      const bars=rows.map(row=>`<div class="billing-chart-column"><span class="billing-chart-value">${escape(money(row.amountBwp))}</span><div class="billing-chart-plot"><div class="billing-chart-bar" style="height:${maximum?Math.max(0,Number(row.amountBwp))/maximum*100:0}%" aria-hidden="true"></div></div><span>${escape(monthLabel(row.month))}</span></div>`).join('');
      const states=['active','paused','expired','inactive'],total=states.reduce((sum,key)=>sum+Number(data.status?.[key]||0),0);
      let angle=0;const arcs=states.slice(0,3).map(key=>{angle+=total?Number(data.status?.[key]||0)/total*360:0;return angle});
      const ring=total?`<div class="billing-status-ring" style="--active:${arcs[0]}deg;--paused:${arcs[1]}deg;--expired:${arcs[2]}deg" aria-hidden="true"><div><b>${total}</b><span>clients</span></div></div>`:'<div class="billing-status-ring billing-empty-ring"><div><b>0</b><span>clients</span></div></div>';
      const planTotal=(data.plans||[]).reduce((sum,row)=>sum+Number(row.clients||0),0);
      const mix=(data.plans||[]).map(row=>`<div class="billing-plan-row"><div><b>${escape(planNames[row.plan]||row.plan)}</b><span>${Number(row.clients)||0} clients</span></div><div class="billing-plan-track"><div style="width:${planTotal?Number(row.clients)/planTotal*100:0}%"></div></div></div>`).join('')||'<p class="muted">No active paid plans yet.</p>';
      const renewals=(data.renewals?.items||[]).map(row=>`<li><b>${escape(row.tenant_name)}</b><span>${escape(String(row.current_period_ends_at).slice(0,10))} · ${escape(row.status)}</span></li>`).join('')||'<li>No paid periods end in the next seven days.</li>';
      const actions={submitted:'Payment submitted',rejected:'Payment rejected',approved_and_activated:'Payment verified and activated',paused:'Subscription paused',resumed:'Subscription resumed'};
      const activity=(data.activity||[]).map(row=>`<li><span class="billing-activity-dot" aria-hidden="true"></span><div><b>${escape(actions[row.action]||'Subscription updated')}</b><span>${escape(row.tenant_name)} · ${escape(String(row.occurred_at))} UTC</span></div></li>`).join('')||'<li>No recorded payment or subscription activity yet.</li>';
      charts.safeHTML=`<div class="billing-insight-totals"><div><span>Verified receipts · ${months} months</span><b>${escape(money(data.totalReceiptsBwp))}</b></div><div><span>Unverified transfers</span><b>${escape(money(data.pending?.amountBwp))}</b></div><button type="button" data-bw-onclick="jumpPlatformBillingSection('manualPaymentAdminCard')"><span>Waiting over 48 hours</span><b>${Number(data.pending?.overdue)||0}</b><span>Review payments →</span></button></div>
        <div class="billing-insights-grid"><article class="card"><h2>Verified subscription receipts</h2><p class="muted small">Calendar months in UTC; current month to date. Orders marked refunded are excluded.</p><div class="billing-receipts-chart" role="group" aria-label="Monthly verified subscription receipts">${bars}</div>${maximum?'':'<p class="muted small">No verified receipts in this period.</p>'}<details><summary>View exact figures</summary><table class="billing-figures"><thead><tr><th scope="col">Month</th><th scope="col">BWP</th><th scope="col">Payments</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${escape(row.month)}</th><td>${escape(money(row.amountBwp))}</td><td>${Number(row.payments)||0}</td></tr>`).join('')}</tbody></table></details></article>
        <article class="card"><h2>Subscription health</h2><div class="billing-status-content">${ring}<ul class="billing-status-legend">${states.map(key=>`<li><span class="billing-status-dot billing-status-${key}" aria-hidden="true"></span>${names[key]}<b>${Number(data.status?.[key])||0}</b></li>`).join('')}</ul></div><p class="muted small">Manual-bank clients. Paused clients stay in Paused even after their paid period ends.</p></article>
        <article class="card"><h2>Active plan mix</h2>${mix}</article><article class="card"><div class="between row"><h2>Renewals in seven days</h2><b>${Number(data.renewals?.count)||0}</b></div><ul class="billing-renewals">${renewals}</ul><button type="button" class="btn alt" data-bw-onclick="showPlatformRenewals()">Open subscriptions</button></article></div>
        <article class="card billing-activity-card"><h2>Recent activity</h2><ul class="billing-activity">${activity}</ul></article>`;
      status.textContent='Updated '+new Date(data.asOf).toLocaleString()+'. Paid orders only; figures are not bank balance or recognised revenue.';
    }catch(error){
      if(call!==generation||!options.isCurrent(user))return;
      charts.textContent='';status.textContent='Billing insights could not be loaded. Select Refresh dashboard to retry. Payment controls remain available.';
    }
  }
  global.BW=global.BW||{};global.BW.billingInsights={refresh};
})(window);
