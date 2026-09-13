import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const js=read('public/js/owner-command-centre.js');
const html=read('public/index.html');
const core=read('cloudflare/src/agentic-core.js');
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++};

ok(js.includes('const RELEASE="20260913c";'),'browser release advanced for agentic UI');
ok(html.includes('owner-command-centre.js?v=20260913c'),'index cache key serves agentic UI release');
ok(html.includes('id="ownerAgenticStyles"')&&html.includes('.owner-agentic-panel{'),'responsive agentic panel styles are present');
ok(js.includes('agentic.id="ownerAgenticPanel"')&&js.includes('agenticBody.id="ownerAgenticBody"'),'Owner Command Centre mounts governed agentic panel');
ok(js.includes('Observe → reason → simulate → recommend → approve'),'UI communicates the bounded Stage 1 loop');
ok(js.includes('Stage 1 · execution disabled')&&js.includes('Approval records intent for audit; it does not execute an action.'),'UI makes non-execution boundary explicit');
ok(js.includes('request("/api/agentic/status")')&&js.includes('request("/api/agentic/runs")'),'UI reads governed status and persisted runs');
ok(js.includes('request("/api/agentic/plan"')&&js.includes('method:"POST"'),'plan generation uses the reviewed Stage 1 planning endpoint');
ok(js.includes('/api/agentic/proposals/${encodeURIComponent(proposalId)}/${decision}')&&js.includes('"Record approval"')&&js.includes('"Reject"'),'proposal decisions use reviewed approve/reject endpoints');
ok(js.includes('if(role()==="owner")')&&js.includes('["owner","manager"].includes(role())'),'approval is owner-only while rejection remains owner/manager');
ok(js.includes('result?.execution?.performed===false')&&js.includes('Decision recorded. No action was executed.'),'decision response is presented as record-only governance');
ok(!js.includes('/api/agentic/execute'),'browser has no agentic execution endpoint');
ok(!core.includes('/api/agentic/execute'),'server has no agentic execution endpoint');
ok(core.includes('executionEnabled:false')&&core.includes('Stage 1 records governance decisions only.'),'backend authority boundary remains disabled');
ok(js.includes('No fallback action will be executed.'),'agentic UI fails closed when governance APIs are unavailable');
ok(js.includes('latestRun?.generationMode||latestRun?.generation_mode'),'UI supports immediate and persisted plan response shapes');
ok(js.includes('sourceRow.append(text("span",ref,"owner-agentic-source"))'),'source references are rendered as text, not HTML');
ok(!js.includes('.innerHTML='),'Owner Command Centre does not introduce direct innerHTML assignment');

console.log(`V80 agentic Owner Command Centre gate: ${checks}/${checks} PASS`);
