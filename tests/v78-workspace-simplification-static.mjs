import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const primary=[...html.matchAll(/<button[^>]*class="(?:active )?nav-primary"[^>]*data-view="([^"]+)"/g)].map(m=>m[1]);
// Sep-26 owner UX contract: keep the everyday workspace to seven primary mental models.
// Specialist engines remain reachable through Find tools and contextual hubs.
const expected=['dashboard','moneyhub','workhub','peopleops','protecthub','automationhub','accounthub'];
if(JSON.stringify(primary)!==JSON.stringify(expected))throw new Error(`Primary workspace navigation drifted from the approved 7-destination contract; got ${primary.join(', ')}`);
for(const id of ['calendar','dailyreports','employees','tenderhub']){
  if(!html.includes(`class=\"nav-secondary\" data-view=\"${id}\"`))throw new Error(`Approved secondary destination missing from More tools: ${id}`);
}
if(!new RegExp('class="nav-primary nav-utility"[^>]*data-view="audit"').test(html))throw new Error('Reports & audit utility destination missing');
if(!new RegExp('class="nav-primary"[^>]*data-view="accounthub"').test(html))throw new Error('Settings must remain a primary destination');
for(const id of ['moneyhub','workhub','peopleops','protecthub','businesshub','evidencehub','tenderhub','automationhub','accounthub']){
  const tag=(html.match(new RegExp(`<section id="${id}" class="([^"]+)"`))||[])[1]||"";
  const classes=new Set(tag.split(/\s+/).filter(Boolean));
  if(!classes.has("view")||!classes.has("simplified-hub"))throw new Error(`Simplified hub missing: ${id}`);
}
if(!(html.includes('>Find tools<')&&html.includes('class="nav-advanced-index" hidden')&&html.includes('class="nav-access-group"')&&html.includes('data-bw-onclick="openCommandPalette()"')))throw new Error('Search/Find tools access path missing');
if(!html.includes('.nav .nav-advanced{display:none!important}'))throw new Error('Specialist navigation must remain hidden from primary sidebar');
if(!html.includes('const COMMAND_META={'))throw new Error('Command palette taxonomy missing');
if(!html.includes('data-command-mode="suggested"')||!html.includes('data-command-mode="recent"')||!html.includes('data-command-mode="all"'))throw new Error('Guided More tools modes missing');
if(!html.includes('const COMMAND_RECENT_KEY=')||!html.includes('recordRecentTool'))throw new Error('Recent-tools memory missing');
if(!html.includes('const COMMAND_GROUP_ORDER='))throw new Error('All-tools grouped taxonomy missing');
if(!html.includes('window.refreshSimplifiedHubAccess'))throw new Error('Role-aware hub access filtering missing');
const viewIds=new Set([...html.matchAll(/<section id="([^"]+)" class="view(?:\s|\")/g)].map(m=>m[1]));
const navIds=new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]));
const missing=[...viewIds].filter(x=>!navIds.has(x));
if(missing.length)throw new Error(`Views became unreachable from navigation/search index: ${missing.join(', ')}`);
for(const target of [...html.matchAll(/data-hub-target="([^"]+)"/g)].map(m=>m[1])){
  if(!viewIds.has(target))throw new Error(`Hub points to missing view: ${target}`);
  if(!navIds.has(target))throw new Error(`Hub target missing role/search nav index: ${target}`);
}
if(/\.nav-primary,.nav-more-tools\{display:flex!important/.test(html))throw new Error('Role controls could be overridden by !important primary-nav display');
if(!html.includes('meta?.[0]||nb?.textContent?.trim()'))throw new Error('Human-readable page title resolution missing');
if(!html.includes('data-mobile-view="workhub"')||!html.includes('data-mobile-view="moneyhub"')||html.includes('data-mobile-view="sites"')||html.includes('data-mobile-view="obligations"'))throw new Error('Mobile Money/Work consolidation missing');
for(const label of ['What needs action','Filing deadlines','Evidence checks','AI credits & limits','Plan features']){
  if(!html.includes(label))throw new Error(`Plain-language tool label missing: ${label}`);
}
if(!html.includes('id="dashboardDetailPanel"')||!html.includes('Protection health & deadlines'))throw new Error('Home progressive-disclosure panel missing');
if(!html.includes('class="companyswitch role-context"')||!html.includes('.top>.actions .role-context{display:none!important}'))throw new Error('Mobile role-context simplification missing');
if(!html.includes('#dashboard .dashboard-intro .muted{display:none!important}'))throw new Error('Mobile Home hero copy reduction missing');
console.log('v78 workspace simplification static checks passed');
