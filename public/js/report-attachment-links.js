(()=>{
  'use strict';
  function install(){
    const original=window.renderOpsReports;
    if(typeof original!=='function'||original.reportAttachmentLinks)return;
    function render(items){
      const result=original.apply(this,arguments);
      const cards=document.querySelectorAll('#opsReportsList .ops-report-card');
      for(const [index,report] of (Array.isArray(items)?items:[]).entries()){
        const card=cards[index];if(!card)continue;
        if(report.attachmentsState==='unavailable'){
          const notice=document.createElement('p');notice.className='muted small';notice.textContent='Attachments are temporarily unavailable. Refresh to try again.';card.appendChild(notice);continue;
        }
        const links=document.createElement('div');links.className='row';
        for(const file of (Array.isArray(report.attachments)?report.attachments:[])){
          let url;try{url=new URL(file.download_url,location.origin)}catch{continue}
          const expected='/api/daily-reporting/attachments/'+encodeURIComponent(String(report.id))+'/'+encodeURIComponent(String(file.id));
          if(url.origin!==location.origin||url.pathname!==expected)continue;
          const link=document.createElement('a');link.className='btn alt small';link.href=url.pathname+url.search;link.textContent='Download '+String(file.name||'attachment');link.setAttribute('download','');links.appendChild(link);
        }
        if(links.childElementCount)card.appendChild(links);
      }
      return result;
    }
    render.reportAttachmentLinks=true;window.renderOpsReports=render;
  }
  install();window.whenThebeWorkspaceReady?.(install);
})();
