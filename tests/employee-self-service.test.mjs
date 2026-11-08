import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {staffPortalEnabled,staffEmail,staffPasswordValid,staffTaskInput,staffTaskTransition,staffDueDate} from "../cloudflare/src/employee-self-service-policy.js";
import {handleStaffPublic,handleStaffManager} from "../cloudflare/src/employee-self-service.js";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const mkJson=(data,status=200)=>({status,data});
const uuid="e1212345-aaaa-4bee-8bbb-1234567890ab";

test("feature is strictly opt-in and does not grant workspace access",async()=>{
 assert.equal(staffPortalEnabled({}),false);
 assert.equal(staffPortalEnabled({THEBE_STAFF_PORTAL_ENABLED:"1"}),false);
 assert.equal(staffPortalEnabled({THEBE_STAFF_PORTAL_ENABLED:"true"}),true);
 const url=new URL("https://example.test/public/employee/tasks");
 const req=new Request(url);
 const blocked=await handleStaffPublic({request:req,url,env:{DB:{prepare(){throw Error("must not touch db")}}},json:mkJson});
 assert.equal(blocked.status,404);
 const adminUrl=new URL("https://example.test/api/employee-self-service/tasks");
 const blockedAdmin=await handleStaffManager({request:new Request(adminUrl),url:adminUrl,env:{},json:mkJson});
 assert.equal(blockedAdmin.status,404);
 const forbidden=await handleStaffManager({request:new Request(adminUrl),url:adminUrl,env:{THEBE_STAFF_PORTAL_ENABLED:"true",DB:{prepare(){throw Error("must not touch db")}}},auth:{role:"auditor"},json:mkJson});
 assert.equal(forbidden.status,403);
});
test("task transitions require correct actor and manager approval",()=>{
 assert.equal(staffTaskTransition("employee","assigned","start"),"in_progress");
 assert.equal(staffTaskTransition("employee","in_progress","submit"),"submitted");
 assert.equal(staffTaskTransition("employee","submitted","approve"),null);
 assert.equal(staffTaskTransition("employee","assigned","submit"),null);
 assert.equal(staffTaskTransition("manager","submitted","approve"),"completed");
 assert.equal(staffTaskTransition("manager","submitted","return"),"in_progress");
 assert.equal(staffTaskTransition("manager","assigned","approve"),null);
 assert.equal(staffTaskTransition("manager","completed","return"),null);
});
test("invitation and assignment inputs are bounded",()=>{
 assert.equal(staffEmail("  EXAMPLE@COMPANY.CO.BW "),"example@company.co.bw");
 assert.equal(staffEmail("name@invalid"),null);
 assert.equal(staffPasswordValid("short"),false);
 assert.equal(staffPasswordValid("a".repeat(12)),true);
 assert.equal(staffPasswordValid("a".repeat(129)),false);
 assert.equal(staffDueDate("2026-02-29"),false);
 assert.equal(staffDueDate("2028-02-29"),"2028-02-29");
 assert.deepEqual(staffTaskInput({employeeId:uuid,title:"  Install monument  ",priority:1,dueDate:"2026-11-21"}),{employeeId:uuid,title:"Install monument",detail:"",priority:1,dueDate:"2026-11-21"});
 assert.equal(staffTaskInput({employeeId:uuid,title:"x",priority:1}),null);
 assert.equal(staffTaskInput({employeeId:uuid,title:"Good title",detail:"a".repeat(1501)}),null);
 assert.equal(staffTaskInput({employeeId:uuid,title:"Good title",priority:0}),null);
});
test("DB and route security boundaries are explicit",()=>{
 const schema=read("cloudflare/migrations/20261108_employee_self_service.sql");
 for(const table of ["employee_portal_accounts","employee_portal_invites","employee_portal_sessions","employee_portal_tasks","employee_portal_task_events"])assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS "+table+"("),table);
 assert.match(schema,/UNIQUE\(tenant_id,employee_id\)/);
 assert.match(schema,/token_hash TEXT NOT NULL UNIQUE/);
 assert.match(schema,/last_transition_id TEXT/);
 assert.match(schema,/CHECK\(status IN \('assigned','in_progress','submitted','completed'\)\)/);
 const worker=read("cloudflare/src/worker.js");
 assert.match(worker,/handleStaffPublic\(\{request:req,url,env,json,readJson,requestOriginAllowed,edgeScopedRateLimit,rateLimitResponse,id\}\)/);
 assert.match(worker,/handleStaffManager\(\{request:req,url,env,auth:a,json,readJson,id\}\)/);
 assert.match(worker,/const WORKSPACE_SESSION_ROLES=new Set\(\["owner","manager","reviewer","auditor"\]\)/);
 const backend=read("cloudflare/src/employee-self-service.js");
 assert.match(backend,/SameSite=Strict; Max-Age=43200/);
 assert.match(backend,/s\.expires_at>CURRENT_TIMESTAMP/);
 assert.match(backend,/a\.tenant_id=\? AND a\.email=\?/);
 assert.match(backend,/WHERE tenant_id=\? AND employee_id=\?/);
 assert.match(backend,/isCsrfValid\(request,staff\)/);
 assert.match(backend,/last_transition_id=\?/);
 assert.doesNotMatch(backend,/localStorage|sessionStorage|eval\(/);
 const inventory=JSON.parse(read("cloudflare/config/route-security-policy.json"));
 assert.ok(inventory.preAuthRoutes.some(x=>x.pattern==="/public/employee/login"));
 assert.ok(inventory.workspaceFeaturePrefixes.employees_hr.includes("/api/employee-self-service"));
});
test("employee portal renders text without injecting untrusted HTML",()=>{
 const portal=read("public/js/employee-self-service-portal.js");
 const manager=read("public/js/employee-self-service-manager.js");
 const html=read("public/staff/index.html");
 for(const js of [portal,manager]){
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.doesNotMatch(js,/eval\(/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
 }
 assert.match(html,/id="staffInviteForm"/);
 assert.match(html,/id="staffDashboard"/);
 assert.match(portal,/refreshTasks\(/);
 assert.match(manager,/Create 48-hour invitation/);
 assert.match(manager,/Approve completed work/);
});
