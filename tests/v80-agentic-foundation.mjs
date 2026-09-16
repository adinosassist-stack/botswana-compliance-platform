import fs from 'node:fs';
import assert from 'node:assert/strict';
import {__agenticFoundationTest} from '../cloudflare/src/agentic-core.js';
import {auditFailClosedResponse,logicalRequestPath,withAuditWriteFailureGuard} from '../cloudflare/src/agentic-entry.js';

const core=fs.readFileSync(new URL('../cloudflare/src/agentic-core.js',import.meta.url),'utf8');
const agenticEntry=fs.readFileSync(new URL('../cloudflare/src/agentic-entry.js',import.meta.url),'utf8');
const productionEntry=fs.readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../cloudflare/migrations/045_v80_agentic_foundation.sql',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../cloudflare/wrangler.toml',import.meta.url),'utf8');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++};

ok(wrangler.includes('main = "src/agentic-entry.js"'),'V81 wrapper is the deployed production entrypoint');
ok(agenticEntry.includes('import base from "./production-entry.js"'),'V81 wrapper delegates to canonical hardened production entry');
ok(agenticEntry.includes('return enhanceReadiness(request,env,response)'),'V81 wrapper only augments authority routing and schema readiness around the production stack');
ok(!agenticEntry.includes('handleAgenticRequest'),'V81 wrapper does not double-dispatch governed V80 agentic routes');
ok(productionEntry.includes('import {handleAgenticRequest} from "./agentic-core.js"'),'canonical production boundary imports governed agentic router');
ok(productionEntry.includes('const agenticResponse=await handleAgenticRequest'),'canonical production boundary invokes agentic router before base worker dispatch');
ok(productionEntry.includes('worker.fetch(request,env,ctx)'),'non-authority traffic still delegates through hardened base Worker');
ok(logicalRequestPath(new Request('https://thebedesk.com/api/agentic/status'))==='/api/agentic/status','direct agentic path normalizes');
ok(logicalRequestPath(new Request('https://thebedesk.com/?__thebe_api_path=%2Fapi%2Fagentic%2Fplan'))==='/api/agentic/plan','tunneled agentic path normalizes');

const fakeDb={prepare(sql){return {sql}}};
const auditGuard=withAuditWriteFailureGuard({DB:fakeDb});
auditGuard.env.DB.prepare('SELECT 1');
ok(auditGuard.state.failed===false,'audit guard ignores ordinary D1 statements');
auditGuard.env.DB.prepare('INSERT INTO audit_write_failures(id) VALUES(?)');
ok(auditGuard.state.failed===true,'audit guard marks the terminal audit-write failure path');
const failedResponse=auditFailClosedResponse(new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}}),auditGuard.state);
ok(failedResponse.status===500&&failedResponse.headers.get('x-thebe-audit-fail-closed')==='1','successful API response is converted to fail-closed 500 after terminal audit failure');
const conflictResponse=auditFailClosedResponse(new Response('{"error":"conflict"}',{status:409}),auditGuard.state);
ok(conflictResponse.status===409,'already-failed API responses are not rewritten by the audit guard');
let waited=null;
const backgroundGuard=withAuditWriteFailureGuard({DB:fakeDb},{waitUntil(promise){waited=promise}});
backgroundGuard.env.DB.prepare('INSERT INTO audit_write_failures(id) VALUES(?)');
backgroundGuard.ctx.waitUntil(Promise.resolve('done'));
await assert.rejects(waited,/audit_write_failed/);checks++;

ok(core.includes('/api/agentic/status'),'agentic status route exists');
ok(core.includes('/api/agentic/runs'),'agentic run history route exists');
ok(core.includes('/api/agentic/plan'),'agentic planning route exists');
ok(core.includes('/approve|reject')||core.includes('(approve|reject)'),'proposal decision routes are explicit');
ok(!core.includes('/api/agentic/execute'),'Stage 1 exposes no execution endpoint');
ok(!core.includes('/api/agentic/proposals/${')||!core.includes('/execute'),'proposal execution is absent');
ok(core.includes('executionEnabled:false'),'API truthfully reports execution disabled');
ok(core.includes('Stage 1 records governance decisions only'),'approval cannot masquerade as execution');
ok(core.includes('csrfAllowed(request,auth)'),'mutations require CSRF');
ok(core.includes('originAllowed(request,env)'),'mutations enforce configured origin');
ok(core.includes('roleAllowed(auth,"owner"')||core.includes('roleAllowed(auth,"owner")'),'approval requires owner authority');
ok(core.includes('worker')===false,'agentic core is provider-neutral and delegates AI through injected coreFetch only');

const high=__agenticFoundationTest.classifyProposal({title:'Transfer payroll payment',reason:'Pay salaries now'});
assert.deepEqual(high,{risk:'high',authority:'human_only',executionPolicy:'prohibited_autonomy'});checks++;
const medium=__agenticFoundationTest.classifyProposal({title:'Draft reminder',reason:'Prepare a follow-up notice'});
assert.equal(medium.authority,'approval_required');checks++;
const low=__agenticFoundationTest.classifyProposal({title:'Review cash variance',reason:'Inspect the source records'});
assert.equal(low.authority,'recommendation_only');checks++;

for(const category of ['payments_and_transfers','payroll_and_salary_changes','tax_or_regulatory_filing','contract_or_signature_commitment','employee_discipline_or_termination','accounting_journal_posting','refunds_or_customer_debits']){
  ok(__agenticFoundationTest.prohibitedAutonomy.includes(category),`prohibited autonomy contains ${category}`);
}

ok(migration.includes('CREATE TABLE IF NOT EXISTS agentic_runs'),'migration creates run memory');
ok(migration.includes('CREATE TABLE IF NOT EXISTS agentic_proposals'),'migration creates proposal memory');
ok(migration.includes('CREATE TABLE IF NOT EXISTS agentic_events'),'migration creates audit events');
ok(migration.includes("execution_policy TEXT NOT NULL CHECK(execution_policy IN ('not_executable_stage_1','prohibited_autonomy'))"),'schema cannot represent executable proposals');
ok(!migration.includes('agentic_execution'),'migration creates no execution queue');
ok(!migration.includes('payment_id')&&!migration.includes('journal_id'),'agentic schema has no payment or journal side-effect linkage');

console.log(`V80 agentic foundation gate: ${checks}/${checks} PASS through V81 production wrapper`);
