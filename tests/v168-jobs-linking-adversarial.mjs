import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {execFileSync} from "node:child_process";

for(const path of ["cloudflare/src/jobs-linking.js","cloudflare/src/worker.js","cloudflare/src/agentic-entry.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}
const migration=fs.readFileSync("cloudflare/migrations/059_v168_jobs_linking.sql","utf8");
const jobs=fs.readFileSync("cloudflare/src/jobs-linking.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260926c.js","utf8");
const delegated=fs.readFileSync("public/js/event-delegation.js","utf8");

for(const table of ["job_openings","job_applications"])assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
assert.match(migration,/public_token_hash TEXT NOT NULL UNIQUE/);
assert.match(migration,/UNIQUE\(tenant_id,job_id,contact_hash\)/);
assert.match(migration,/job_applications_tenant_guard/);
assert.match(migration,/job_applications_open_guard/);
assert.match(migration,/SELECT RAISE\(ABORT,'job_opening_tenant_mismatch'\)/);
assert.match(migration,/SELECT RAISE\(ABORT,'job_opening_not_accepting_applications'\)/);

assert.match(jobs,/PUBLIC_JOB_TOKEN_RE/);
assert.match(jobs,/public_token_hash/);
assert.match(jobs,/publicLinkShownOnce:true/);
assert.match(jobs,/aiCandidateScoring:false/);
assert.match(jobs,/automaticHiring:false/);
assert.match(jobs,/employeeAccessOnHire:false/);
assert.match(jobs,/employeeRecordCreated:false/);
assert.match(jobs,/workspaceAccessGranted:false/);
assert.doesNotMatch(jobs,/scoreCandidate|rankCandidate|candidateScore|automaticHire/i);
assert.doesNotMatch(jobs,/INSERT INTO employees/i);
assert.doesNotMatch(jobs,/employee_reporting_access/i);
assert.match(worker,/handlePublicJobsRequest/);
assert.match(worker,/handleJobsRequest/);
assert.ok(worker.indexOf("handlePublicJobsRequest({request:req,url,env")<worker.indexOf('if(url.pathname.startsWith("/api/"))'),"public application handler must execute before workspace auth barrier");

assert.ok(html.includes('id="peopleJobsDetails"'));
assert.ok(html.includes("No AI candidate ranking"));
assert.ok(html.includes("Hiring does not create access"));
assert.ok(html.includes("No CV upload in this release"));
for(const fn of ["createJobOpening","rotateJobPublicLink","closeJobOpening","loadJobApplications","setJobApplicationStatus","renderJobsLinking"]){
  assert.ok(runtime.includes("function "+fn)||runtime.includes("async function "+fn),`runtime missing ${fn}`);
  assert.ok(delegated.includes("'"+fn+"'"),`delegated action missing ${fn}`);
}
assert.ok(html.includes("function openJobsPanel()")&&runtime.includes("function openJobsPanel()"));
assert.ok(html.includes('run("peopleops",renderJobsLinking)')&&runtime.includes('run("peopleops",renderJobsLinking)'));

const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON; CREATE TABLE tenants(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY);");
db.exec("INSERT INTO tenants(id) VALUES('t1'),('t2'); INSERT INTO users(id) VALUES('u1');");
db.exec(migration);
db.prepare("INSERT INTO job_openings(id,tenant_id,title,public_token_hash,created_by_user_id) VALUES(?,?,?,?,?)").run("j1","t1","Sales","h1","u1");
db.prepare("INSERT INTO job_applications(id,tenant_id,job_id,full_name,contact_type,contact_value,contact_hash,summary) VALUES(?,?,?,?,?,?,?,?)").run("a1","t1","j1","Applicant","email","a@example.org","c1","Relevant experience and availability.");
assert.throws(()=>db.prepare("INSERT INTO job_applications(id,tenant_id,job_id,full_name,contact_type,contact_value,contact_hash,summary) VALUES(?,?,?,?,?,?,?,?)").run("a2","t2","j1","Wrong tenant","email","b@example.org","c2","Relevant experience and availability."),/job_opening_tenant_mismatch/);
assert.throws(()=>db.prepare("INSERT INTO job_applications(id,tenant_id,job_id,full_name,contact_type,contact_value,contact_hash,summary) VALUES(?,?,?,?,?,?,?,?)").run("a3","t1","j1","Duplicate","email","a@example.org","c1","Different summary but same applicant."),/UNIQUE/);
db.exec("UPDATE job_openings SET status='closed' WHERE id='j1';");
assert.throws(()=>db.prepare("INSERT INTO job_applications(id,tenant_id,job_id,full_name,contact_type,contact_value,contact_hash,summary) VALUES(?,?,?,?,?,?,?,?)").run("a4","t1","j1","Late","email","late@example.org","c4","Relevant experience and availability."),/job_opening_not_accepting_applications/);
db.close();

console.log("v168 Jobs linking privacy + authority checks passed");
