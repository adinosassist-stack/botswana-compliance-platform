(()=>{
  "use strict";
  const RELEASE="20261011-reporter-money-v331";
  const num=id=>Math.max(0,Number(document.getElementById(id)?.value||0)||0);
  const el=(tag,attrs={},text="")=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==="class")node.className=value;
      else if(key==="style")node.setAttribute("style",value);
      else if(key.startsWith("data-"))node.setAttribute(key,value);
      else node[key]=value;
    }
    if(text)node.textContent=text;
    return node;
  };
  function money(value){return new Intl.NumberFormat("en-BW",{style:"currency",currency:"BWP",maximumFractionDigits:2}).format(Number(value||0))}
  function field(id,label){
    const wrap=el("div");
    const labelNode=el("label",{htmlFor:id},label);
    const input=el("input",{id,type:"number",min:"0",step:"0.01",placeholder:"0.00"});
    wrap.append(labelNode,input);
    return wrap;
  }
  function ensure(){
    const form=document.getElementById("reporterDailyForm"),total=document.getElementById("reporterRevenue");
    if(!form||!total||form.querySelector('[data-reporter-money-v331="1"]'))return;
    const block=el("div",{class:"reporter-money-v331","data-reporter-money-v331":"1"});
    const shell=el("div",{style:"margin-top:14px;padding:14px;border:1px solid #dfe3e6;border-radius:14px;background:#fafbfb"});
    const eyebrow=el("div",{class:"section-eyebrow"},"Money update");
    const intro=el("div",{class:"muted small",style:"margin-bottom:10px"},"Break down today’s reported revenue. The total below feeds the existing Daily Reports revenue figure.");
    const grid=el("div",{class:"reporter-kpis"});
    grid.append(
      field("reporterCashSales","Cash sales (P)"),
      field("reporterDigitalSales","Card / mobile money (P)"),
      field("reporterDeposits","Customer deposits (P)")
    );
    const totalWrap=el("div");
    totalWrap.append(
      el("label",{},"Reported total"),
      el("div",{style:"min-height:42px;padding:10px 11px;border:1px solid #d7dbde;border-radius:10px;background:#fff;font-weight:800","data-reporter-money-total":"1"},"P0.00")
    );
    grid.appendChild(totalWrap);
    const note=el("div",{class:"small muted",style:"margin-top:8px"},"This is reported operational revenue, not automatically verified accounting revenue.");
    shell.append(eyebrow,intro,grid,note);
    block.appendChild(shell);
    const kpiBlock=total.closest(".reporter-kpis");
    if(kpiBlock)kpiBlock.insertAdjacentElement("afterend",block);else form.appendChild(block);
    const original=total.closest("div");if(original)original.style.display="none";
    const sync=()=>{const value=num("reporterCashSales")+num("reporterDigitalSales")+num("reporterDeposits");total.value=value.toFixed(2);block.querySelector("[data-reporter-money-total]").textContent=money(value)};
    for(const id of ["reporterCashSales","reporterDigitalSales","reporterDeposits"])document.getElementById(id)?.addEventListener("input",sync);
    sync();
  }
  function mount(){ensure();if(!document.getElementById("reporterDailyForm")&&typeof MutationObserver==="function"){const observer=new MutationObserver(()=>{if(document.getElementById("reporterDailyForm")){ensure();observer.disconnect()}});observer.observe(document.documentElement,{childList:true,subtree:true});}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
  window.ThebeReporterMoney=Object.freeze({release:RELEASE});
})();
