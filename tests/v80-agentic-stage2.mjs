import fs from 'node:fs';
import assert from 'node:assert/strict';
import './v80-agentic-outcome-learning.mjs';
import {__agenticFoundationTest} from '../cloudflare/src/agentic-core.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const agent=read('cloudflare/src/agentic-core.js');
const worker=read('cloudflare/src/worker.js');
const schema=read('cloudflare/schema.sql');
const migration=read('cloudflare/migrations/046_v80_agentic_outcomes.sql');
const profile=JSON.parse(read('RELEASE_PROFILE.json'));
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};

ok(profile.latest_cloudflare_migration==='048_v102_bounded_internal_task_execution.sql','release profile advances to bounded internal-task migration 048 while preserving V81 delegated-authority shadow semantics');
ok(profile.v80_agentic_outcome_measurement===true,'release profile records outcome measurement');
ok(profile.agentic_stage2_execution_enabled===false&&profile.agentic_stage2_external_side_effects===false,'Stage 2 release profile keeps execution disabled');
ok(worker.includes('const EXPECTED_SCHEMA_DELTA="046_v80_agentic_outcomes.sql";'),'core Worker readiness still expects schema 046 before the V81 wrapper adds its 047 gate');
ok(worker.includes('SELECT id FROM agentic_outcomes LIMIT 1'),'Worker readiness probes outcome table');
ok(migration.includes('CREATE TABLE IF NOT EXISTS agentic_outcomes'),'migration creates outcome ledger');
ok(schema.includes('CREATE TABLE IF NOT EXISTS agentic_outcomes'),'fresh schema contains outcome ledger');
ok(migration.includes("outcome_status IN ('observed','improved','unchanged','worsened','resolved','not_applicable')"),'outcome states are constrained');
ok(!migration.toLowerCase().includes('queue')||migration.includes('no executable action queue'),'migration adds no executable action queue');
ok(agent.includes('FROM performance_insights WHERE tenant_id=?'),'agent observes tenant-scoped performance signals');
ok(agent.includes('FROM compliance_obligations WHERE tenant_id=?'),'agent observes tenant-scoped compliance obligations');
ok(agent.includes('type:"deterministic_non_mutating"'),'simulation is explicitly non-mutating');
ok(agent.includes('/api/agentic/outcomes'),'outcome list route exists');
ok(agent.includes('/outcome$/'),'proposal outcome route exists');
ok(!agent.includes('/api/agentic/execute'),'no agentic execute endpoint exists');
ok(agent.includes('measurementOnly:true')&&agent.includes('execution:{performed:false,enabled:false}'),'outcome recording cannot execute business actions');

const simulation=__agenticFoundationTest.deterministicSimulation({
  finance:{cashPositionMinor:100000,reconciliationExposureMinor:15000},
  operations:{pendingWorkflowCount:4,failedWorkflowCount:1},
  compliance:{overdueCount:2},
  performance:{criticalSignals:1}
});
assert.deepEqual(simulation.cashStress,{recordedCashMinor:100000,reconciliationExposureMinor:15000,exposureAdjustedCashMinor:85000});checks++;
assert.equal(simulation.operatingLoad.overdueComplianceCount,2);checks++;
assert.equal(simulation.pressureScore,73);checks++;
assert.equal(simulation.type,'deterministic_non_mutating');checks++;
assert.ok(simulation.assumptions.some(x=>/No simulation output changes business records or authorizes execution\./i.test(x)));checks++;

console.log(`V80 agentic Stage 2 static gate: ${checks}/${checks} PASS with V81 release successor`);
