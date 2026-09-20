import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const js=read('public/js/owner-command-centre.js');
const html=read('public/index.html');
const sw=read('public/sw.js');
const core=read('cloudflare/src/agentic-core.js');
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++};

ok(js.includes('const RELEASE="20260913d";'),'browser release advanced for outcome-informed agentic UI');
const runtimeAssetsSafe=(sw.includes('function criticalRuntimeAsset(url){return url.origin===self.location.origin&&url.pathname.startsWith("/js/")}')&&sw.includes('fetch(request,{cache:"no-store"})'))||(sw.includes('self.registration.unregister()')&&!sw.includes('addEventListener("fetch"'));
ok(runtimeAssetsSafe,'JS runtime assets must be network-first under the legacy worker or fully outside service-worker interception under the decommissioned model');
ok(html.includes('id="ownerAgenticStyles"')&&html.includes('.owner-agentic-panel{'),'responsive agentic panel styles are present');
ok(js.includes('agentic.id="ownerAgenticPanel"')&&js.includes('agenticBody.id="ownerAgenticBody"'),'Owner Command Centre mounts governed agentic panel');
ok(js.includes('Observe → reason → recommend → approve → bounded execute'),'UI communicates the governed bounded-execution loop');
ok(js.includes('Bounded execution · OFF')&&js.includes('owner-approved grant')&&js.includes('Runtime Guard'),'UI makes bounded execution prerequisites explicit');
ok(js.includes('statusPayload?.outcomeLearning?.enabled')&&js.includes('Outcome-informed ordering'),'UI only shows learning disclosure when the governed API reports it enabled');
ok(js.includes('Recent recorded outcomes can only reorder recommendations within the same priority level.'),'UI states the strict priority-class learning boundary');
ok(js.includes('This is non-causal and cannot change risk, approvals or execution authority.'),'UI states that learning is non-causal and cannot expand authority');
ok(js.includes('request("/api/agentic/status")')&&js.includes('request("/api/agentic/runs")')&&js.includes('request("/api/agentic/task-execution/status")'),'UI reads governed planning, persisted runs and read-only bounded-execution status');
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
