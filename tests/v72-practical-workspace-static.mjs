import fs from "node:fs";
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const must=[
  'id="v72-practical-workspace-layout"','id="workspaceQuickbar"','id="workspacePulseActions"','id="workspacePulseAlerts"','id="workspacePulseSetup"',
  'stabilizeWorkspaceTables','renderWorkspacePulse','class="workspace-action"','Open workflow hub','Run compliance scan','Guided setup',
  'grid-template-columns:minmax(220px,1fr) minmax(0,auto)','flex-wrap:wrap!important','table-scroll'
];
for(const x of must){if(!html.includes(x))throw new Error(`v72 workspace contract missing: ${x}`)}
for(const view of ['businessevents','employees','obligations','calendar','workflowhub']){if(!html.includes(`id="${view}" class="view`))throw new Error(`quick-work target missing: ${view}`)}
if(!html.includes("data-bw-onclick=\"openAddEvidence()\""))throw new Error('Role-safe Add evidence quick action missing');
if(!html.includes('data-bw-onclick="exportPrintableReport()"'))throw new Error('Compliance report quick action missing');
if(!html.includes("data-bw-onclick=\"openModal('scanModal')\""))throw new Error('Compliance scan quick action missing');
if(!html.includes('data-bw-onclick="openOnboarding()"'))throw new Error('Guided setup quick action missing');
console.log('v72 practical workspace static checks passed');
