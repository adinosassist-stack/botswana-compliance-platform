import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {appendFileSync,readFileSync,writeFileSync} from "node:fs";

const STATE_FILE=process.env.QUALIFICATION_STATE_FILE||".agent-cost-remote-d1-state.json";
const PREFIX="thebe-agent-cost-qual-";

function required(name){
  const value=String(process.env[name]||"").trim();
  assert.ok(value,`${name} is required`);
  return value;
}

const token=required("CLOUDFLARE_API_TOKEN");
const accountId=required("CLOUDFLARE_ACCOUNT_ID");
const productionDatabaseId=required("PRODUCTION_D1_DATABASE_ID");
const runId=String(process.env.QUALIFICATION_RUN_ID||process.env.GITHUB_RUN_ID||"").replace(/[^0-9]/g,"");
const runAttempt=String(process.env.QUALIFICATION_RUN_ATTEMPT||process.env.GITHUB_RUN_ATTEMPT||"1").replace(/[^0-9]/g,"")||"1";
assert.match(accountId,/^[a-f0-9]{32}$/i,"Cloudflare account ID must be 32 hex characters");
assert.match(productionDatabaseId,/^[a-f0-9-]{32,40}$/i,"production D1 database ID has an unexpected format");
assert.ok(runId,"qualification run id is required");

