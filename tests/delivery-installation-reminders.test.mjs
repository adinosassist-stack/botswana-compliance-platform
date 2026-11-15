import test from "node:test";
import assert from "node:assert/strict";
import {validDate,daysUntilDelivery,scheduleFieldsFromInput,dueRemindersFromRows,dueDeliveryReminders} from "../cloudflare/src/delivery-installation-reminders.js";

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
  assert.equal(due.length,3);
  assert.deepEqual(due.map(x=>x.jobReference),["LT-13","LT-12","LT-12"]);
  assert.deepEqual(due.map(x=>x.daysUntil),[0,4,4]);
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
