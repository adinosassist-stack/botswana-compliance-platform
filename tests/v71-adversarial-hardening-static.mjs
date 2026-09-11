import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const fail=(m)=>{console.error('FAIL',m);process.exitCode=1};
const pass=(m)=>console.log('PASS',m);
const check=(c,m)=>c?pass(m):fail(m);

const views=new Set([...html.matchAll(/<section\s+id="([^"]+)"\s+class="view/g)].map(m=>m[1]));
const nav=new Set([...html.matchAll(/<button[^>]+data-view="([^"]+)"/g)].map(m=>m[1]));
check([...views].every(v=>nav.has(v)) && [...nav].every(v=>views.has(v)),`all ${views.size} workspace views reachable from navigation`);
for(const id of ['evidenceintegrity','inspectionreadiness','payments','entitlements','datadeletion'])check(nav.has(id),`orphaned view exposed: ${id}`);
check(html.includes('function getCommandSections()')&&!html.includes('const commandSections=['),'command palette indexes live navigation');
check(html.includes("const allCustomer=[...document.querySelectorAll('.nav button[data-view]:not(.platformRegulatoryOnly)')]") ,'owner role includes new customer modules without stale hard-coded list');
check(html.includes('function syncGroupVisibility()')&&html.includes("querySelectorAll('#nav details.nav-access-group')")&&html.includes("count.textContent=String(visible.length)"),'workspace group counts refresh from visible children');

const funcs=new Set([...html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const refs=new Set();
for(const attr of ['onclick','onchange','oninput','onsubmit']) for(const m of html.matchAll(new RegExp(attr+'=["\\\']([A-Za-z_$][\\w$]*)\\s*\\(','g'))) refs.add(m[1]);
const missing=[...refs].filter(x=>x!=='if'&&!funcs.has(x));
check(missing.length===0,`no missing inline handlers (${missing.join(', ')||'none'})`);
check(html.includes('function verifyEvidence(index)')&&html.includes('function removeEvidence(index)'),'legacy evidence actions have real handlers');
check(html.includes("Secure evidence must be deleted through the protected evidence/deletion workflow."),'secure evidence deletion fails closed');

check(!html.includes('Monitoring live'),'no unconditional live-protection claim');
check(html.includes('id="cockpitStatusText">Checking protection state'),'cockpit trust status is explicit');
check(html.includes('Unable to confirm assurance'),'assurance failure fails closed');
check(html.includes('Do not treat an empty dashboard as all clear.'),'action queue failure cannot masquerade as all clear');
check(!html.includes('state.evidence.length/(a.length||1)'),'dashboard no longer counts all local evidence as assurance');
check(html.includes('eh.health_score')&&html.includes('Server evidence-health snapshot'),'dashboard evidence ring derives from server evidence health');

check(html.includes('safeExternalUrl(r.url)')&&html.includes('safeExternalUrl(c.url)'),'external regulatory links are protocol constrained');
check(html.includes('${escapeHtml(r.title)}'),'rule titles escaped in HTML renderers');
check(html.includes('rel="noopener noreferrer"'),'external source links use opener isolation');

check(html.includes('.small{font-size:14px!important')&&html.includes('.nav button{font-size:13.5px!important')&&html.includes('table td{font-size:13.5px!important'),'final readability override present');
check(html.includes('See business risk before it becomes a penalty, dispute or loss.'),'approved hero copy preserved');
if(process.exitCode)process.exit(1);
