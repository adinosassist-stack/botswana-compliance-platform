import fs from "fs";
import {DatabaseSync} from "node:sqlite";
import {__v782157Test} from "../cloudflare/src/worker.js";
let checks=0;function ok(v,m){checks++;if(!v)throw new Error(`FAIL ${m}`);console.log(`PASS ${m}`)}
const db=new DatabaseSync(":memory:");
db.exec(`PRAGMA foreign_keys=OFF;
CREATE TABLE daily_employee_reports(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,location_id TEXT NOT NULL,report_date TEXT NOT NULL,work_summary TEXT NOT NULL DEFAULT '',wins TEXT NOT NULL DEFAULT '',blockers TEXT NOT NULL DEFAULT '',incidents TEXT NOT NULL DEFAULT '',next_plan TEXT NOT NULL DEFAULT '',kpi_json TEXT NOT NULL DEFAULT '{}',needs_attention INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT 'employee_link',revision_count INTEGER NOT NULL DEFAULT 0,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,employee_id,location_id,report_date));
CREATE TABLE daily_report_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,report_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision_no INTEGER NOT NULL,snapshot_json TEXT NOT NULL,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO daily_report_revisions(report_id,tenant_id,revision_no,snapshot_json) VALUES('r-old','t',0,'{}'),('r-old','t',0,'{}');`);
db.exec(fs.readFileSync(new URL("../cloudflare/migrations/040_v78_authorization_reporting_concurrency.sql",import.meta.url),"utf8"));
ok(db.prepare("SELECT COUNT(*) c FROM daily_report_revisions WHERE report_id='r-old' AND revision_no=0").get().c===1,"migration deduplicates legacy duplicate revisions");
db.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary,kpi_json,revision_count) VALUES(?,?,?,?,?,?,?,0)").run("r1","t1","e1","l1","2026-09-03","first",'{}');
const win=db.prepare("UPDATE daily_employee_reports SET work_summary=?,revision_count=revision_count+1 WHERE id=? AND revision_count=? RETURNING revision_count").get("second","r1",0);
const lose=db.prepare("UPDATE daily_employee_reports SET work_summary=?,revision_count=revision_count+1 WHERE id=? AND revision_count=? RETURNING revision_count").get("third","r1",0);
ok(win?.revision_count===1,"first report correction wins compare-and-set");
ok(lose===undefined,"stale concurrent report correction loses compare-and-set");
const revs=db.prepare("SELECT revision_no,snapshot_json FROM daily_report_revisions WHERE report_id='r1' ORDER BY revision_no").all();
ok(revs.length===1&&revs[0].revision_no===0&&JSON.parse(revs[0].snapshot_json).workSummary==="first","winning correction atomically captures prior revision once");
let duplicateBlocked=false;try{db.prepare("INSERT INTO daily_report_revisions(report_id,tenant_id,revision_no,snapshot_json) VALUES(?,?,?,?)").run("r1","t1",0,"{}")}catch{duplicateBlocked=true}
ok(duplicateBlocked,"duplicate report revision is rejected by database constraint");
const row={work_summary:"work",wins:"win",blockers:"",incidents:"",next_plan:"next",kpi_json:'{"b":2,"a":1}',needs_attention:1};
ok(__v782157Test.dailyReportPayloadMatches(row,{workSummary:"work",wins:"win",blockers:"",incidents:"",nextPlan:"next",kpis:{a:1,b:2},needsAttention:true}),"identical report payload comparison is stable across JSON key order");
ok(!__v782157Test.dailyReportPayloadMatches(row,{workSummary:"changed",wins:"win",blockers:"",incidents:"",nextPlan:"next",kpis:{a:1,b:2},needsAttention:true}),"changed report payload is not treated as retry");
let capturedSql=[];
const env={SESSION_SECRET:"secret-for-runtime-test",DB:{prepare(sql){capturedSql.push(sql);return{bind(){return{async first(){return {user_id:"u",tenant_id:"t",role:"manager",session_role:"owner",csrf_token:"c"}},async run(){return {success:true}}}}}}}};
const req=new Request("https://example.test/",{headers:{cookie:"bw_session=runtime-token"}});
const auth=await __v782157Test.auth(req,env);
ok(auth?.role==="manager"&&auth?.session_role==="owner","runtime auth returns current membership role instead of stale session role");
ok(capturedSql.some(sql=>sql.includes("m.status='active'")&&sql.includes("m.role")),"runtime auth query enforces active membership and current role");
// Execute the exact production issuance SQL against real SQLite; no deployed writes.
const source=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const route=source.slice(source.indexOf('if(url.pathname==="/api/daily-reporting/access"&&req.method==="POST")'));
const updateSql=route.match(/env\.DB\.prepare\("(UPDATE employee_reporting_access SET status='revoked',last_rotated_at=CURRENT_TIMESTAMP WHERE tenant_id=\? AND employee_id=\? AND location_id=\? AND id=\? AND status='active')"\)/)?.[1];
const insertSql=route.match(/env\.DB\.prepare\("(INSERT INTO employee_reporting_access\(id,tenant_id,employee_id,location_id,token_hash,status,expires_at\) SELECT[^"]+)"\)/)?.[1];
ok(updateSql&&insertSql,"rotation test reads exact worker SQL");
db.exec("CREATE TABLE employees(id TEXT,tenant_id TEXT,status TEXT); CREATE TABLE operating_locations(id TEXT,tenant_id TEXT,active INTEGER);");
db.exec(fs.readFileSync(new URL("../cloudflare/migrations/015_v73_daily_operations_reporting.sql",import.meta.url),"utf8").match(/CREATE TABLE IF NOT EXISTS employee_reporting_access\([\s\S]+?CREATE UNIQUE INDEX IF NOT EXISTS employee_reporting_access_active_uq[^;]+;/)[0]);
db.exec("INSERT INTO employees VALUES('e1','t1','active'),('e2','t2','active'); INSERT INTO operating_locations VALUES('l1','t1',1),('l2','t2',1);");
function issue(expected,next,t="t1",e="e1",l="l1"){
 db.exec("BEGIN");
 try{
  db.prepare(updateSql).run(t,e,l,expected);
  const result=db.prepare(insertSql).run(next,t,e,l,"hash-"+next,"+365 days",expected,t,e,l,t,e,t,l);
  db.exec("COMMIT");return Number(result.changes);
 }catch(err){db.exec("ROLLBACK");throw err}
}
ok(issue(null,"a1")===1,"first link is created once");
ok(issue(null,"a2")===0,"duplicate first issuance cannot replace active link");
ok(issue("a1","a3")===1,"explicit current-link rotation succeeds");
ok(issue("a1","a4")===0,"stale concurrent rotation cannot replace newer link");
db.prepare("UPDATE employee_reporting_access SET status='revoked' WHERE id='a3'").run();
ok(issue("a3","a5")===0,"a stale rotation cannot resurrect access after revocation");
ok(issue(null,"a6","t1","e2","l1")===0,"foreign employee cannot receive a link");
ok(issue(null,"a7","t1","e1","l2")===0,"foreign location cannot receive a link");
ok(issue(null,"a8")===1,"explicit new issuance after revocation succeeds");
db.exec("UPDATE employees SET status='inactive' WHERE id='e1'");
ok(issue("a8","a9")===0,"inactive employee cannot receive replacement access");
console.log(`V78 1.21.57 reporting/auth runtime: ${checks}/${checks} PASS`);
