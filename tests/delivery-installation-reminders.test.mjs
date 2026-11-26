import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validDate,daysUntilDelivery,scheduleFieldsFromInput,scheduleEntriesFromInput,parseReportSchedules,MAX_REPORT_JOBS,MAX_OVERDUE_DAYS,dueRemindersFromRows,dueDeliveryReminders} from "../cloudflare/src/delivery-installation-reminders.js";

test("Botswana calendar day window is inclusive D-4 to due date",()=>{
  assert.equal(daysUntilDelivery("2026-11-19","2026-11-15"),4);
  assert.equal(daysUntilDelivery("2026-11-15","2026-11-15"),0);
  assert.equal(daysUntilDelivery("2026-11-14","2026-11-15"),-1);
  assert.equal(validDate("2026-02-30"),false);
  assert.equal(validDate("2028-02-29"),true);
  assert.equal(validDate("2026-2-1"),false);
});
test("partial, malformed and unsupported job data fail closed",()=>{
  assert.deepEqual(scheduleFieldsFromInput({}).fields,{});
  assert.equal(scheduleFieldsFromInput({jobReference:"ABC"}).error,"delivery_or_installation_type_required");
  assert.equal(scheduleFieldsFromInput({jobReference:"ABC",jobType:"installation"}).error,"valid_delivery_installation_date_required");
  assert.equal(scheduleFieldsFromInput({jobReference:"ABC",jobType:"installation",scheduledDate:"2026-02-30"}).error,"valid_delivery_installation_date_required");
  assert.equal(scheduleFieldsFromInput({jobReference:"ABC",jobType:"delivery",scheduledDate:"2026-11-19",jobStatus:"deleted"}).error,"invalid_delivery_installation_status");
  assert.equal(scheduleFieldsFromInput({jobReference:"ABC|other",jobType:"installation",scheduledDate:"2026-11-19"}).error,"invalid_delivery_job_reference");
  assert.equal(scheduleFieldsFromInput({jobReference:"LT-1204",jobType:"installation",scheduledDate:"2026-11-19",jobStatus:"completed"}).fields.jobStatus,"completed");
});
const row=(id,jobReference,scheduledDate,jobStatus="scheduled",location_id="l1",employee_id="e1")=>({
  id,employee_id,location_id,full_name:"Synthetic employee",location_name:"Synthetic location",
  kpi_json:JSON.stringify({jobReference,jobType:"installation",scheduledDate,jobStatus})
});
test("only upcoming scheduled jobs appear; latest completion suppresses old reminders",()=>{
  const rows=[
    row("new-complete","LT-11","2026-11-19","completed"),
    row("old-scheduled","LT-11","2026-11-19"),
    row("next-4","LT-12","2026-11-19"),
    row("due-today","LT-13","2026-11-15"),
    row("too-late","LT-14","2026-11-20"),
    row("past","LT-15","2026-11-14"),
    row("other-reporter","LT-12","2026-11-19","scheduled","l1","e2")
  ];
  const due=dueRemindersFromRows(rows,"2026-11-15");
  assert.equal(due.length,4);
  assert.deepEqual(due.map(x=>x.jobReference),["LT-15","LT-13","LT-12","LT-12"]);
  assert.deepEqual(due.map(x=>x.daysUntil),[-1,0,4,4]);
  assert.ok(due.every(x=>x.sourceReportId&&x.locationId));
});
test("D1 query scopes tenant and optionally exact reporter and location before reading rows",async()=>{
  let query="",args=[];
  const env={DB:{prepare(sql){query=sql;return {bind(...values){args=values;return {async all(){return {results:[row("r1","LT-12","2026-11-19")]}}}}}}}};
  const due=await dueDeliveryReminders(env,{tenantId:"tenant-A",employeeId:"e1",locationId:"l1",today:"2026-11-15"});
  assert.equal(due.length,1);
  assert.ok(query.includes("r.tenant_id=?")&&query.includes("r.employee_id=?")&&query.includes("r.location_id=?"));
  assert.deepEqual(args,["tenant-A","2026-11-15","2026-11-15","e1","e1","l1","l1"]);
});
test("invalid tenant/date never query D1",async()=>{
  let called=false;
  const env={DB:{prepare(){called=true;throw Error("must not query")}}};
  assert.deepEqual(await dueDeliveryReminders(env,{tenantId:"",today:"2026-11-15"}),[]);
  assert.deepEqual(await dueDeliveryReminders(env,{tenantId:"t",today:"invalid"}),[]);
  assert.equal(called,false);
});

