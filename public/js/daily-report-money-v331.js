(()=>{
  "use strict";
  const RELEASE="20261011-report-money-v331";
  const money=(value)=>new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:2}).format(Number(value||0));
  const el=(tag,attrs={},text="")=>{const node=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==="class")node.className=v;else if(k.startsWith("data-"))node.setAttribute(k,v);else node[k]=v}if(text)node.textContent=text;return node};

  async function getDashboard(){
    const date=document.getElementById("opsReportDate")?.value||new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    if(typeof window.apiJson!=="function")throw new Error("Workspace API unavailable");
    return window.apiJson(`/api/daily-reporting/dashboard?date=${encodeURIComponent(date)}`);
  }

  async function getFinanceConnections(){
    if(typeof window.apiJson!=="function")return null;
    try{return await window.apiJson("/api/finance/connections")}catch{return null}
  }

  function ensurePanel(){
    const view=document.getElementById("dailyreports");
    if(!view)return null;
    let panel=view.querySelector('[data-report-money-v331="1"]');
    if(panel)return panel;
    panel=el("section",{class:"card report-money-v331"});
    panel.dataset.reportMoneyV331="1";
    panel.innerHTML=`
      <div class="row between" style="align-items:flex-start;gap:16px">
        <div><div class="kpi">Money from daily reports</div><h2 style="margin:0">Revenue overview</h2><div class="muted small">Reported revenue is operational data from employee daily reports. Bank matching and verification remain separate.</div></div>
        <button type="button" class="btn alt" data-report-money-refresh>Refresh</button>
      </div>
      <div class="grid g3" style="margin-top:14px">
        <div class="metricmini"><div class="kpi">Overall reported revenue</div><div class="score" style="font-size:28px" data-report-money-total>—</div><div class="small muted" data-report-money-date></div></div>
        <div class="metricmini"><div class="kpi">Branches reporting</div><div class="score" style="font-size:28px" data-report-money-branches>—</div><div class="small muted">Location roll-up from submitted reports</div></div>
        <div class="metricmini"><div class="kpi">FNB company account</div><div class="score" style="font-size:18px" data-report-money-fnb>Checking…</div><div class="small muted" data-report-money-fnb-note>Read-only connection; Thebe stores no bank password, PIN or OTP.</div></div>
      </div>
      <div style="margin-top:14px"><div class="kpi">Revenue by branch</div><div data-report-money-list class="grid g2"></div></div>
      <div class="notice" style="margin-top:14px">Reported revenue is not automatically treated as verified accounting revenue. FNB transactions, receipts and reconciliation evidence should confirm it before verification.</div>`;
    const anchor=view.querySelector(".hero,.card");
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(panel,anchor.nextSibling);else view.prepend(panel);
    panel.querySelector("[data-report-money-refresh]")?.addEventListener("click",()=>render(panel));
    return panel;
  }

  function renderBranches(panel,branches,total){
    const host=panel.querySelector("[data-report-money-list]");if(!host)return;
    host.replaceChildren();
    const rows=[...(branches||[])].sort((a,b)=>Number(b.revenue||0)-Number(a.revenue||0));
    if(!rows.length){host.appendChild(el("div",{class:"muted small"},"No branch revenue has been reported for this date."));return}
    for(const branch of rows){
      const revenue=Number(branch.revenue||0),share=total>0?Math.round(revenue/total*100):0,trend=Number(branch?.trend?.revenue||0);
      const card=el("div",{class:"metricmini"});
      card.innerHTML=`<div class="row between"><strong></strong><span class="badge info"></span></div><div style="font-size:24px;font-weight:800;margin-top:8px"></div><div class="small muted" style="margin-top:5px"></div><div class="progress"><span style="width:${Math.max(0,Math.min(100,share))}%"></span></div>`;
      card.querySelector("strong").textContent=branch.name||"Location";
      card.querySelector(".badge").textContent=`${share}% of total`;
      card.children[1].textContent=money(revenue);
      card.children[2].textContent=`${branch.submitted||0} report${Number(branch.submitted||0)===1?"":"s"} · ${trend===0?"No day-on-day change":`${trend>0?"+":""}${money(trend)} vs previous day`}`;
      host.appendChild(card);
    }
  }

  async function render(panel=ensurePanel()){
    if(!panel)return;
    try{
      const [ops,connections]=await Promise.all([getDashboard(),getFinanceConnections()]);
      const total=Number(ops?.totals?.revenue||0);
      panel.querySelector("[data-report-money-total]").textContent=money(total);
      panel.querySelector("[data-report-money-date]").textContent=`Reported for ${ops?.date||"selected date"}`;
      panel.querySelector("[data-report-money-branches]").textContent=String(ops?.locationsReporting||0);
      renderBranches(panel,ops?.branches||[],total);
      const fnbProvider=connections?.providers?.find?.(p=>p.key==="fnb_bw_business");
      const fnbConnection=connections?.items?.find?.(c=>c.providerKey==="fnb_bw_business"||c.provider_key==="fnb_bw_business");
      const fnb=panel.querySelector("[data-report-money-fnb]");
      if(fnbConnection){fnb.textContent=String(fnbConnection.status||"Registered").replaceAll("_"," ");}
      else if(fnbProvider){fnb.textContent="Ready to connect";}
      else fnb.textContent="Not configured";
    }catch(error){
      panel.querySelector("[data-report-money-total]").textContent="Unavailable";
      const host=panel.querySelector("[data-report-money-list]");if(host)host.textContent=String(error?.message||"Could not load revenue roll-up.");
    }
  }

  function mount(){const panel=ensurePanel();if(panel)render(panel);}
  if(typeof window.whenThebeWorkspaceReady==="function")window.whenThebeWorkspaceReady(mount);else if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
  window.ThebeReportMoney=Object.freeze({release:RELEASE,refresh:()=>render(ensurePanel())});
})();
