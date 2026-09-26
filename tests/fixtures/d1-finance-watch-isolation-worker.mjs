import {buildFinanceWatchDueQuery} from "../../cloudflare/src/finance-watch-contract.js";

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});

async function reset(DB){
  await DB.batch([
    DB.prepare("DROP TABLE IF EXISTS agent_persistent_tasks")
  ]);
  await DB.batch([
    DB.prepare("CREATE TABLE agent_persistent_tasks(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,status TEXT NOT NULL,objective TEXT NOT NULL DEFAULT 'watch',trigger_kind TEXT NOT NULL,trigger_spec_json TEXT NOT NULL DEFAULT '{}',allowed_tools_json TEXT NOT NULL DEFAULT '[]',budget_json TEXT NOT NULL DEFAULT '{}',next_run_at TEXT,last_run_at TEXT,updated_at TEXT)"),
    DB.prepare("CREATE INDEX agent_persistent_tasks_scheduler_due ON agent_persistent_tasks(next_run_at,id) WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL")
  ]);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true});
    if(url.pathname!=="/probe"||request.method!=="POST")return json({ok:false},404);

    await reset(env.DB);
    const clock=await env.DB.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') now_iso").first();
    const nowMs=Date.parse(clock.now_iso),due=new Date(nowMs-60000).toISOString(),future=new Date(nowMs+60000).toISOString(),tenant="tenant-isolation";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("finance-due",tenant,"active","scheduled",JSON.stringify(["financial_position.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("receivables-due",tenant,"active","scheduled",JSON.stringify(["receivables_summary.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("generic-due",tenant,"active","scheduled",JSON.stringify(["compliance_status.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("mixed-due",tenant,"active","scheduled",JSON.stringify(["financial_position.read","compliance_status.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("duplicate-finance",tenant,"active","scheduled",JSON.stringify(["financial_position.read","financial_position.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("empty-due",tenant,"active","scheduled","[]",due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("malformed-due",tenant,"active","scheduled","not-json",due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("manual-finance",tenant,"active","manual",JSON.stringify(["financial_position.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("paused-finance",tenant,"paused","scheduled",JSON.stringify(["financial_position.read"]),due),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,allowed_tools_json,next_run_at) VALUES(?,?,?,?,?,?)").bind("future-finance",tenant,"active","scheduled",JSON.stringify(["financial_position.read"]),future)
    ]);

    const dueQuery=buildFinanceWatchDueQuery(25);
    const rows=await env.DB.prepare(dueQuery.sql).bind(...dueQuery.bindings).all();
    const plan=await env.DB.prepare("EXPLAIN QUERY PLAN "+dueQuery.sql).bind(...dueQuery.bindings).all();
    return json({
      selected:(rows.results||[]).map(row=>row.id),
      plan:(plan.results||[]).map(row=>String(row.detail||"")),clock:clock.now_iso,due,future
    });
  }
};
