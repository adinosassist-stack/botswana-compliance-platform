(function installWorkspaceTextLayoutGuard(global){
  "use strict";

  const RELEASE="20261004-workspace-text-layout-v276";
  const STYLE_ID="thebeWorkspaceTextLayoutGuardV276";

  function install(){
    if(document.getElementById(STYLE_ID))return false;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.dataset.release=RELEASE;
    style.textContent=`
/* V276 workspace text/container visibility guard.
   Scope is intentionally limited to workspace information surfaces. */
#mainContent :is(
  .view,
  .simplified-hub,
  .card,
  .hub-card,
  .outcome-card,
  .people-outcome-card,
  .owner-today-card,
  .home-status-chip,
  .proof-summary-card,
  .property-summary-card,
  .property-service-card,
  .owner-command-centre,
  .owner-command-section,
  .owner-command-grid,
  .owner-input-grid,
  .owner-agentic-controls,
  .owner-agentic-control-stage,
  .property-workspace,
  .property-content-flow,
  .property-summary-grid,
  .property-service-grid,
  .property-record-form,
  .market-v257-body,
  .market-v257-stats,
  .outcome-status-strip,
  .outcome-grid,
  .people-status-strip,
  .people-outcome-grid
){min-width:0;max-width:100%;box-sizing:border-box}

#mainContent :is(
  .grid,
  .owner-command-head,
  .owner-command-grid,
  .owner-input-grid,
  .owner-agentic-controls,
  .owner-agentic-control-stage,
  .property-workspace-toolbar,
  .property-summary-grid,
  .property-service-grid,
  .property-service-head,
  .property-lease-head,
  .property-field-actions,
  .market-v257-stats,
  .outcome-status-strip,
  .outcome-grid,
  .people-status-strip,
  .people-outcome-grid
)>*{min-width:0;max-width:100%;box-sizing:border-box}

#mainContent :is(
  .owner-command-centre,
  .property-workspace,
  #peopleops,
  #servicesmarketplace,
  #finance,
  #workhub,
  #evidencehub,
  #dashboard
) :is(
  h1,h2,h3,h4,p,label,small,strong,span,a,
  .muted,
  .owner-command-company,
  .owner-command-copy,
  .owner-today-label,
  .owner-today-value,
  .owner-today-detail,
  .home-signal-card .muted.small,
  .outcome-card-status,
  .people-outcome-status,
  .property-card-title,
  .property-summary-label,
  .property-summary-value,
  .property-description,
  .property-service-meta,
  .property-lease-party,
  .property-note,
  .market-v257-copy,
  .market-v257-stats span,
  .market-v257-signal,
  .proof-summary-label,
  #proofNextDetail
){overflow-wrap:anywhere;word-break:normal;min-width:0;max-width:100%}

/* Remove information-text clipping introduced by compact card line clamps. */
#mainContent .simplified-hub :is(.outcome-card-status,.people-outcome-status),
#mainContent #dashboard .owner-today-detail,
#mainContent #dashboard .home-signal-card .muted.small,
#mainContent #evidencehub #proofNextDetail,
#mainContent #evidencehub .proof-summary-card>span:not(.proof-summary-label):not(.proof-summary-link){
  display:block!important;
  -webkit-line-clamp:unset!important;
  -webkit-box-orient:initial!important;
  overflow:visible!important;
  white-space:normal!important;
  text-overflow:clip!important;
  max-height:none!important;
}

/* Status tiles may grow to their content instead of hiding wrapped copy. */
#mainContent .simplified-hub :is(.outcome-status-chip,.people-status-chip){
  overflow:visible!important;
  height:auto!important;
}

#mainContent :is(
  .owner-command-centre,
  .property-workspace,
  #peopleops,
  #servicesmarketplace,
  #finance
) :is(input,select,textarea){min-width:0;max-width:100%;box-sizing:border-box}

#mainContent :is(
  .owner-command-centre,
  .property-workspace,
  #peopleops,
  #servicesmarketplace,
  #finance
) :is(.btn,button,summary){
  max-width:100%;
  white-space:normal;
  line-height:1.3;
  overflow-wrap:anywhere;
}

#mainContent .market-v257-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
#mainContent .market-v257-stats>div{min-width:0;align-items:flex-start;gap:8px}
#mainContent .market-v257-stats>div>*{min-width:0;max-width:100%;overflow-wrap:anywhere}

@media(max-width:900px){
  #mainContent :is(.owner-command-head,.property-workspace-toolbar,.property-service-head,.property-lease-head){
    flex-wrap:wrap;
    align-items:flex-start;
  }
  #mainContent .market-v257-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
}

@media(max-width:620px){
  #mainContent :is(
    .owner-command-grid,
    .owner-input-grid,
    .owner-agentic-controls,
    .outcome-status-strip,
    .outcome-grid,
    .property-summary-grid,
    .property-service-grid,
    .property-record-form,
    .property-service-dialog-form,
    .people-status-strip,
    .people-outcome-grid,
    .market-v257-stats
  ){
    grid-template-columns:minmax(0,1fr)!important;
  }
  #mainContent :is(.owner-command-head,.property-workspace-toolbar,.property-field-actions,.property-service-head,.property-lease-head){
    gap:8px;
  }
  #mainContent :is(
    .owner-command-centre,
    .property-workspace,
    #peopleops,
    #servicesmarketplace,
    #finance
  ) :is(.btn,button){width:auto;min-width:0}
}
`;
    document.head.append(style);
    document.documentElement.dataset.workspaceTextLayout=RELEASE;
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  global.ThebeWorkspaceTextLayoutGuard=Object.freeze({release:RELEASE,install});
})(window);