test("multi-job daily report supports eight distinct jobs, rejects ambiguous or oversized requests",()=>{
  const a={jobReference:"LT-101",jobType:"delivery",scheduledDate:"2026-11-19",jobStatus:"scheduled"};
  const b={jobReference:"LT-102",jobType:"installation",scheduledDate:"2026-11-20",jobStatus:"scheduled"};
  const valid=scheduleEntriesFromInput({jobs:[a,b]});
  assert.deepEqual(valid.fields.jobs,[a,b]);
  assert.equal(valid.entries.length,2);
  assert.deepEqual(scheduleEntriesFromInput({jobs:[a]}).fields,a,"single job remains flat for backward compatibility");
  assert.deepEqual(scheduleEntriesFromInput({jobReference:"LT-101",jobType:"delivery",scheduledDate:"2026-11-19"}).entries[0].jobStatus,"scheduled");
  assert.equal(scheduleEntriesFromInput({jobs:Array(MAX_REPORT_JOBS+1).fill(a)}).error,"invalid_delivery_jobs");
  assert.equal(scheduleEntriesFromInput({jobs:"not an array"}).error,"invalid_delivery_jobs");
  assert.equal(scheduleEntriesFromInput({jobs:[a,{...a,jobReference:"lt-101"}]}).error,"duplicate_delivery_job");
  assert.equal(scheduleEntriesFromInput({jobs:[{}]}).error,"incomplete_delivery_job");
  assert.equal(scheduleEntriesFromInput({jobs:[a],jobReference:a.jobReference}).error,"conflicting_delivery_job_formats");
  assert.equal(scheduleEntriesFromInput({jobs:[a,{...a,jobType:"installation"}]}).entries.length,2,"distinct job types may share a reference");
  assert.equal(scheduleEntriesFromInput({jobs:[]}).entries.length,0);
  assert.equal(scheduleEntriesFromInput({jobs:[a,{...b,scheduledDate:"2026-02-30"}]}).error,"valid_delivery_installation_date_required");
});

test("multiple reminder jobs are independent; newer completion and rescheduling override older rows",()=>{
  const earlier={id:"older",employee_id:"employee-A",location_id:"branch-A",full_name:"Test reporter",location_name:"Test branch",
    kpi_json:JSON.stringify({jobs:[
      {jobReference:"LT-101",jobType:"installation",scheduledDate:"2026-11-19",jobStatus:"scheduled"},
      {jobReference:"LT-102",jobType:"delivery",scheduledDate:"2026-11-18",jobStatus:"scheduled"},
      {jobReference:"LT-103",jobType:"installation",scheduledDate:"2026-11-19",jobStatus:"scheduled"}
    ]})};
  const newer={...earlier,id:"newer",kpi_json:JSON.stringify({jobs:[
    {jobReference:"LT-101",jobType:"installation",scheduledDate:"2026-11-19",jobStatus:"completed"},
    {jobReference:"LT-102",jobType:"delivery",scheduledDate:"2026-11-20",jobStatus:"scheduled"}
  ]})};
  const reminders=dueRemindersFromRows([newer,earlier],"2026-11-15");
  assert.deepEqual(reminders.map(x=>x.jobReference),["LT-103"]);
  assert.deepEqual(parseReportSchedules(earlier.kpi_json).map(x=>x.jobReference),["LT-101","LT-102","LT-103"]);
});

test("overdue reminders stop after seven days and never resurrect cancelled work",()=>{
  assert.equal(MAX_OVERDUE_DAYS,7);
  const reminders=dueRemindersFromRows([
    row("late7","LT-7","2026-11-08"),
    row("late8","LT-8","2026-11-07"),
    row("later-cancelled","LT-9","2026-11-12","cancelled"),
    row("older-scheduled","LT-9","2026-11-12","scheduled")
  ],"2026-11-15");
  assert.deepEqual(reminders.map(x=>x.jobReference),["LT-7"]);
  assert.equal(reminders[0].urgency,"overdue");
  assert.equal(reminders[0].daysUntil,-7);
});

test("multi-job portal, manager and API are wired without changing token or role scope",()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
  const html=read("../public/report/index.html");
  const browser=read("../public/js/employee-reporting-portal.js");
  const manager=read("../public/js/delivery-reminders-manager.js");
  const worker=read("../cloudflare/src/worker.js");
  assert.match(html,/id="reporterJobs"/);
  assert.match(html,/id="reporterAddJob"/);
  assert.match(html,/id="reporterQualityGuide"/);
  assert.match(html,/data-job-field="scheduledDate"/);
  assert.match(browser,/function restoreCurrentJobs\(/);
  assert.match(browser,/function restoreTodayDraft\(/);
  assert.match(worker,/currentReportDraft:ownToday\?/);
  assert.match(browser,/function collectReportJobs\(/);
  assert.match(browser,/function selectReminderJob\(/);
  assert.match(browser,/payload\.kpis\.jobs=scheduled\.jobs/);
  assert.match(manager,/Overdue/);
  assert.match(worker,/const inputKpis=staff&&body\.kpis===undefined\?safeJson\(existing\?\.kpi_json,\{\}\):body\?\.kpis/);
  assert.match(worker,/const scheduleValidation=scheduleEntriesFromInput\(inputKpis\)/);
  assert.match(worker,/currentReportJobs:parseReportSchedules\(ownToday\?\.kpi_json\)/);
  assert.match(worker,/tenant_id=\? AND employee_id=\? AND location_id=\? AND report_date=\?/);
  assert.match(worker,/roleAllowed\(a,"owner","manager"\)/);
});
