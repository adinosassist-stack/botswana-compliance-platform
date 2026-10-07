/* Presentation of existing, role-filtered workspace data. No API reads or writes. */
(()=>{
  'use strict';
  const groups={
    workhub:['workOpenActions','workWaitingReviews'],
    tenderhub:['tenderHubTracked','tenderHubClosingSoon'],
    automationhub:['automationWorkflowCount','automationScheduleCount','automationQueuedCount'],
    servicesmarketplace:['serviceOpenOrders','serviceInReview','serviceCompleted']
  };
  const roots=['workhub','businesshub','evidencehub','tenderhub','automationhub','moneyhub','protecthub','sites','servicesmarketplace'];
  let queued=false;
  const count=text=>{const raw=text.trim();if(!/^\d+(?:,\d{3})*$/.test(raw))return null;const value=Number(raw.replaceAll(',',''));return Number.isSafeInteger(value)?value:null};
  function render(){
    queued=false;
    const property=document.getElementById('propertyintelligence');
    if(property?.classList.contains('active')){
      const ring=property.querySelector('.property-ops-ring-v262');
      const raw=ring?.querySelector('strong')?.textContent.trim()||'';
      if(ring&&/^\d+(?:\.\d+)?%$/.test(raw)){
        let chart=ring.querySelector('.workspace-info-ring-v309');
        if(!chart){
          chart=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.setAttribute('class','workspace-info-ring-v309');chart.setAttribute('viewBox','0 0 100 100');chart.setAttribute('aria-hidden','true');chart.setAttribute('focusable','false');
          for(const kind of ['track','value']){const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');for(const [key,value] of Object.entries({cx:50,cy:50,r:44,pathLength:100,class:kind}))circle.setAttribute(key,value);chart.append(circle)}
          ring.prepend(chart);
        }
        const dash=`${Math.min(100,Math.max(0,Number(raw.slice(0,-1))))} 100`;
        if(chart.lastChild.getAttribute('stroke-dasharray')!==dash)chart.lastChild.setAttribute('stroke-dasharray',dash);
      }
    }
    for(const id of roots){
      const root=document.getElementById(id);
      if(!root?.classList.contains('active'))continue;
      if(!root.classList.contains('workspace-infographic-v309'))root.classList.add('workspace-infographic-v309');
      for(const strip of root.querySelectorAll('.outcome-status-strip,.business-status-strip')){
        if(!strip.classList.contains('workspace-info-grid-v309'))strip.classList.add('workspace-info-grid-v309');
        for(const card of strip.children){
          if(card.classList.contains('workspace-info-card-v309'))continue;
          card.classList.add('workspace-info-card-v309');
          const label=document.createElement('span');label.className='workspace-info-label-v309';
          for(const node of [...card.childNodes])if(node.nodeType===3)label.append(node);
          card.append(label);
        }
      }
      const symbols={workhub:'M5 4h14v16H5z M8 9h8 M8 13h8 M8 17h5',businesshub:'M4 20V7h16v13 M9 7V4h6v3 M8 11h2 M14 11h2 M8 15h2 M14 15h2',evidencehub:'M6 3h9l4 4v14H6z M14 3v5h5 M9 13l2 2 5-5',tenderhub:'M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16',automationhub:'M12 3v3 M5 7h14v13H5z M8 11h1 M15 11h1 M9 16h6',moneyhub:'M3 6h18v12H3z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',protecthub:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',sites:'M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7 M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6',servicesmarketplace:'M4 4h16l2 6H2z M4 10v11h16V10 M8 14h8'};
      for(const card of root.querySelectorAll('.workspace-info-card-v309,.proof-summary-card,.money-v307-stat,.protect-v308-stat,.sites-kpi,.market-v257-stats>div')){
        if(card.querySelector('.workspace-info-icon-v309'))continue;
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('class','workspace-info-icon-v309');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',symbols[id]);icon.append(path);card.prepend(icon);
      }
      const ids=groups[id];if(!ids)continue;
      const values=ids.map(key=>{
        const el=document.getElementById(key);
        return el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el.parentElement).display!=='none'&&!el.parentElement.hidden?count(el.textContent):null;
      });
      const max=Math.max(0,...values.filter(value=>value!==null));
      ids.forEach((key,index)=>{
        const el=document.getElementById(key);if(!el)return;
        const card=el.parentElement;
        let bar=card.querySelector('.workspace-info-bar-v309');
        if(!bar){bar=document.createElement('span');bar.className='workspace-info-bar-v309';bar.setAttribute('aria-hidden','true');bar.append(document.createElement('span'));card.append(bar)}
        const unavailable=values[index]===null;
        if(bar.hidden!==unavailable)bar.hidden=unavailable;
        const width=`${max&&values[index]!==null?values[index]/max*100:0}%`;
        if(bar.firstChild.style.width!==width)bar.firstChild.style.width=width;
      });
      const strip=root.querySelector('.outcome-status-strip,.market-v257-stats');
      if(strip&&!strip.nextElementSibling?.classList.contains('workspace-info-scale-v309')){
        const caption=document.createElement('p');caption.className='workspace-info-scale-v309';
        caption.textContent='Count bars share a scale; the largest visible count fills the bar.';strip.after(caption);
      }
    }
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(render)}
  function install(){
    const main=document.getElementById('mainContent');if(!main)return;
    render();
    const observer=new MutationObserver(records=>{
      if(records.some(record=>{
        const el=record.target.nodeType===3?record.target.parentElement:record.target;
        if(el?.closest?.('.workspace-info-bar-v309,.workspace-info-scale-v309,.workspace-info-icon-v309,.workspace-info-ring-v309'))return false;
        return roots.some(id=>el?.id===id)||el?.id==='propertyintelligence'||el?.closest?.('.property-ops-ring-v262')||el?.closest?.('.outcome-status-chip,.business-status-chip,.market-v257-stats')||[...record.addedNodes].some(node=>node.nodeType===1&&node.matches?.('.view,.outcome-status-strip,.business-status-strip,.money-v307-status-grid,.protect-v308-status-grid'));
      }))schedule();
    });
    observer.observe(main,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style']});
    window.addEventListener('thebe:workspace-view-change',schedule);
    window.ThebeWorkspaceInfographicsV309=Object.freeze({render,release:'20261007-workspace-infographics-v309'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
