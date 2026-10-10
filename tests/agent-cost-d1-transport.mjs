import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {inspectAgentCostSchema} from "../scripts/agent-cost-schema-preflight.mjs";

// Qualification only: a throwaway local D1 database with a synthetic binding.
// Do not load the production Wrangler config, environment files or credentials.
const root=resolve('.');
const wrangler=join(root,'node_modules/wrangler/bin/wrangler.js');
assert.equal(JSON.parse(readFileSync(join(root,'node_modules/wrangler/package.json'),'utf8')).version,'4.135.0');
const dir=mkdtempSync(join(tmpdir(),'thebe-cost-local-d1-'));
const config=join(dir,'wrangler.json');
const childEnv={...process.env,WRANGLER_SEND_METRICS:'false'};
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CLOUDFLARE_ACCOUNT_ID'])delete childEnv[key];
writeFileSync(config,JSON.stringify({name:'thebe-cost-local-qualification',compatibility_date:'2026-09-03',
  d1_databases:[{binding:'DB',database_name:'thebe-cost-local-qualification',database_id:'00000000-0000-0000-0000-000000000001'}]}));
let sequence=0;
function execute(sql){
  const file=join(dir,`query-${++sequence}.sql`);writeFileSync(file,sql);
  const output=execFileSync(process.execPath,[wrangler,'d1','execute','DB','--local','--config',config,
    '--persist-to',join(dir,'state'),'--file',file,'--json'],{cwd:dir,env:childEnv,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
  const result=JSON.parse(output);
  assert.ok(Array.isArray(result)&&result.every(r=>r.success===true),'D1 command must succeed');
  return result;
}
const rows=sql=>execute(sql).at(-1).results;
function rejects(sql,code){assert.throws(()=>execute(sql),error=>(String(error.stdout||"")+String(error.stderr||"")+error.message).includes(code));}
try{
  const files=readdirSync(join(root,'cloudflare/migrations')).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44).sort();
  assert.equal(files.at(-1),JSON.parse(readFileSync(join(root,'RELEASE_PROFILE.json'),'utf8')).latest_cloudflare_migration);
  const schema=readFileSync(join(root,'cloudflare/migrations/068_agent_cost_accounting.sql'),'utf8');
  execute([readFileSync(join(root,'cloudflare/schema.sql'),'utf8'),...files.filter(f=>Number(f.slice(0,3))<68).map(f=>readFileSync(join(root,'cloudflare/migrations',f),'utf8'))].join('\n'));
  assert.equal((await inspectAgentCostSchema(rows)).code,'accounting_schema_absent');
  execute(schema);
  execute(schema);
  assert.equal((await inspectAgentCostSchema(rows)).code,'accounting_schema_compatible');
  assert.deepEqual(rows('PRAGMA foreign_key_check;'),[]);
  execute("INSERT INTO tenants(id,name) VALUES('t1','Purge'),('t2','Keep'); INSERT INTO users(id,email) VALUES('u1','purge@example.test'); INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','u1','owner','active'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('t1','thebe',100),('t2','thebe',100);");
  rejects("INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('missing','thebe',1);",'FOREIGN KEY');
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('r1','t1','thebe','run',20);",'cost_reservation_budget_rejected');
  execute("UPDATE agent_cost_budgets SET enabled=1; INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('r1','t1','thebe','run',20); INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('r1','t1','thebe','reserved',20);");
  assert.equal(rows("SELECT reserved_minor FROM agent_cost_budgets WHERE tenant_id='t1';")[0].reserved_minor,20);
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('duplicate','t1','thebe','run',20);",'UNIQUE');
  rejects("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('r1','t2','thebe','settled',20);",'cost_event_');
  // Multiple reservations in one transaction must not oversubscribe the
  // remaining budget. A rejected statement must leave no orphan accounting.
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('over-a','t2','thebe','over-a',60),('over-b','t2','thebe','over-b',60);",'cost_reservation_budget_rejected');
  assert.deepEqual(rows("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2';"),[{spent_minor:0,reserved_minor:0}]);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_reservations WHERE tenant_id='t2';")[0].n,0);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t2';")[0].n,0);
  execute("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('cap-a','t2','thebe','cap-a',60); INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('cap-a','t2','thebe','reserved',60);");
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('cap-b','t2','thebe','cap-b',41);",'cost_reservation_budget_rejected');
  assert.equal(rows("SELECT reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2';")[0].reserved_minor,60);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_reservations WHERE tenant_id='t2';")[0].n,1);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t2';")[0].n,1);
  // Independent Wrangler processes race for one shared local D1 budget.
  // This is stronger than a multi-row INSERT but does not claim remote D1 parity.
  execute("INSERT INTO tenants(id,name) VALUES('t3','Concurrent'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('t3','thebe',100,1);");
  async function concurrentReservation(id){
    const file=join(dir,`concurrent-${id}.sql`);
    writeFileSync(file,`INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('${id}','t3','thebe','${id}',60); INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('${id}','t3','thebe','reserved',60);`);
    return await new Promise(resolveResult=>{
      const child=spawn(process.execPath,[wrangler,'d1','execute','DB','--local','--config',config,'--persist-to',join(dir,'state'),'--file',file,'--json'],{cwd:dir,env:childEnv,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';
      child.stdout.on('data',chunk=>stdout+=chunk);
      child.stderr.on('data',chunk=>stderr+=chunk);
      child.on('error',error=>resolveResult({ok:false,details:String(error)}));
      child.on('close',code=>resolveResult({ok:code===0,details:stdout+stderr}));
    });
  }
  const competing=await Promise.all([concurrentReservation('race-a'),concurrentReservation('race-b')]);
  assert.equal(competing.filter(result=>result.ok).length,1,'exactly one competing D1 reservation must commit: '+JSON.stringify(competing));
  assert.deepEqual(rows("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t3';"),[{spent_minor:0,reserved_minor:60}]);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_reservations WHERE tenant_id='t3';")[0].n,1);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t3';")[0].n,1);
  assert.deepEqual(rows("SELECT reservation_id FROM agent_cost_ledger_gaps WHERE tenant_id='t3';"),[]);
  assert.deepEqual(rows('PRAGMA foreign_key_check;'),[]);
  // Suspension and budget shutdown must reject fresh reservations while
  // preserving previously booked amounts for explicit reconciliation.
  // A retried request must not book a second reservation for the same run.
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('cap-a-retry','t2','thebe','cap-a',1);",'UNIQUE');
  assert.deepEqual(rows("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2';"),[{spent_minor:0,reserved_minor:60}]);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_reservations WHERE tenant_id='t2';")[0].n,1);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t2';")[0].n,1);
  execute("UPDATE agent_cost_budgets SET suspended=1 WHERE tenant_id='t2';");
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('suspended','t2','thebe','suspended',1);",'cost_reservation_budget_rejected');
  execute("UPDATE agent_cost_budgets SET suspended=0,enabled=0 WHERE tenant_id='t2';");
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('disabled','t2','thebe','disabled',1);",'cost_reservation_budget_rejected');
  assert.equal(rows("SELECT reserved_minor FROM agent_cost_budgets WHERE tenant_id='t2';")[0].reserved_minor,60);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_reservations WHERE tenant_id='t2';")[0].n,1);
  assert.equal(rows("SELECT count(*) n FROM agent_cost_events WHERE tenant_id='t2';")[0].n,1);
  execute("INSERT INTO deletion_requests(id,tenant_id,user_id,status,processing_token) VALUES('dr1','t1','u1','processing','synthetic-claim');");
  const tombstone="INSERT INTO deletion_tombstones(request_id,tenant_fingerprint) VALUES('dr1','synthetic-fingerprint');";
  rejects(tombstone,'cost_purge_reconciliation_required');
  assert.equal(rows('SELECT count(*) n FROM deletion_tombstones;')[0].n,0);
  rejects("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('during-delete','t1','thebe','blocked',1);",'cost_tenant_deletion_pending');
  execute("UPDATE agent_cost_reservations SET status='settled',actual_minor=5,provider='mock',model='mock',input_tokens=1,output_tokens=1,settled_at=CURRENT_TIMESTAMP WHERE id='r1'; INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor,actual_minor) VALUES('r1','t1','thebe','settled',20,5);");
  assert.deepEqual(rows("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t1';"),[{spent_minor:5,reserved_minor:0}]);
  rejects("DELETE FROM agent_cost_events WHERE tenant_id='t1';",'cost_event_delete_forbidden');
  rejects("DELETE FROM tenants WHERE id='t1';",'cost_purge_governance_required');
  execute("INSERT INTO legal_holds(id,tenant_id,reason) VALUES('hold','t1','Synthetic');");
  rejects(tombstone,'cost_purge_legal_hold_active');
  execute("UPDATE legal_holds SET active=0,status='released';");
  // Same ordering as the worker: tombstone, orphan user, then tenant.
  execute(tombstone+"DELETE FROM users WHERE id='u1'; DELETE FROM tenants WHERE id='t1';");
  for(const table of ['agent_cost_budgets','agent_cost_reservations','agent_cost_events','agent_cost_purge_authorizations'])
    assert.equal(rows(`SELECT count(*) n FROM ${table} WHERE tenant_id='t1';`)[0].n,0,table+' cascade');
  assert.equal(rows("SELECT count(*) n FROM agent_cost_budgets WHERE tenant_id='t2';")[0].n,1);
  assert.equal(rows("SELECT count(*) n FROM deletion_tombstones WHERE request_id='dr1';")[0].n,1);
  assert.deepEqual(rows('PRAGMA foreign_key_check;'),[]);
  console.log('Agent cost local D1 transport: pinned Wrangler, schema chain, triggers, usage accounting and governed purge PASS');
}finally{rmSync(dir,{recursive:true,force:true})}