const baseUrl=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`;

function sanitizeMessage(value){
  return String(value||"").replaceAll(token,"[redacted]").slice(0,3000);
}

function failureText(response,payload,raw){
  const parts=[`HTTP ${response.status}`];
  for(const entry of payload?.errors||[])parts.push(entry?.message||JSON.stringify(entry));
  for(const entry of payload?.messages||[])parts.push(entry?.message||JSON.stringify(entry));
  for(const entry of Array.isArray(payload?.result)?payload.result:[]){
    if(entry?.success===false)parts.push(entry?.error||entry?.message||JSON.stringify(entry));
  }
  if(parts.length===1&&raw)parts.push(raw);
  return sanitizeMessage(parts.join(" | "));
}

async function api(method,url,body){
  const response=await fetch(url,{
    method,
    headers:{
      Authorization:`Bearer ${token}`,
      "Content-Type":"application/json"
    },
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(45000)
  });
  const raw=await response.text();
  let payload=null;
  try{payload=raw?JSON.parse(raw):null;}catch{}
  const resultFailures=Array.isArray(payload?.result)?payload.result.filter(item=>item?.success===false):[];
  const ok=response.ok&&payload?.success!==false&&resultFailures.length===0;
  return {ok,response,payload,raw,error:failureText(response,payload,raw)};
}

function readState(){
  try{return JSON.parse(readFileSync(STATE_FILE,"utf8"));}catch{return null;}
}

function assertEphemeralState(state){
  assert.ok(state&&state.schema===1,"qualification state is missing or invalid");
  assert.match(String(state.databaseId||""),/^[a-f0-9-]{32,40}$/i,"ephemeral D1 id is invalid");
  assert.ok(String(state.databaseName||"").startsWith(PREFIX),"cleanup target lacks qualification prefix");
  assert.notEqual(state.databaseId,productionDatabaseId,"refusing to target the production D1 database");
  assert.equal(String(state.runId),runId,"qualification state belongs to a different workflow run");
}

function writeState(state){
  writeFileSync(STATE_FILE,JSON.stringify(state,null,2)+"\n",{mode:0o600});
}

async function deleteEphemeral(state){
  assertEphemeralState(state);
  if(state.deleted===true)return state;
  const result=await api("DELETE",`${baseUrl}/${state.databaseId}`);
  assert.ok(result.ok,`ephemeral D1 cleanup failed: ${result.error}`);
  const next={...state,deleted:true,deletedAt:new Date().toISOString()};
  writeState(next);
  return next;
}

if(process.argv.includes("--cleanup-only")){
  const state=readState();
  if(!state){
    console.log("Remote D1 cleanup: no qualification state found; nothing to do");
    process.exit(0);
  }
  await deleteEphemeral(state);
  console.log("Remote D1 cleanup: ephemeral qualification database deleted");
  process.exit(0);
}

const databaseName=`${PREFIX}${runId}-${runAttempt}`.slice(0,62);
const migration=readFileSync("cloudflare/migrations/068_agent_cost_accounting.sql","utf8");
assert.match(migration,/CREATE TRIGGER IF NOT EXISTS agent_cost_reserve_budget/);
assert.match(migration,/cost_reservation_budget_rejected/);

const prerequisiteSchema=`
PRAGMA foreign_keys=ON;
CREATE TABLE tenants(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE deletion_requests(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL,
  processing_token TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE TABLE deletion_tombstones(
  request_id TEXT PRIMARY KEY,
  tenant_fingerprint TEXT NOT NULL
);
CREATE TABLE legal_holds(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
`;

let state=null;
let primaryError=null;
let cleanupError=null;

async function query(databaseId,sql){
  return await api("POST",`${baseUrl}/${databaseId}/query`,{sql});
}

async function mustQuery(databaseId,sql,label){
  const result=await query(databaseId,sql);
  assert.ok(result.ok,`${label} failed: ${result.error}`);
  return result.payload?.result||[];
}

function resultRows(results){
  const last=Array.isArray(results)?results.at(-1):null;
  return Array.isArray(last?.results)?last.results:[];
}

function hashId(value){
  return createHash("sha256").update(String(value)).digest("hex").slice(0,16);
}

try{
  const created=await api("POST",baseUrl,{name:databaseName});
  assert.ok(created.ok,`ephemeral D1 creation failed: ${created.error}`);
  const databaseId=String(created.payload?.result?.uuid||"");
  assert.match(databaseId,/^[a-f0-9-]{32,40}$/i,"Cloudflare did not return an ephemeral D1 UUID");
  assert.notEqual(databaseId,productionDatabaseId,"ephemeral D1 unexpectedly matches production");
  state={schema:1,runId,runAttempt,databaseName,databaseId,deleted:false,createdAt:new Date().toISOString()};
  writeState(state);

  await mustQuery(databaseId,prerequisiteSchema,"prerequisite schema");
  await mustQuery(databaseId,migration,"migration 068 first application");
  await mustQuery(databaseId,migration,"migration 068 idempotence application");
  await mustQuery(databaseId,"INSERT INTO tenants(id,name) VALUES('remote-race','Remote race'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('remote-race','thebe',100,1);","remote race fixture");

  const reservationSql=id=>`INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('${id}','remote-race','thebe','${id}',60); INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('${id}','remote-race','thebe','reserved',60);`;
  const startedAt=Date.now();
  const [raceA,raceB]=await Promise.all([
    query(databaseId,reservationSql("remote-race-a")),
    query(databaseId,reservationSql("remote-race-b"))
  ]);
  const race=[raceA,raceB];
  const winners=race.filter(result=>result.ok);
  const losers=race.filter(result=>!result.ok);
  assert.equal(winners.length,1,`expected exactly one remote D1 reservation winner, received ${winners.length}`);
  assert.equal(losers.length,1,`expected exactly one remote D1 reservation loser, received ${losers.length}`);
  assert.match(losers[0].error,/cost_reservation_budget_rejected/,"loser must fail at the database budget trigger rather than transport or auth");

  const budgetRows=resultRows(await mustQuery(databaseId,"SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='remote-race' AND agent_id='thebe';","budget verification"));
  assert.deepEqual(budgetRows,[{spent_minor:0,reserved_minor:60}]);
  const reservations=resultRows(await mustQuery(databaseId,"SELECT id,run_id,estimate_minor,status FROM agent_cost_reservations WHERE tenant_id='remote-race' ORDER BY id;","reservation verification"));
  assert.equal(reservations.length,1,"exactly one remote reservation must persist");
  assert.equal(reservations[0].estimate_minor,60);
  assert.equal(reservations[0].status,"reserved");
  const winnerRunId=reservations[0].run_id;
  const events=resultRows(await mustQuery(databaseId,"SELECT reservation_id,event_type,estimate_minor FROM agent_cost_events WHERE tenant_id='remote-race' ORDER BY id;","ledger verification"));
  assert.equal(events.length,1,"exactly one remote ledger event must persist");
  assert.equal(events[0].reservation_id,reservations[0].id);
  assert.equal(events[0].event_type,"reserved");
  assert.equal(events[0].estimate_minor,60);
  const gaps=resultRows(await mustQuery(databaseId,"SELECT reservation_id FROM agent_cost_ledger_gaps WHERE tenant_id='remote-race';","ledger gap verification"));
  assert.deepEqual(gaps,[],"remote race must not leave an orphan ledger gap");
  const fk=resultRows(await mustQuery(databaseId,"PRAGMA foreign_key_check;","foreign key verification"));
  assert.deepEqual(fk,[],"remote qualification database must have no foreign-key violations");

  const retry=await query(databaseId,`INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('remote-retry','remote-race','thebe','${winnerRunId}',1);`);
  assert.equal(retry.ok,false,"retry with the winning run_id must be rejected");
  assert.match(retry.error,/UNIQUE|unique/i,"retry must fail on the unique run identity guard");
  const afterRetry=resultRows(await mustQuery(databaseId,"SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='remote-race' AND agent_id='thebe';","post-retry budget verification"));
  assert.deepEqual(afterRetry,[{spent_minor:0,reserved_minor:60}],"rejected retry must not change the budget");

  const evidence={
    qualification:"agent-cost-remote-d1",
    schema:1,
    databaseName,
    databaseIdSha256_16:hashId(databaseId),
    productionDatabaseMatched:false,
    migration068:"applied_twice",
    race:{requests:2,winners:1,losers:1,durationMs:Date.now()-startedAt,loserReason:"cost_reservation_budget_rejected"},
    final:{spentMinor:0,reservedMinor:60,reservations:1,ledgerEvents:1,ledgerGaps:0,foreignKeyViolations:0},
    retry:"unique_run_id_rejected",
    executionScope:"ephemeral_remote_d1_only",
    productionActivationChanged:false
  };
  console.log(JSON.stringify(evidence,null,2));
  if(process.env.GITHUB_STEP_SUMMARY){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Remote D1 cost-accounting qualification\n\n- Ephemeral database: \`${databaseName}\`\n- Production DB matched: **no**\n- Migration 068: applied twice successfully\n- Concurrent requests: 2; winners: 1; budget-trigger rejections: 1\n- Final budget: 60 / 100 minor units reserved; 0 spent\n- Ledger gaps: 0; foreign-key violations: 0\n- Retry of winning run identity: rejected\n- Production/customer activation: unchanged\n`);
  }
}catch(error){
  primaryError=error;
}finally{
  const current=readState();
  if(current&&current.deleted!==true){
    try{state=await deleteEphemeral(current);}catch(error){cleanupError=error;}
  }
}

if(primaryError&&cleanupError)throw new AggregateError([primaryError,cleanupError],"remote D1 qualification and cleanup both failed");
if(primaryError)throw primaryError;
if(cleanupError)throw cleanupError;
console.log("Agent cost remote D1 qualification PASS; ephemeral database deleted");
